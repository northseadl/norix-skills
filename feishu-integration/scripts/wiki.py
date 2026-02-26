#!/usr/bin/env python3
"""Feishu Wiki (Knowledge Base) Management CLI.

Usage via unified CLI:
  ./feishu wiki space-list|space-get|space-create
  ./feishu wiki node-list|node-get|node-create|node-read|node-move|node-update
  ./feishu wiki tree|create-from-markdown
"""

import argparse
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="wiki.py", description="Feishu Wiki 管理")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("space-list", help="列出知识空间")

    p = sub.add_parser("space-get", help="获取知识空间详情")
    p.add_argument("--space-id", required=True)

    p = sub.add_parser("space-create", help="创建知识空间")
    p.add_argument("--name", required=True)
    p.add_argument("--description", default="")

    p = sub.add_parser("node-list", help="列出节点")
    p.add_argument("--space-id", required=True)
    p.add_argument("--parent-node-token", default="")

    p = sub.add_parser("node-get", help="获取节点详情")
    p.add_argument("--token", required=True)

    p = sub.add_parser("node-create", help="创建节点")
    p.add_argument("--space-id", required=True)
    p.add_argument("--obj-type", default="docx", choices=["docx", "sheet", "bitable", "mindnote"])
    p.add_argument("--title", default="")
    p.add_argument("--parent-node-token", default="")

    p = sub.add_parser("node-read", help="读取 wiki 节点内容")
    p.add_argument("--token", required=True, help="node_token")

    p = sub.add_parser("node-move", help="移动节点")
    p.add_argument("--space-id", required=True)
    p.add_argument("--node-token", required=True)
    p.add_argument("--target-parent-token", required=True)
    p.add_argument("--target-space-id", default="", help="Target space (default: same space)")

    p = sub.add_parser("node-update", help="更新节点标题")
    p.add_argument("--space-id", required=True)
    p.add_argument("--node-token", required=True)
    p.add_argument("--title", required=True)

    p = sub.add_parser("tree", help="递归显示知识库目录树")
    p.add_argument("--space-id", required=True)
    p.add_argument("--parent-node-token", default="")
    p.add_argument("--depth", type=int, default=3, help="Max depth (default: 3)")

    p = sub.add_parser("create-from-markdown", help="从 Markdown 创建 Wiki 节点")
    p.add_argument("--space-id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--file", required=True, help="Markdown file path")
    p.add_argument("--parent-node-token", default="")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    if args.command == "space-list":
        items = client.get_all("/wiki/v2/spaces", params={"page_size": "50"})
        for i, s in enumerate(items, 1):
            vis = s.get("visibility", "?")
            print(f"  {i:2}. {s.get('name', ''):30} [{vis:7}] {s.get('space_id', '')}")
        print(f"\n  Total: {len(items)}")

    elif args.command == "space-get":
        output(client.get(f"/wiki/v2/spaces/{args.space_id}"))

    elif args.command == "space-create":
        body: dict = {"name": args.name}
        if args.description:
            body["description"] = args.description
        result = client.post("/wiki/v2/spaces", body)
        output(result)
        sid = result.get("data", {}).get("space", {}).get("space_id", "?")
        Log.ok(f"Wiki space created: {sid}")

    elif args.command == "node-list":
        params: dict = {"page_size": "50"}
        if args.parent_node_token:
            params["parent_node_token"] = args.parent_node_token
        items = client.get_all(f"/wiki/v2/spaces/{args.space_id}/nodes", params=params)
        for i, n in enumerate(items, 1):
            obj_type = n.get("obj_type", "?")
            has_child = "📂" if n.get("has_child") else "📄"
            print(f"  {i:2}. {has_child} {n.get('title', ''):35} [{obj_type:6}] {n.get('node_token', '')}")
        print(f"\n  Total: {len(items)}")

    elif args.command == "node-get":
        output(client.get("/wiki/v2/spaces/get_node", params={"token": args.token}))

    elif args.command == "node-create":
        body: dict = {"obj_type": args.obj_type}
        if args.title:
            body["title"] = args.title
        if args.parent_node_token:
            body["parent_node_token"] = args.parent_node_token
        result = client.post(f"/wiki/v2/spaces/{args.space_id}/nodes", body)
        output(result)
        node = result.get("data", {}).get("node", {})
        Log.ok(f"Node created: node_token={node.get('node_token', '?')}, obj_token={node.get('obj_token', '?')}")

    elif args.command == "node-read":
        info = client.get("/wiki/v2/spaces/get_node", params={"token": args.token})
        node = info.get("data", {}).get("node", {})
        obj_token = node.get("obj_token", "")
        obj_type = node.get("obj_type", "")
        title = node.get("title", "(untitled)")

        if not obj_token:
            Log.error(f"Cannot resolve node {args.token}")
            output(info)
            sys.exit(1)

        if obj_type == "docx":
            Log.info(f"Reading: {title} (obj_token={obj_token})")
            result = client.get(f"/docx/v1/documents/{obj_token}/raw_content")
            if result.get("code", -1) == 0:
                print(result.get("data", {}).get("content", ""))
            else:
                Log.error(f"Read failed: {result.get('msg', '?')}")
                output(result)
        elif obj_type == "bitable":
            Log.info(f"Bitable node: {title} (app_token={obj_token})")
            Log.info(f"Use: ./feishu bitable list-tables --app-token {obj_token}")
        elif obj_type == "sheet":
            Log.info(f"Sheet node: {title} (token={obj_token})")
            Log.warn("Sheet reading is not yet supported.")
        else:
            Log.warn(f"Node type '{obj_type}' is not readable via this CLI.")
            Log.info(f"obj_token={obj_token}")

    elif args.command == "node-move":
        body: dict = {"target_parent_token": args.target_parent_token}
        if args.target_space_id:
            body["target_space_id"] = args.target_space_id
        result = client.post(
            f"/wiki/v2/spaces/{args.space_id}/nodes/{args.node_token}/move",
            body,
        )
        if result.get("code", -1) == 0:
            Log.ok(f"Node {args.node_token} moved.")
        else:
            Log.error(f"Move failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "node-update":
        result = client.put(
            f"/wiki/v2/spaces/{args.space_id}/nodes/{args.node_token}",
            {"title": args.title},
        )
        if result.get("code", -1) == 0:
            Log.ok(f"Node title updated to: {args.title}")
        else:
            Log.error(f"Update failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "tree":
        def _tree(space_id: str, parent_token: str, prefix: str, depth: int, max_depth: int):
            if depth > max_depth:
                return
            params: dict = {"page_size": "50"}
            if parent_token:
                params["parent_node_token"] = parent_token
            items = client.get_all(f"/wiki/v2/spaces/{space_id}/nodes", params=params)
            for i, n in enumerate(items):
                is_last = (i == len(items) - 1)
                connector = "└── " if is_last else "├── "
                title = n.get("title", "(unnamed)")
                obj_type = n.get("obj_type", "?")
                has_child = n.get("has_child", False)
                icon = "📂" if has_child else {"docx": "📄", "bitable": "📊", "sheet": "📋"}.get(obj_type, "📝")
                print(f"{prefix}{connector}{icon} [{obj_type}] {title}")
                if has_child:
                    child_prefix = prefix + ("    " if is_last else "│   ")
                    _tree(space_id, n.get("node_token", ""), child_prefix, depth + 1, max_depth)
                time.sleep(0.1)

        print(f"  Wiki Space ({args.space_id})")
        _tree(args.space_id, args.parent_node_token, "  ", 1, args.depth)

    elif args.command == "create-from-markdown":
        from docx import markdown_to_blocks, flush_blocks

        # Step 1: create wiki node (docx type)
        body: dict = {"obj_type": "docx", "title": args.title}
        if args.parent_node_token:
            body["parent_node_token"] = args.parent_node_token
        result = client.post(f"/wiki/v2/spaces/{args.space_id}/nodes", body)
        node = result.get("data", {}).get("node", {})
        obj_token = node.get("obj_token", "")
        node_token = node.get("node_token", "")

        if not obj_token:
            Log.error("Failed to create wiki node.")
            output(result)
            sys.exit(1)

        # Step 2: write markdown content
        with open(args.file) as f:
            md_text = f.read()
        blocks, table_data = markdown_to_blocks(md_text)
        flush_blocks(client, obj_token, obj_token, blocks, table_data_queue=table_data)

        Log.ok(f"Wiki node created: {node_token} ({len(blocks)} blocks)")
        Log.info(f"obj_token: {obj_token}")


if __name__ == "__main__":
    main()
