#!/usr/bin/env python3
"""Feishu Approval (审批) Management CLI.

Usage via unified CLI:
  ./feishu approval list-definitions|create|get|list|approve|reject
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output


# ─── Tenant Token Client ────────────────────────────────────────────────────
# Some approval APIs (list definitions, get definition) require tenant_access_token.
# Instance operations (create, get, list, approve, reject) use user_access_token.

def _get_tenant_client() -> FeishuClient:
    """Create a client using tenant_access_token for admin-level APIs."""
    import urllib.request
    from auth import get_app_credentials
    from feishu_api import API_BASE

    app_id, app_secret = get_app_credentials()
    if not app_id or not app_secret:
        Log.error("App credentials required for approval admin APIs.")
        Log.error("Set FEISHU_APP_ID and FEISHU_APP_SECRET")
        sys.exit(1)

    payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/auth/v3/tenant_access_token/internal",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    tenant_token = result.get("tenant_access_token", "")
    if not tenant_token:
        Log.error(f"Failed to get tenant token: {result.get('msg', '?')}")
        sys.exit(1)

    # Create a client that uses tenant token (bypass user token resolution)
    tc = FeishuClient()
    tc._token = tenant_token
    return tc


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _format_status(status: str) -> str:
    """Map approval status code to human-readable label."""
    return {
        "PENDING": "⏳ 审批中",
        "APPROVED": "✅ 已通过",
        "REJECTED": "❌ 已拒绝",
        "CANCELED": "🚫 已撤销",
        "DELETED": "🗑️ 已删除",
    }.get(status, status)


def _format_ts(ts: str) -> str:
    """Convert millisecond timestamp to readable datetime."""
    if not ts or ts == "0":
        return "—"
    try:
        t = int(ts) / 1000
        return time.strftime("%Y-%m-%d %H:%M", time.localtime(t))
    except (ValueError, OSError):
        return ts


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="approval.py", description="Feishu Approval 审批管理")
    sub = parser.add_subparsers(dest="command")

    # List approval definitions (templates)
    p = sub.add_parser("list-definitions", help="列出可用审批定义（模板）")
    p.add_argument("--limit", type=int, default=20, help="Max results")

    # Get specific definition
    p = sub.add_parser("get-definition", help="获取审批定义详情")
    p.add_argument("--code", required=True, help="Approval definition code")

    # Create approval instance
    p = sub.add_parser("create", help="创建审批实例")
    p.add_argument("--code", required=True, help="Approval definition code")
    p.add_argument("--form", required=True, help="Form data as JSON string or file path")
    p.add_argument("--approvers", default="", help="Comma-separated approver open_ids")
    p.add_argument("--cc", default="", help="Comma-separated CC open_ids")

    # Get approval instance
    p = sub.add_parser("get", help="获取审批实例详情")
    p.add_argument("--instance-id", required=True, help="Instance ID")

    # List approval instances
    p = sub.add_parser("list", help="列出审批实例")
    p.add_argument("--code", required=True, help="Approval definition code")
    p.add_argument("--status", default="", help="Filter: PENDING, APPROVED, REJECTED, CANCELED")
    p.add_argument("--start-time", default="", help="Start time (ms timestamp)")
    p.add_argument("--end-time", default="", help="End time (ms timestamp)")
    p.add_argument("--limit", type=int, default=20)

    # Approve a task
    p = sub.add_parser("approve", help="同意审批任务")
    p.add_argument("--instance-id", required=True)
    p.add_argument("--task-id", required=True)
    p.add_argument("--comment", default="", help="Approval comment")

    # Reject a task
    p = sub.add_parser("reject", help="拒绝审批任务")
    p.add_argument("--instance-id", required=True)
    p.add_argument("--task-id", required=True)
    p.add_argument("--comment", default="", help="Rejection reason")

    # Cancel an instance
    p = sub.add_parser("cancel", help="撤销审批实例")
    p.add_argument("--instance-id", required=True)
    p.add_argument("--reason", default="Agent canceled", help="Cancellation reason")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Admin APIs (list/get definitions) use tenant_access_token, others use user token
    if args.command in ("list-definitions", "get-definition"):
        client = _get_tenant_client()
    else:
        client = FeishuClient()

    if args.command == "list-definitions":
        # List approval definitions (GET with query params)
        result = client.get("/approval/v4/approvals", params={
            "page_size": str(args.limit),
            "locale": "zh-CN",
        })
        data = result.get("data", {})
        definitions = data.get("approval_list", [])
        if not definitions:
            Log.warn("No approval definitions found")
            sys.exit(0)
        for i, d in enumerate(definitions, 1):
            name = d.get("approval_name", "(unnamed)")
            code = d.get("approval_code", "?")
            status = d.get("status", "?")
            print(f"  {i:2}. {name}")
            print(f"       code: {code}  status: {status}")
        print(f"\n  Total: {len(definitions)}")

    elif args.command == "get-definition":
        result = client.get(f"/approval/v4/approvals/{args.code}")
        data = result.get("data", {})
        name = data.get("approval_name", "?")
        form_str = data.get("form", {}).get("form_content", "[]")
        try:
            form_fields = json.loads(form_str) if isinstance(form_str, str) else form_str
        except json.JSONDecodeError:
            form_fields = form_str
        print(f"  Name: {name}")
        print(f"  Code: {args.code}")
        print(f"  Form Fields:")
        if isinstance(form_fields, list):
            for f in form_fields:
                fname = f.get("name", "?")
                ftype = f.get("type", "?")
                fid = f.get("id", "?")
                required = "✓" if f.get("required") else " "
                print(f"    [{required}] {fname} ({ftype}) id={fid}")
        else:
            print(f"    {form_fields}")

    elif args.command == "create":
        # Parse form data
        form_data = args.form
        if os.path.isfile(form_data):
            with open(form_data) as f:
                form_data = f.read()

        body: dict = {
            "approval_code": args.code,
            "form": form_data,
        }

        # Add approvers if specified
        if args.approvers:
            approver_ids = [aid.strip() for aid in args.approvers.split(",")]
            body["approval_node_list"] = [{
                "custom_node_id": "approval_node",
                "type": "AND",
                "approver_id_list": approver_ids,
            }]

        # Add CC if specified
        if args.cc:
            cc_ids = [cid.strip() for cid in args.cc.split(",")]
            body["cc_id_list"] = cc_ids

        result = client.post("/approval/v4/instances", body)
        code = result.get("code", -1)
        if code == 0:
            instance_id = result.get("data", {}).get("instance_id", "?")
            Log.ok(f"Approval created: {instance_id}")
        else:
            Log.error(f"Create failed: {result.get('msg', '?')} (code: {code})")
            output(result)

    elif args.command == "get":
        result = client.get(f"/approval/v4/instances/{args.instance_id}")
        data = result.get("data", {})
        code = result.get("code", -1)

        if code != 0:
            Log.error(f"Get failed: {result.get('msg', '?')}")
            output(result)
            sys.exit(1)

        approval_name = data.get("approval_name", "?")
        status = data.get("status", "?")
        start_time = _format_ts(data.get("start_time", ""))
        end_time = _format_ts(data.get("end_time", ""))

        print(f"  Approval: {approval_name}")
        print(f"  Instance: {args.instance_id}")
        print(f"  Status:   {_format_status(status)}")
        print(f"  Started:  {start_time}")
        if end_time != "—":
            print(f"  Ended:    {end_time}")

        # Show timeline (tasks)
        tasks = data.get("task_list", [])
        if tasks:
            print(f"\n  Tasks ({len(tasks)}):")
            for t in tasks:
                task_id = t.get("id", "?")
                task_status = t.get("status", "?")
                node_name = t.get("node_name", "?")
                print(f"    {_format_status(task_status)} {node_name} (task_id: {task_id})")

    elif args.command == "list":
        body: dict = {
            "approval_code": args.code,
            "limit": args.limit,
            "offset": 0,
        }
        if args.status:
            body["instance_status"] = args.status
        if args.start_time:
            body["start_time"] = args.start_time
        if args.end_time:
            body["end_time"] = args.end_time

        result = client.post("/approval/v4/instances/query", body)
        data = result.get("data", {})
        instances = data.get("instance_list", [])

        if not instances:
            Log.warn("No approval instances found")
            sys.exit(0)

        for i, inst in enumerate(instances, 1):
            inst_id = inst.get("instance_id", "?")
            status = inst.get("status", "?")
            start = _format_ts(inst.get("start_time", ""))
            print(f"  {i:2}. {_format_status(status)}  {start}  id: {inst_id}")
        total = data.get("total", len(instances))
        print(f"\n  Showing: {len(instances)}/{total}")

    elif args.command == "approve":
        body = {
            "approval_code": "",
            "instance_code": args.instance_id,
            "task_id": args.task_id,
        }
        if args.comment:
            body["comment"] = args.comment

        result = client.post("/approval/v4/tasks/approve", body)
        if result.get("code", -1) == 0:
            Log.ok(f"Task {args.task_id} approved")
        else:
            Log.error(f"Approve failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "reject":
        body = {
            "approval_code": "",
            "instance_code": args.instance_id,
            "task_id": args.task_id,
        }
        if args.comment:
            body["comment"] = args.comment

        result = client.post("/approval/v4/tasks/reject", body)
        if result.get("code", -1) == 0:
            Log.ok(f"Task {args.task_id} rejected")
        else:
            Log.error(f"Reject failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "cancel":
        result = client.post(f"/approval/v4/instances/{args.instance_id}/cancel", {
            "reason": args.reason,
        })
        if result.get("code", -1) == 0:
            Log.ok(f"Instance {args.instance_id} canceled")
        else:
            Log.error(f"Cancel failed: {result.get('msg', '?')}")
            output(result)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
