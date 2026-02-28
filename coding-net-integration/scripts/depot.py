#!/usr/bin/env python3
"""Coding.net Git Repository Management — Depots, Branches, MRs, Commits, Files.

Usage via unified CLI:
  ./coding depot list --project 12345
  ./coding depot branches --depot-id 123
  ./coding depot tags --depot-id 123
  ./coding depot commits --depot-id 123 [--ref dev] [--page-size 10]
  ./coding depot commit-info --depot-id 123 --sha abc123
  ./coding depot tree --depot-id 123 [--path src] [--ref dev]
  ./coding depot file --depot-id 123 --path README.md [--ref dev]
  ./coding depot commit-files --depot-id 123 --ref feature/x --message "fix: ..." --create path=content
  ./coding depot create-branch --depot-id 123 --branch feature/x [--start-point dev]
  ./coding depot delete-branch --depot-id 123 --branch feature/x
  ./coding depot mr-list --project my-project [--status open]
  ./coding depot mr-create --depot-id 123 --title "..." --src feature/x [--dst dev]
  ./coding depot mr-detail --depot-id 123 --iid 1
  ./coding depot mr-merge --depot-id 123 --merge-id 1 [--delete-branch]
  ./coding depot mr-close --depot-id 123 --merge-id 1
"""

import argparse
import base64
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from coding_api import CodingClient, Log, output

# ─── Branch Convention Detection ─────────────────────────────────────────────

# Priority order: lowest-level integration branch first
_INTEGRATION_BRANCHES = ["dev", "develop", "test", "staging", "release", "main", "master"]
_PROTECTED_BRANCHES = frozenset({"master", "main"})


def _detect_target_branch(client: CodingClient, depot_id: int) -> str:
    """Detect the lowest-level integration branch in a repo.

    Resolution: dev > develop > test > staging > release > main > master > default.
    """
    result = client.call("DescribeGitBranches", {"DepotId": depot_id})
    branches = result.get("Branches", [])
    if not branches:
        Log.error("无法获取分支列表，无法进行安全检查")
        sys.exit(1)

    branch_names = {b["BranchName"] for b in branches}
    default_branch = next(
        (b["BranchName"] for b in branches if b.get("IsDefaultBranch")), "master"
    )

    for candidate in _INTEGRATION_BRANCHES:
        if candidate in branch_names:
            return candidate

    return default_branch


def _enforce_mr_target(client: CodingClient, depot_id: int, requested_dst: str):
    """Block MR to protected branches when a lower-level branch exists."""
    target = _detect_target_branch(client, depot_id)

    if requested_dst in _PROTECTED_BRANCHES and target not in _PROTECTED_BRANCHES:
        Log.error(f"⛔ 安全拒绝: 禁止向 '{requested_dst}' 提交 MR")
        Log.error(f"   检测到更低级别的集成分支 '{target}' 存在")
        Log.error(f"   请使用: --dst {target}")
        sys.exit(1)

    if requested_dst != target:
        Log.warn(f"目标分支 '{requested_dst}' 非推荐的最低级集成分支 '{target}'")
        Log.warn(f"如非必要，建议使用: --dst {target}")


# ─── Commands ────────────────────────────────────────────────────────────────

def cmd_list(client: CodingClient, args):
    """List depots in a project."""
    result = client.call("DescribeProjectDepots", {
        "ProjectId": args.project,
        "DepotType": args.type or "CODING",
    })
    output(result)


def cmd_branches(client: CodingClient, args):
    """List branches of a depot."""
    body = {"DepotId": args.depot_id}
    if args.keyword:
        body["KeyWord"] = args.keyword
    result = client.call("DescribeGitBranches", body)
    output(result)


def cmd_tags(client: CodingClient, args):
    """List tags of a depot."""
    result = client.call("DescribeGitTags", {"DepotId": args.depot_id})
    output(result)


