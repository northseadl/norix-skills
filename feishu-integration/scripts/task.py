#!/usr/bin/env python3
"""Feishu Task v2 Management CLI.

Usage via unified CLI:
  ./feishu task create|get|update|complete|delete|list
  ./feishu task comment|comment-list|add-member|remove-member
  ./feishu task tasklist-*|section-*|batch-create
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, iso_to_timestamp, output
from members import resolve_members

AGENT_SIGNATURE = "[Agent] Automated action"

AGENT_ORIGIN = {
    "platform_i18n_name": {"zh_cn": "🤖 Agent", "en_us": "🤖 Agent"},
    "href": {
        "url": "https://github.com/norix",
        "title": "Agent Task",
    },
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="task.py", description="Feishu Task v2 管理")
    sub = parser.add_subparsers(dest="command")

    # create
    p = sub.add_parser("create", help="创建任务")
    p.add_argument("--summary", required=True, help="任务标题")
    p.add_argument("--description", default="", help="任务描述")
    p.add_argument("--due", default="", help="截止时间 (ISO 8601)")
    p.add_argument("--start", default="", help="开始时间 (ISO 8601)")
    p.add_argument("--members", default="", help='负责人：名字逗号分隔 ("张三,李四") 或 JSON (["ou_xxx"])')
    p.add_argument("--no-assign", action="store_true", help="不自动指派当前用户为负责人")
    p.add_argument("--tasklist-id", default="", help="添加到指定任务清单")
    p.add_argument("--section-id", default="", help="添加到指定分组")

    # get
    p = sub.add_parser("get", help="获取任务详情")
    p.add_argument("--task-id", required=True)

    # update
    p = sub.add_parser("update", help="更新任务")
    p.add_argument("--task-id", required=True)
    p.add_argument("--summary", default="")
    p.add_argument("--description", default="")
    p.add_argument("--due", default="", help="截止时间 (ISO 8601)")
    p.add_argument("--start", default="", help="开始时间 (ISO 8601)")
    p.add_argument("--clear-due", action="store_true", help="清除截止时间")
    p.add_argument("--clear-start", action="store_true", help="清除开始时间")

    # complete
    p = sub.add_parser("complete", help="完成任务")
    p.add_argument("--task-id", required=True)

    # delete
    p = sub.add_parser("delete", help="删除任务")
    p.add_argument("--task-id", required=True)

    # list
    p = sub.add_parser("list", help="List tasks")
    p.add_argument("--page-size", type=int, default=20)
    p.add_argument("--page-token", default="")
    p.add_argument("--completed", default="", help="true/false")
    p.add_argument("--keyword", default="", help="Filter by keyword in summary")

    # add-member / remove-member
    for cmd_name in ("add-member", "remove-member"):
        p = sub.add_parser(cmd_name, help=f"{'添加' if 'add' in cmd_name else '移除'}任务成员")
        p.add_argument("--task-id", required=True)
        p.add_argument("--member-id", required=True)
        p.add_argument("--role", default="assignee", choices=["assignee", "follower"])

    # tasklist-create
    p = sub.add_parser("tasklist-create", help="创建任务清单")
    p.add_argument("--name", required=True)

    # tasklist-list
    p = sub.add_parser("tasklist-list", help="列出任务清单")
    p.add_argument("--page-size", type=int, default=20)

    # tasklist-get
    p = sub.add_parser("tasklist-get", help="获取任务清单详情")
    p.add_argument("--tasklist-id", required=True)

    # tasklist-add-task
    p = sub.add_parser("tasklist-add-task", help="向任务清单添加任务")
    p.add_argument("--tasklist-id", required=True)
    p.add_argument("--task-id", required=True)

    # section-create
    p = sub.add_parser("section-create", help="创建分组")
    p.add_argument("--tasklist-id", required=True)
    p.add_argument("--name", required=True)

    # section-list
    p = sub.add_parser("section-list", help="列出分组")
    p.add_argument("--tasklist-id", required=True)

    # batch-create
    p = sub.add_parser("batch-create", help="从 JSON 文件批量创建任务")
    p.add_argument("--file", required=True, help="JSON 文件路径")
    p.add_argument("--tasklist-id", default="")

    # comment
    p = sub.add_parser("comment", help="添加任务评论")
    p.add_argument("--task-id", required=True)
    p.add_argument("--content", required=True, help="评论内容")

    # comment-list
    p = sub.add_parser("comment-list", help="列出任务评论")
    p.add_argument("--task-id", required=True)
    p.add_argument("--page-size", type=int, default=20)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    def _get_my_open_id() -> str:
        """Fetch current user's open_id via user_info API."""
        resp = client.get("/authen/v1/user_info")
        return resp.get("data", {}).get("open_id", "")

    # ── Task CRUD ─────────────────────────────────────────────────────────

    if args.command == "create":
        body: dict = {"summary": args.summary, "origin": AGENT_ORIGIN}
        if args.description:
            body["description"] = args.description
        if args.due:
            body["due"] = {"timestamp": iso_to_timestamp(args.due)}
        if args.start:
            body["start"] = {"timestamp": iso_to_timestamp(args.start)}

        # Resolve members: names, JSON array, or auto-assign current user
        if args.members:
            if args.members.strip().startswith("["):
                member_ids = json.loads(args.members)
            else:
                member_ids = resolve_members(args.members, client)
            body["members"] = [{"id": m, "role": "assignee"} for m in member_ids]
        elif not args.no_assign:
            my_id = _get_my_open_id()
            if my_id:
                body["members"] = [{"id": my_id, "role": "assignee"}]

        if args.tasklist_id:
            entry: dict = {"tasklist_guid": args.tasklist_id}
            if args.section_id:
                entry["section_guid"] = args.section_id
            body["tasklists"] = [entry]

        result = client.post("/task/v2/tasks", body)
        output(result)
        guid = result.get("data", {}).get("task", {}).get("guid", "?")
        Log.ok(f"Task created: {guid}")

    elif args.command == "get":
        output(client.get(f"/task/v2/tasks/{args.task_id}"))

    elif args.command == "update":
        fields = []
        task_body: dict = {}
        if args.summary:
            task_body["summary"] = args.summary
            fields.append("summary")
        if args.description:
            task_body["description"] = args.description
            fields.append("description")
        if args.due:
            task_body["due"] = {"timestamp": iso_to_timestamp(args.due)}
            fields.append("due")
        elif args.clear_due:
            # Include "due" in update_fields but omit from task body → clears the field
            fields.append("due")
        if args.start:
            task_body["start"] = {"timestamp": iso_to_timestamp(args.start)}
            fields.append("start")
        elif args.clear_start:
            fields.append("start")
        if not fields:
            Log.error("At least one field to update is required.")
            sys.exit(1)
        result = client.patch(
            f"/task/v2/tasks/{args.task_id}",
            body={"task": task_body, "update_fields": fields},
        )
        output(result)
        Log.ok(f"Task {args.task_id} updated.")

    elif args.command == "complete":
        task_id = args.task_id
        # Agent signature: add comment before completing
        client.post("/task/v2/comments", {
            "content": f"{AGENT_SIGNATURE} — 标记任务完成",
            "resource_type": "task",
            "resource_id": task_id,
        })
        result = client.patch(
            f"/task/v2/tasks/{task_id}",
            body={
                "task": {"completed_at": str(int(time.time() * 1000))},
                "update_fields": ["completed_at"],
            },
        )
        output(result)
        Log.ok(f"Task {task_id} completed (with Agent signature).")

    elif args.command == "delete":
        output(client.delete(f"/task/v2/tasks/{args.task_id}"))
        Log.ok(f"Task {args.task_id} deleted.")

    elif args.command == "list":
        params: dict = {"page_size": str(args.page_size)}
        if args.page_token:
            params["page_token"] = args.page_token
        if args.completed:
            params["completed"] = args.completed

        if args.keyword:
            # Fetch all tasks for client-side filtering
            all_tasks = client.get_all("/task/v2/tasks", params={"page_size": "100"}, items_key="items")
            kw = args.keyword.lower()
            matched = [t for t in all_tasks
                       if kw in t.get("summary", "").lower()
                       or kw in t.get("description", "").lower()]
            for t in matched:
                status = "done" if t.get("completed_at", "0") != "0" else "todo"
                print(f"  [{status:4}] {t.get('summary', '?'):50} {t.get('guid', '')}")
            print(f"\n  Matched: {len(matched)}/{len(all_tasks)}")
        else:
            output(client.get("/task/v2/tasks", params=params))

    # ── Members ───────────────────────────────────────────────────────────

    elif args.command == "add-member":
        body = {"members": [{"id": args.member_id, "role": args.role}]}
        output(client.post(f"/task/v2/tasks/{args.task_id}/add_members", body))
        Log.ok(f"Member {args.member_id} added as {args.role}.")

    elif args.command == "remove-member":
        body = {"members": [{"id": args.member_id, "role": args.role}]}
        output(client.post(f"/task/v2/tasks/{args.task_id}/remove_members", body))
        Log.ok(f"Member {args.member_id} removed.")

    # ── Tasklist ──────────────────────────────────────────────────────────

    elif args.command == "tasklist-create":
        result = client.post("/task/v2/tasklists", {"name": args.name})
        output(result)
        guid = result.get("data", {}).get("tasklist", {}).get("guid", "?")
        Log.ok(f"Tasklist created: {guid}")

    elif args.command == "tasklist-list":
        output(client.get("/task/v2/tasklists", params={"page_size": str(args.page_size)}))

    elif args.command == "tasklist-get":
        output(client.get(f"/task/v2/tasklists/{args.tasklist_id}"))

    elif args.command == "tasklist-add-task":
        output(client.post(
            f"/task/v2/tasklists/{args.tasklist_id}/add_members",
            {"task_guid": args.task_id},
        ))
        Log.ok(f"Task {args.task_id} added to tasklist.")

    # ── Section ───────────────────────────────────────────────────────────

    elif args.command == "section-create":
        result = client.post(
            "/task/v2/sections",
            {"name": args.name},
            params={"tasklist_guid": args.tasklist_id},
        )
        output(result)
        Log.ok(f"Section created.")

    elif args.command == "section-list":
        output(client.get("/task/v2/sections", params={
            "tasklist_guid": args.tasklist_id,
            "page_size": "50",
        }))

    # ── Batch Create ──────────────────────────────────────────────────────

    elif args.command == "batch-create":
        with open(args.file) as f:
            tasks = json.load(f)

        my_id = _get_my_open_id()
        created, failed = 0, 0
        for i, t in enumerate(tasks):
            summary = t.get("summary", "")
            if not summary:
                Log.warn(f"Skipping task {i}: missing summary")
                continue

            body: dict = {"summary": summary, "origin": AGENT_ORIGIN}
            if t.get("description"):
                body["description"] = t["description"]
            if t.get("due"):
                body["due"] = {"timestamp": iso_to_timestamp(t["due"])}
            if t.get("start"):
                body["start"] = {"timestamp": iso_to_timestamp(t["start"])}
            if my_id and not t.get("members"):
                body["members"] = [{"id": my_id, "role": "assignee"}]
            elif t.get("members"):
                body["members"] = [{"id": m, "role": "assignee"} for m in t["members"]]
            if args.tasklist_id:
                body["tasklists"] = [{"tasklist_guid": args.tasklist_id}]

            result = client.post("/task/v2/tasks", body)
            if result.get("code", -1) == 0:
                created += 1
            else:
                failed += 1
                Log.warn(f"Failed: {summary}")

            time.sleep(0.3)

        Log.ok(f"Batch complete: {created} created, {failed} failed / {len(tasks)} total")

    # ── Comments ──────────────────────────────────────────────────────────

    elif args.command == "comment":
        result = client.post("/task/v2/comments", {
            "content": args.content,
            "resource_type": "task",
            "resource_id": args.task_id,
        })
        output(result)
        Log.ok(f"Comment added to task {args.task_id}.")

    elif args.command == "comment-list":
        output(client.get(
            f"/task/v2/comments",
            params={
                "resource_type": "task",
                "resource_id": args.task_id,
                "page_size": str(args.page_size),
            },
        ))


if __name__ == "__main__":
    main()
