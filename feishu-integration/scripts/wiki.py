#!/usr/bin/env python3
"""Feishu Wiki (Knowledge Base) Management CLI.

Usage via unified CLI:
  ./feishu wiki space-list|space-get|space-create
  ./feishu wiki node-list|node-get|node-create|node-read|node-move|node-update
  ./feishu wiki tree|create-from-markdown
  ./feishu wiki move-doc-to-wiki|task-status|import-from-drive
"""

import argparse
import json
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

    p = sub.add_parser("move-doc-to-wiki", help="移动云空间文档至知识空间")
    p.add_argument("--space-id", required=True)
    p.add_argument("--obj-token", required=True, help="Source document token")
    p.add_argument("--obj-type", default="docx", choices=["docx", "doc", "sheet", "bitable", "mindnote"])
    p.add_argument("--parent-wiki-token", default="", help="Target parent node (empty = root)")

    p = sub.add_parser("task-status", help="获取异步任务结果")
    p.add_argument("--task-id", required=True)
    p.add_argument("--task-type", default="move", choices=["move"])

    p = sub.add_parser("import-from-drive", help="批量复制 Drive 文件夹到 Wiki 知识空间")
    p.add_argument("--source-folder", required=True, help="Source Drive folder token")
    p.add_argument("--space-id", required=True, help="Target Wiki space ID")
    p.add_argument("--parent-node-token", default="", help="Target parent node (empty = root)")
    p.add_argument("--dry-run", action="store_true", help="Preview without executing")

    p = sub.add_parser("search", help="按关键词搜索知识空间节点标题")
    p.add_argument("--query", required=True, help="Search keyword")
    p.add_argument("--space-id", default="", help="Limit to specific space (default: all spaces)")
    p.add_argument("--read", action="store_true", help="Auto-read the first matched node")

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
        body: dict = {"obj_type": args.obj_type, "node_type": "origin"}
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
        body: dict = {"obj_type": "docx", "node_type": "origin", "title": args.title}
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

    elif args.command == "move-doc-to-wiki":
        body: dict = {
            "obj_type": args.obj_type,
            "obj_token": args.obj_token,
        }
        if args.parent_wiki_token:
            body["parent_wiki_token"] = args.parent_wiki_token

        result = client.post(f"/wiki/v2/spaces/{args.space_id}/nodes/move_docs_to_wiki", body)
        code = result.get("code", -1)
        data = result.get("data", {})

        if code == 0:
            if "wiki_token" in data:
                Log.ok(f"Moved! wiki_token: {data['wiki_token']}")
            elif "task_id" in data:
                Log.info(f"Async task created: {data['task_id']}")
                Log.info(f"Check with: ./feishu wiki task-status --task-id '{data['task_id']}'")
            elif "applied" in data:
                Log.info("Permission requested. Waiting for approval.")
            output(result)
        else:
            Log.error(f"Move failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "task-status":
        result = client.get(
            f"/wiki/v2/tasks/{args.task_id}",
            params={"task_type": args.task_type},
        )
        if result.get("code", -1) == 0:
            task = result.get("data", {}).get("task", {})
            move_results = task.get("move_result", [])
            for mr in move_results:
                # status is int: 0=success, 1=processing, -1=failed
                # status_msg is string: "success", "processing", "already in wiki", etc.
                status = mr.get("status")
                status_msg = mr.get("status_msg", "")
                node = mr.get("node", {})
                title = node.get("title", "")
                node_token = node.get("node_token", "")
                if status == 0:
                    Log.ok(f"✅ {title} → {node_token}")
                elif status == 1:
                    Log.info(f"⏳ {title} processing...")
                else:
                    Log.error(f"❌ {title}: {status_msg}")
            if not move_results:
                output(result)
        else:
            Log.error(f"Task query failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "import-from-drive":
        _import_from_drive(
            client,
            source_folder=args.source_folder,
            space_id=args.space_id,
            parent_node_token=args.parent_node_token,
            dry_run=args.dry_run,
        )

    elif args.command == "search":
        # Collect all nodes from target space(s), filter by keyword
        keyword = args.query.lower()

        # Determine which spaces to search
        if args.space_id:
            spaces = [{"space_id": args.space_id, "name": args.space_id}]
        else:
            spaces = client.get_all("/wiki/v2/spaces", params={"page_size": "50"})
            if not spaces:
                Log.warn("No wiki spaces accessible.")
                sys.exit(0)

        # Recursive node collector
        def _collect_nodes(space_id: str, parent_token: str = "", path: str = "") -> list:
            params: dict = {"page_size": "50"}
            if parent_token:
                params["parent_node_token"] = parent_token
            items = client.get_all(f"/wiki/v2/spaces/{space_id}/nodes", params=params)
            results = []
            for n in items:
                title = n.get("title", "")
                node_path = f"{path}/{title}" if path else title
                n["_path"] = node_path
                n["_space_id"] = space_id
                results.append(n)
                if n.get("has_child"):
                    results.extend(_collect_nodes(space_id, n.get("node_token", ""), node_path))
                    time.sleep(0.1)
            return results

        # Search across spaces
        all_matches = []
        for space in spaces:
            sid = space.get("space_id", "")
            sname = space.get("name", sid)
            Log.info(f"Scanning: {sname} ...")
            nodes = _collect_nodes(sid)
            matched = [n for n in nodes if keyword in n.get("title", "").lower()]
            for m in matched:
                m["_space_name"] = sname
            all_matches.extend(matched)

        if not all_matches:
            Log.warn(f"No wiki nodes matching '{args.query}'")
            sys.exit(0)

        for i, m in enumerate(all_matches, 1):
            obj_type = m.get("obj_type", "?")
            title = m.get("title", "")
            node_token = m.get("node_token", "")
            space_name = m.get("_space_name", "")
            path = m.get("_path", "")
            print(f"  {i:2}. [{obj_type:6}] {title}")
            print(f"       space: {space_name}  path: {path}  token: {node_token}")
        print(f"\n  Matched: {len(all_matches)}")

        # Auto-read first match
        if args.read and all_matches:
            first = all_matches[0]
            ft = first.get("node_token", "")
            obj_token = first.get("obj_token", "")
            obj_type = first.get("obj_type", "")
            Log.info(f"Reading: {first.get('title', '?')}")
            if obj_type == "docx" and obj_token:
                result = client.get(f"/docx/v1/documents/{obj_token}/raw_content")
                if result.get("code", -1) == 0:
                    print(result.get("data", {}).get("content", ""))
                else:
                    Log.error(f"Read failed: {result.get('msg', '?')}")
            else:
                Log.warn(f"Auto-read only supports docx, got '{obj_type}'")


# ─── Drive → Wiki Import Engine ─────────────────────────────────────────────

def _collect_files_recursive(client: FeishuClient, folder_token: str,
                             prefix: str = "") -> list:
    """Recursively list all files in a Drive folder. Returns flat list of
    {token, name, type, path} dicts. Folders become path prefixes."""
    result = []
    params = {"page_size": "200", "order_by": "EditedTime", "direction": "DESC"}
    if folder_token:
        params["folder_token"] = folder_token
    files = client.get_all("/drive/v1/files", params=params, items_key="files")

    for f in files:
        name = f.get("name", "(unnamed)")
        ftype = f.get("type", "?")
        token = f.get("token", "")
        path = f"{prefix}/{name}" if prefix else name

        if ftype == "folder":
            result.append({"token": token, "name": name, "type": "folder", "path": path})
            result.extend(_collect_files_recursive(client, token, path))
            time.sleep(0.2)
        else:
            result.append({"token": token, "name": name, "type": ftype, "path": path})
    return result


def _wait_for_move_task(client: FeishuClient, task_id: str,
                        max_wait: int = 30) -> dict:
    """Poll a move task until completion. Returns the node dict or empty.

    Task status field is INTEGER per API docs:
      0  = success  (status_msg: "success")
      1  = processing (status_msg: "processing")
      -1 = failed   (status_msg: "already in wiki" / "permission denied" / ...)
    """
    for _ in range(max_wait):
        time.sleep(1)
        result = client.get(f"/wiki/v2/tasks/{task_id}", params={"task_type": "move"})
        if result.get("code", -1) != 0:
            continue
        task = result.get("data", {}).get("task", {})
        move_results = task.get("move_result", [])
        if not move_results:
            continue
        mr = move_results[0]
        status = mr.get("status")
        if status == 0:
            return mr.get("node", {})
        elif status == 1:
            continue  # still processing
        else:
            Log.error(f"  Task failed (status={status}): {mr.get('status_msg', '?')}")
            return {}
    Log.warn(f"  Task {task_id} timed out after {max_wait}s")
    return {}


def _import_from_drive(client: FeishuClient, source_folder: str,
                       space_id: str, parent_node_token: str,
                       dry_run: bool):
    """Import Drive folder contents into Wiki space.

    Strategy: For each file, copy it to a temp staging folder in Drive,
    then move the copy into Wiki. This preserves the original.
    Folders in Drive are mapped to empty docx nodes in Wiki (as containers).
    """
    # Phase 0: Scan source folder
    Log.info(f"Scanning source folder: {source_folder}")
    all_files = _collect_files_recursive(client, source_folder)
    docs = [f for f in all_files if f["type"] != "folder"]
    folders = [f for f in all_files if f["type"] == "folder"]

    Log.info(f"Found {len(docs)} documents, {len(folders)} folders")

    if dry_run:
        print("\n  === DRY RUN: Preview ===")
        for f in all_files:
            icon = "📂" if f["type"] == "folder" else "📄"
            print(f"  {icon} [{f['type']:7}] {f['path']}")
        print(f"\n  Total: {len(docs)} docs to import")
        return

    if not docs:
        Log.warn("No documents found to import.")
        return

    # Phase 1: Create staging folder in Drive root
    root = client.get("/drive/explorer/v2/root_folder/meta")
    root_token = root.get("data", {}).get("token", "")
    if not root_token:
        Log.error("Cannot determine root folder token.")
        sys.exit(1)

    staging_name = f"_wiki_import_{int(time.time())}"
    cr = client.post("/drive/v1/files/create_folder", {
        "name": staging_name,
        "folder_token": root_token,
    })
    staging_token = cr.get("data", {}).get("token", "")
    if not staging_token:
        Log.error(f"Failed to create staging folder: {cr.get('msg', '?')}")
        sys.exit(1)
    Log.ok(f"Staging folder created: {staging_name} ({staging_token})")

    # Phase 2: Create Wiki folder structure (folders → empty docx nodes)
    # Map: Drive folder path → Wiki node_token
    wiki_folder_map: dict = {"": parent_node_token}  # root maps to target parent

    for folder in folders:
        path = folder["path"]
        parent_path = "/".join(path.split("/")[:-1])
        parent_wiki_token = wiki_folder_map.get(parent_path, parent_node_token)

        body: dict = {"obj_type": "docx", "node_type": "origin", "title": folder["name"]}
        if parent_wiki_token:
            body["parent_node_token"] = parent_wiki_token
        result = client.post(f"/wiki/v2/spaces/{space_id}/nodes", body)
        node = result.get("data", {}).get("node", {})
        node_token = node.get("node_token", "")
        if not node_token:
            Log.error(f"  Failed to create Wiki folder: {folder['name']}")
            Log.error(f"  Response: {result.get('msg', '?')} (code={result.get('code', '?')})")
            sys.exit(1)
        wiki_folder_map[path] = node_token
        Log.ok(f"  📂 Wiki folder: {folder['name']} → {node_token}")
        time.sleep(0.5)

    # Phase 3: Copy each doc to staging, then move to Wiki
    success_count = 0
    fail_count = 0
    progress_file = os.path.join(
        os.path.expanduser("~"), ".agents", "data", "feishu",
        f"import_progress_{int(time.time())}.json",
    )
    os.makedirs(os.path.dirname(progress_file), exist_ok=True)
    progress: list = []

    for i, doc in enumerate(docs, 1):
        Log.info(f"  [{i}/{len(docs)}] {doc['path']}")

        # Step A: Copy to staging folder
        copy_body = {
            "type": doc["type"],
            "folder_token": staging_token,
            "name": doc["name"],
        }
        copy_result = client.post(f"/drive/v1/files/{doc['token']}/copy", copy_body)
        if copy_result.get("code", -1) != 0:
            Log.error(f"    Copy failed: {copy_result.get('msg', '?')}")
            fail_count += 1
            progress.append({"path": doc["path"], "status": "copy_failed",
                           "error": copy_result.get("msg", "?")})
            time.sleep(1)
            continue

        copy_file = copy_result.get("data", {}).get("file", {})
        copy_token = copy_file.get("token", "")
        if not copy_token:
            Log.error("    Copy returned no token")
            fail_count += 1
            progress.append({"path": doc["path"], "status": "copy_no_token"})
            continue

        # Step B: Determine parent Wiki node
        parent_path = "/".join(doc["path"].split("/")[:-1])
        parent_wiki_token = wiki_folder_map.get(parent_path, parent_node_token)

        # Step C: Move copy to Wiki
        move_body: dict = {
            "obj_type": doc["type"],
            "obj_token": copy_token,
        }
        if parent_wiki_token:
            move_body["parent_wiki_token"] = parent_wiki_token

        move_result = client.post(
            f"/wiki/v2/spaces/{space_id}/nodes/move_docs_to_wiki",
            move_body,
        )
        move_data = move_result.get("data", {})

        if move_result.get("code", -1) != 0:
            Log.error(f"    Move failed: {move_result.get('msg', '?')}")
            fail_count += 1
            progress.append({"path": doc["path"], "status": "move_failed",
                           "copy_token": copy_token, "error": move_result.get("msg", "?")})
            time.sleep(1)
            continue

        # Handle async task
        if "wiki_token" in move_data:
            Log.ok(f"    → {move_data['wiki_token']}")
            success_count += 1
            progress.append({"path": doc["path"], "status": "success",
                           "wiki_token": move_data["wiki_token"]})
        elif "task_id" in move_data:
            node = _wait_for_move_task(client, move_data["task_id"])
            if node:
                Log.ok(f"    → {node.get('node_token', '?')}")
                success_count += 1
                progress.append({"path": doc["path"], "status": "success",
                               "node_token": node.get("node_token", "")})
            else:
                fail_count += 1
                progress.append({"path": doc["path"], "status": "task_failed",
                               "task_id": move_data["task_id"]})
        else:
            Log.warn(f"    Unexpected response")
            output(move_result)
            fail_count += 1
            progress.append({"path": doc["path"], "status": "unknown"})

        # Rate limit: copy API is 5 QPS, be conservative
        time.sleep(1.5)

    # Save progress
    with open(progress_file, "w") as pf:
        json.dump(progress, pf, ensure_ascii=False, indent=2)

    # Summary
    print(f"\n  ═══ Import Complete ═══")
    print(f"  ✅ Success: {success_count}")
    print(f"  ❌ Failed:  {fail_count}")
    print(f"  📋 Progress: {progress_file}")

    if success_count > 0:
        Log.info(f"Staging folder '{staging_name}' can be deleted after verification.")


if __name__ == "__main__":
    main()