def cmd_commits(client: CodingClient, args):
    """List recent commits."""
    body = {"DepotId": args.depot_id}
    if args.ref:
        body["Ref"] = args.ref
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeGitCommits", body)
    output(result)


def cmd_commit_info(client: CodingClient, args):
    """Get commit details by SHA."""
    result = client.call("DescribeGitCommitInfo", {
        "DepotId": args.depot_id,
        "Sha": args.sha,
    })
    output(result)


def cmd_tree(client: CodingClient, args):
    """List files/dirs in a path."""
    result = client.call("DescribeGitTree", {
        "DepotId": args.depot_id,
        "Path": args.path,
        "Ref": args.ref,
    })
    output(result)


def cmd_file(client: CodingClient, args):
    """Get file content (base64 encoded)."""
    result = client.call("DescribeGitFile", {
        "DepotId": args.depot_id,
        "Path": args.path,
        "Ref": args.ref,
    })
    output(result)


def cmd_commit_files(client: CodingClient, args):
    """Commit file changes via API (create/update/delete).

    --create path=content: create or overwrite file (content as text, auto base64)
    --delete path: delete file
    """
    git_files = []

    for spec in (args.create or []):
        parts = spec.split("=", 1)
        if len(parts) != 2:
            Log.error(f"Invalid --create format: {spec} (expected path=content)")
            sys.exit(1)
        path, content = parts
        encoded = base64.b64encode(content.encode("utf-8")).decode()
        git_files.append({"Path": path, "Content": encoded, "Op": "createFile"})

    for path in (args.delete or []):
        git_files.append({"Path": path, "Op": "deleteFile"})

    if not git_files:
        Log.error("至少需要一个 --create 或 --delete 操作")
        sys.exit(1)

    result = client.call("ModifyGitFiles", {
        "DepotId": args.depot_id,
        "Ref": args.ref,
        "Message": args.message,
        "GitFiles": git_files,
    })
    output(result)


def cmd_create_branch(client: CodingClient, args):
    """Create a new branch. Auto-detects start-point if omitted."""
    start_point = args.start_point
    if not start_point:
        start_point = _detect_target_branch(client, args.depot_id)
        Log.info(f"自动选择起点分支: {start_point}")

    result = client.call("CreateGitBranch", {
        "DepotId": args.depot_id,
        "BranchName": args.branch,
        "StartPoint": start_point,
    })
    output(result)


def cmd_delete_branch(client: CodingClient, args):
    """Delete a branch."""
    result = client.call("DeleteGitBranch", {
        "DepotId": args.depot_id,
        "BranchName": args.branch,
    })
    output(result)


def cmd_mr_list(client: CodingClient, args):
    """List merge requests."""
    body = {"ProjectName": args.project}
    if args.depot:
        body["DepotName"] = args.depot
    if args.status:
        body["Status"] = args.status
    if args.page:
        body["PageNumber"] = args.page
    if args.page_size:
        body["PageSize"] = args.page_size
    result = client.call("DescribeProjectMergeRequests", body)
    output(result)


def cmd_mr_create(client: CodingClient, args):
    """Create MR with branch convention enforcement. Auto-detects --dst if omitted."""
    dst = args.dst
    if not dst:
        dst = _detect_target_branch(client, args.depot_id)
        Log.info(f"自动选择目标分支: {dst}")
    else:
        _enforce_mr_target(client, args.depot_id, dst)

    body = {
        "DepotId": args.depot_id,
        "SrcBranch": args.src,
        "DestBranch": dst,
        "Title": args.title,
    }
    if args.content:
        body["Content"] = args.content
    if args.reviewers:
        body["ReviewerIds"] = [int(r) for r in args.reviewers.split(",")]
    result = client.call("CreateGitMergeRequest", body)
    output(result)


def cmd_mr_detail(client: CodingClient, args):
    """Get merge request details."""
    result = client.call("DescribeMergeRequest", {
        "DepotId": args.depot_id,
        "IId": args.iid,
    })
    output(result)


