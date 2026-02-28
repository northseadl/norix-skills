#!/usr/bin/env python3
"""Coding.net Artifact Repository Management — Repos, Packages, Versions.

Usage via unified CLI:
  ./coding artifact repos --project 12345 [--type docker]
  ./coding artifact create-repo --project 12345 --name my-docker --type docker
  ./coding artifact packages --project 12345 --repo my-docker
  ./coding artifact versions --project 12345 --repo my-docker --pkg my-app
  ./coding artifact download-url --project 12345 --repo Y --pkg Z --version V
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from coding_api import CodingClient, Log, output


def cmd_repos(client: CodingClient, args):
    """List artifact repositories."""
    body = {"ProjectId": args.project}
    if args.type:
        body["Type"] = args.type
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeArtifactRepositoryList", body)
    output(result)


def cmd_create_repo(client: CodingClient, args):
    """Create an artifact repository."""
    body = {
        "ProjectId": args.project,
        "Name": args.name,
        "Type": args.type,
    }
    if args.description:
        body["Description"] = args.description
    result = client.call("CreateArtifactRepository", body)
    output(result)


def cmd_packages(client: CodingClient, args):
    """List packages in a repository."""
    body = {
        "ProjectId": args.project,
        "Repository": args.repo,
    }
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeArtifactPackageList", body)
    output(result)


def cmd_versions(client: CodingClient, args):
    """List versions of a package."""
    body = {
        "ProjectId": args.project,
        "Repository": args.repo,
        "Package": args.pkg,
    }
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeArtifactVersionList", body)
    output(result)


def cmd_download_url(client: CodingClient, args):
    """Get download URL for a version."""
    result = client.call("DescribeArtifactFileDownloadUrl", {
        "ProjectId": args.project,
        "Repository": args.repo,
        "Package": args.pkg,
        "Version": args.version,
    })
    output(result)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(prog="coding artifact", description="Artifact repository management")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("repos", help="List artifact repositories")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--type", help="Filter by type (docker/maven/npm/...)")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("create-repo", help="Create artifact repository")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--name", required=True, help="Repository name")
    p.add_argument("--type", required=True, help="Type (docker/maven/npm/pypi/helm/generic)")
    p.add_argument("--description", help="Description")

    p = sub.add_parser("packages", help="List packages")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--repo", required=True, help="Repository name")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("versions", help="List versions")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--repo", required=True, help="Repository name")
    p.add_argument("--pkg", required=True, help="Package name")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("download-url", help="Get download URL")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--repo", required=True, help="Repository name")
    p.add_argument("--pkg", required=True, help="Package name")
    p.add_argument("--version", required=True, help="Version")

    args = parser.parse_args()
    client = CodingClient()

    dispatch = {
        "repos": cmd_repos,
        "create-repo": cmd_create_repo,
        "packages": cmd_packages,
        "versions": cmd_versions,
        "download-url": cmd_download_url,
    }

    dispatch[args.command](client, args)


if __name__ == "__main__":
    main()