def cmd_mr_merge(client: CodingClient, args):
    """Merge a merge request."""
    body = {
        "DepotId": args.depot_id,
        "MergeId": args.merge_id,
    }
    if args.message:
        body["CommitMessage"] = args.message
    if args.delete_branch:
        body["DeleteSourceBranch"] = True
    result = client.call("ModifyMergeMR", body)
    output(result)


def cmd_mr_close(client: CodingClient, args):
    """Close a merge request."""
    result = client.call("ModifyCloseMR", {
        "DepotId": args.depot_id,
        "MergeId": args.merge_id,
    })
    output(result)


def cmd_mr_diff(client: CodingClient, args):
    """Get file diff for a merge request (code review core)."""
    result = client.call("DescribeMergeRequestFileDiff", {
        "DepotId": args.depot_id,
        "MergeId": args.merge_id,
    })
    output(result)


def cmd_commit_diff(client: CodingClient, args):
    """Get diff of a specific commit."""
    body = {
        "DepotId": args.depot_id,
        "Sha": args.sha,
    }
    if args.path:
        body["Path"] = args.path
    result = client.call("DescribeGitCommitDiff", body)
    output(result)


def cmd_mr_comments(client: CodingClient, args):
    """Get comments/notes on a merge request."""
    result = client.call("DescribeSingeMergeRequestNotes", {
        "DepotPath": args.depot_path,
        "MergeId": args.merge_id,
    })
    output(result)


def cmd_mr_comment(client: CodingClient, args):
    """Post a comment on a merge request."""
    result = client.call("CreateMergeRequestNote", {
        "DepotPath": args.depot_path,
        "MergeId": args.merge_id,
        "Content": args.content,
        "ParentId": args.parent_id or 0,
    })
    output(result)


def cmd_mr_update(client: CodingClient, args):
    """Update MR title and/or description."""
    body = {
        "DepotId": args.depot_id,
        "MergeId": args.merge_id,
    }
    if args.title:
        body["Title"] = args.title
    if args.content:
        body["Content"] = args.content
    result = client.call("ModifyGitMergeRequest", body)
    output(result)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(prog="coding depot", description="Git repository management")
    sub = parser.add_subparsers(dest="command", required=True)

    # list
    p = sub.add_parser("list", help="List project depots")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--type", default="CODING", help="Depot type (CODING/GITHUB/...)")

    # branches
    p = sub.add_parser("branches", help="List branches")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--keyword", help="Filter keyword")

    # tags
    p = sub.add_parser("tags", help="List tags")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")

    # commits
    p = sub.add_parser("commits", help="List commits")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--ref", help="Branch/tag ref")
    p.add_argument("--page-size", type=int, help="Max results per page")
    p.add_argument("--page", type=int, help="Page number")

    # commit-info
    p = sub.add_parser("commit-info", help="Get commit info by SHA")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--sha", required=True, help="Commit SHA")

    # tree
    p = sub.add_parser("tree", help="List files in path")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--path", default="", help="Path (default: root)")
    p.add_argument("--ref", default="master", help="Branch/tag ref")

    # file
    p = sub.add_parser("file", help="Get file content (base64)")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--path", required=True, help="File path")
    p.add_argument("--ref", default="master", help="Branch/tag ref")

    # commit-files
    p = sub.add_parser("commit-files", help="Commit file changes via API")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--ref", required=True, help="Target branch")
    p.add_argument("--message", required=True, help="Commit message")
    p.add_argument("--create", action="append", metavar="PATH=CONTENT", help="Create/update file (repeatable)")
    p.add_argument("--delete", action="append", metavar="PATH", help="Delete file (repeatable)")

    # create-branch
    p = sub.add_parser("create-branch", help="Create branch (auto-detects start-point)")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--branch", required=True, help="Branch name")
    p.add_argument("--start-point", help="Start point (auto-detects if omitted)")

    # delete-branch
    p = sub.add_parser("delete-branch", help="Delete branch")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--branch", required=True, help="Branch name")

    # mr-list
    p = sub.add_parser("mr-list", help="List merge requests")
    p.add_argument("--project", required=True, help="Project name")
    p.add_argument("--depot", help="Depot name (optional)")
    p.add_argument("--status", help="Filter: open/closed/merged")
    p.add_argument("--page", type=int, help="Page number")
    p.add_argument("--page-size", type=int, help="Page size")

    # mr-create
    p = sub.add_parser("mr-create", help="Create MR (auto-detects target branch)")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--title", required=True, help="MR title")
    p.add_argument("--src", required=True, help="Source branch")
    p.add_argument("--dst", help="Target branch (auto-detects if omitted)")
    p.add_argument("--content", help="MR description")
    p.add_argument("--reviewers", help="Reviewer IDs (comma-separated)")

    # mr-detail
    p = sub.add_parser("mr-detail", help="Get MR detail")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--iid", required=True, type=int, help="MR IId (number)")

    # mr-merge
    p = sub.add_parser("mr-merge", help="Merge a MR")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--merge-id", required=True, type=int, help="Merge request ID")
    p.add_argument("--message", help="Commit message")
    p.add_argument("--delete-branch", action="store_true", help="Delete source branch after merge")

    # mr-close
    p = sub.add_parser("mr-close", help="Close a MR")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--merge-id", required=True, type=int, help="Merge request ID")

    # mr-diff (code review)
    p = sub.add_parser("mr-diff", help="Get MR file diff (code review)")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--merge-id", required=True, type=int, help="Merge request ID")

    # commit-diff
    p = sub.add_parser("commit-diff", help="Get diff of a commit")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--sha", required=True, help="Commit SHA")
    p.add_argument("--path", help="Filter to specific file path")

    # mr-comments
    p = sub.add_parser("mr-comments", help="Get MR comments")
    p.add_argument("--depot-path", required=True, help="Depot path: team/project/depot")
    p.add_argument("--merge-id", required=True, type=int, help="MR IId")

    # mr-comment (post)
    p = sub.add_parser("mr-comment", help="Post a comment on MR")
    p.add_argument("--depot-path", required=True, help="Depot path: team/project/depot")
    p.add_argument("--merge-id", required=True, type=int, help="MR IId")
    p.add_argument("--content", required=True, help="Comment content")
    p.add_argument("--parent-id", type=int, default=0, help="Parent comment ID (0 for top-level)")

    # mr-update
    p = sub.add_parser("mr-update", help="Update MR title/description")
    p.add_argument("--depot-id", required=True, type=int, help="Depot ID")
    p.add_argument("--merge-id", required=True, type=int, help="Merge request ID")
    p.add_argument("--title", help="New title")
    p.add_argument("--content", help="New description")

    args = parser.parse_args()
    client = CodingClient()

    dispatch = {
        "list": cmd_list,
        "branches": cmd_branches,
        "tags": cmd_tags,
        "commits": cmd_commits,
        "commit-info": cmd_commit_info,
        "tree": cmd_tree,
        "file": cmd_file,
        "commit-files": cmd_commit_files,
        "create-branch": cmd_create_branch,
        "delete-branch": cmd_delete_branch,
        "mr-list": cmd_mr_list,
        "mr-create": cmd_mr_create,
        "mr-detail": cmd_mr_detail,
        "mr-merge": cmd_mr_merge,
        "mr-close": cmd_mr_close,
        "mr-diff": cmd_mr_diff,
        "commit-diff": cmd_commit_diff,
        "mr-comments": cmd_mr_comments,
        "mr-comment": cmd_mr_comment,
        "mr-update": cmd_mr_update,
    }

    dispatch[args.command](client, args)


if __name__ == "__main__":
    main()
