#!/usr/bin/env python3
"""Feishu Document & Drive Management CLI.

Usage via unified CLI:
  ./feishu doc list|search|tree|read-raw|create|append-*|trash|shared-*
"""

import argparse
import json
import os
import re
import sys
import time
from typing import List, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output


# ─── Block Type Constants ────────────────────────────────────────────────────
# Verified against real Feishu API responses (2026-02-26).

BT_PAGE = 1
BT_TEXT = 2
BT_H1, BT_H2, BT_H3, BT_H4 = 3, 4, 5, 6
BT_H5, BT_H6, BT_H7, BT_H8, BT_H9 = 7, 8, 9, 10, 11
BT_BULLET = 12
BT_ORDERED = 13
BT_CODE = 14
BT_QUOTE = 15
BT_TODO = 17
BT_DIVIDER = 22
BT_TABLE = 31

HEADING_FIELD = {
    1: "heading1", 2: "heading2", 3: "heading3",
    4: "heading4", 5: "heading5", 6: "heading6",
    7: "heading7", 8: "heading8", 9: "heading9",
}

# Feishu code language IDs
LANG_MAP = {
    "plaintext": 1, "bash": 8, "shell": 8, "sh": 8,
    "c#": 9, "csharp": 9, "c++": 10, "cpp": 10, "c": 11,
    "css": 13, "dart": 16, "go": 18, "golang": 18,
    "html": 20, "java": 21, "javascript": 22, "js": 22,
    "json": 23, "kotlin": 25, "lua": 28, "makefile": 29,
    "markdown": 30, "md": 30, "objective-c": 32, "objc": 32,
    "python": 33, "py": 33, "r": 34, "rust": 35, "ruby": 36, "rb": 36,
    "scala": 37, "sql": 38, "swift": 39, "typescript": 41, "ts": 41,
    "xml": 44, "yaml": 45, "yml": 45,
}

# Reverse map: language code → canonical name (longest alias wins for readability)
LANG_NAME: dict[int, str] = {}
for _name, _code in LANG_MAP.items():
    if _code not in LANG_NAME or len(_name) > len(LANG_NAME[_code]):
        LANG_NAME[_code] = _name


# ─── Inline Markdown → Feishu Elements ──────────────────────────────────────

def _parse_inline_md(text: str) -> List[dict]:
    """Parse inline Markdown into Feishu text_run elements.

    Supports: ***bold italic***, **bold**, *italic*, ~~strikethrough~~,
    `inline code`, [link](url), ![image](url) → degraded to link.
    """
    elements: List[dict] = []
    # Order matters: bold-italic (***) must come before bold (**) and italic (*)
    pattern = re.compile(
        r'(\*\*\*(.+?)\*\*\*)'               # group 1,2: bold+italic
        r'|(\*\*(.+?)\*\*)'                   # group 3,4: bold
        r'|(~~(.+?)~~)'                        # group 5,6: strikethrough
        r'|(\*(.+?)\*)'                        # group 7,8: italic
        r'|(`(.+?)`)'                          # group 9,10: inline code
        r'|(!?\[([^\]]+)\]\(([^)]+)\))'        # group 11,12,13: link or image
    )
    last_end = 0
    for m in pattern.finditer(text):
        # Plain text before this match
        if m.start() > last_end:
            plain = text[last_end:m.start()]
            if plain:
                elements.append({"text_run": {"content": plain}})

        if m.group(2):      # bold+italic
            elements.append({"text_run": {"content": m.group(2), "text_element_style": {"bold": True, "italic": True}}})
        elif m.group(4):    # bold
            elements.append({"text_run": {"content": m.group(4), "text_element_style": {"bold": True}}})
        elif m.group(6):    # strikethrough
            elements.append({"text_run": {"content": m.group(6), "text_element_style": {"strikethrough": True}}})
        elif m.group(8):    # italic
            elements.append({"text_run": {"content": m.group(8), "text_element_style": {"italic": True}}})
        elif m.group(10):   # inline code
            elements.append({"text_run": {"content": m.group(10), "text_element_style": {"inline_code": True}}})
        elif m.group(12):   # link or image (both render as clickable link)
            url = m.group(13)
            if url.startswith(("http://", "https://", "mailto:")):
                elements.append({"text_run": {"content": m.group(12), "text_element_style": {"link": {"url": url}}}})
            else:
                # Invalid URL: render as plain text "[label](value)"
                elements.append({"text_run": {"content": f"[{m.group(12)}]({url})"}})

        last_end = m.end()

    # Remaining plain text
    remaining = text[last_end:]
    if remaining:
        elements.append({"text_run": {"content": remaining}})

    return elements if elements else [{"text_run": {"content": text}}]


def _make_elements_block(block_type: int, field: str, text: str) -> dict:
    """Generic block builder with inline Markdown parsing."""
    return {"block_type": block_type, field: {"elements": _parse_inline_md(text)}}


# ─── Block Builders ──────────────────────────────────────────────────────────


def make_text_block(text: str) -> dict:
    return _make_elements_block(BT_TEXT, "text", text)


def make_heading_block(level: int, text: str) -> dict:
    bt = level + 2  # heading1 = block_type 3, heading2 = 4, ...
    field = HEADING_FIELD[level]
    return _make_elements_block(bt, field, text)


def make_bullet_block(text: str) -> dict:
    return _make_elements_block(BT_BULLET, "bullet", text)


def make_ordered_block(text: str) -> dict:
    return _make_elements_block(BT_ORDERED, "ordered", text)


def make_code_block(content: str, lang: str = "") -> dict:
    lang_code = LANG_MAP.get(lang.lower().strip(), 1)
    return {
        "block_type": BT_CODE,
        "code": {
            "language": lang_code,
            "elements": [{"text_run": {"content": content}}],
        },
    }


def make_quote_block(text: str) -> dict:
    return _make_elements_block(BT_QUOTE, "quote", text)


def make_todo_block(text: str, done: bool = False) -> dict:
    return {"block_type": BT_TODO, "todo": {"style": {"done": done}, "elements": _parse_inline_md(text)}}


def make_divider_block() -> dict:
    return {"block_type": BT_DIVIDER, "divider": {}}


def make_table_skeleton(row_size: int, column_size: int) -> dict:
    """Create table block (cells auto-created by API). Returns block for first API call."""
    return {
        "block_type": BT_TABLE,
        "table": {
            "property": {"row_size": row_size, "column_size": column_size},
        },
    }


# ─── Markdown → Blocks Parser ────────────────────────────────────────────────

def _parse_md_table(lines: List[str], start: int) -> tuple:
    """Parse a Markdown table starting at `start`. Returns (table_data, next_line_index).
    table_data is a list of rows, each row is a list of cell strings.
    """
    rows = []
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith("|"):
            break
        # Strip leading/trailing pipes and split
        cells = [c.strip() for c in line.strip("|").split("|")]
        # Skip separator row (e.g. |---|---|)
        if all(re.match(r'^[-:]+$', c) for c in cells):
            i += 1
            continue
        rows.append(cells)
        i += 1
    return rows, i


def markdown_to_blocks(text: str) -> tuple[List[dict], List[tuple]]:
    """Convert Markdown text into Feishu document blocks.

    Returns (blocks, table_data_queue) where table_data_queue contains
    (block_index, rows) tuples for tables that need multi-step API filling.
    """
    lines = text.split("\n")
    blocks: List[dict] = []
    table_data_queue: List[tuple] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Code block (fenced)
        if line.startswith("```"):
            lang = line[3:].strip()
            code_lines: List[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            blocks.append(make_code_block("\n".join(code_lines), lang))
            continue

        # Markdown table
        if line.strip().startswith("|") and i + 1 < len(lines) and lines[i + 1].strip().startswith("|"):
            rows, i = _parse_md_table(lines, i)
            if rows:
                col_count = max(len(r) for r in rows)
                block_idx = len(blocks)
                blocks.append(make_table_skeleton(len(rows), col_count))
                table_data_queue.append((block_idx, rows))
            continue

        # Headings
        heading_match = re.match(r"^(#{1,9})\s+(.+)$", line)
        if heading_match:
            level = len(heading_match.group(1))
            blocks.append(make_heading_block(min(level, 9), heading_match.group(2)))
            i += 1
            continue

        # Checkbox item
        todo_match = re.match(r'^[-*+]\s+\[([ xX])\]\s+(.+)$', line)
        if todo_match:
            done = todo_match.group(1).lower() == 'x'
            blocks.append(make_todo_block(todo_match.group(2), done))
            i += 1
            continue

        # Bullet list
        bullet_match = re.match(r"^[-*+]\s+(.+)$", line)
        if bullet_match:
            blocks.append(make_bullet_block(bullet_match.group(1)))
            i += 1
            continue

        # Ordered list
        ordered_match = re.match(r"^\d+\.\s+(.+)$", line)
        if ordered_match:
            blocks.append(make_ordered_block(ordered_match.group(1)))
            i += 1
            continue

        # Block quote
        quote_match = re.match(r"^>\s*(.*)$", line)
        if quote_match:
            # Collect multi-line quotes
            quote_lines = [quote_match.group(1)]
            i += 1
            while i < len(lines) and re.match(r"^>\s*(.*)$", lines[i]):
                quote_lines.append(re.match(r"^>\s*(.*)$", lines[i]).group(1))
                i += 1
            blocks.append(make_quote_block("\n".join(quote_lines)))
            continue

        # Divider
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", line.strip()):
            blocks.append(make_divider_block())
            i += 1
            continue

        # Empty line — skip
        if not line.strip():
            i += 1
            continue

        # Regular text paragraph
        blocks.append(make_text_block(line))
        i += 1

    return blocks, table_data_queue


# ─── Shared Folder Cache ─────────────────────────────────────────────────────

SHARED_FOLDERS_FILE = os.path.join(os.path.expanduser("~"), ".agents", "data", "feishu", "shared_folders.json")


def _load_shared_folders() -> dict:
    """Load cached shared folder entries. Returns {token: {name, url, added_at}}."""
    if os.path.exists(SHARED_FOLDERS_FILE):
        with open(SHARED_FOLDERS_FILE) as f:
            return json.load(f)
    return {}


def _save_shared_folders(data: dict):
    os.makedirs(os.path.dirname(SHARED_FOLDERS_FILE), exist_ok=True)
    with open(SHARED_FOLDERS_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _extract_folder_token(url: str) -> str:
    """Extract folder token from Feishu URL like https://xxx.feishu.cn/drive/folder/TOKEN."""
    match = re.search(r"/drive/folder/([A-Za-z0-9]+)", url)
    if match:
        return match.group(1)
    # Might be a raw token already
    if re.match(r"^[A-Za-z0-9]{20,}$", url.strip()):
        return url.strip()
    return ""


def _evict_shared_folder(token: str):
    """Remove a shared folder from cache (permission lost)."""
    folders = _load_shared_folders()
    if token in folders:
        name = folders[token].get("name", token)
        del folders[token]
        _save_shared_folders(folders)
        Log.warn(f"Shared folder '{name}' evicted from cache (access lost).")


# ─── Drive Helpers ───────────────────────────────────────────────────────────

TRASH_FOLDER_NAME = "_trash"


def _get_or_create_trash_folder(client: FeishuClient) -> str:
    """Find or create the _trash folder. Returns folder token."""
    result = client.get("/drive/v1/files", params={
        "page_size": "200",
        "order_by": "EditedTime",
        "direction": "DESC",
    })
    for f in result.get("data", {}).get("files", []):
        if f.get("type") == "folder" and f.get("name") == TRASH_FOLDER_NAME:
            return f["token"]

    # Get root folder token
    root = client.get("/drive/explorer/v2/root_folder/meta")
    root_token = root.get("data", {}).get("token", "")
    if not root_token:
        Log.error("Cannot determine root folder token.")
        sys.exit(1)

    Log.info(f"Creating '{TRASH_FOLDER_NAME}' folder...")
    cr = client.post("/drive/v1/files/create_folder", {
        "name": TRASH_FOLDER_NAME,
        "folder_token": root_token,
    })
    token = cr.get("data", {}).get("token", "")
    if not token:
        Log.error(f"Failed to create trash folder: {cr.get('msg', '?')}")
        sys.exit(1)
    Log.ok(f"Trash folder created: {token}")
    return token


# ─── Block Flusher (batched writes) ─────────────────────────────────────────

def flush_blocks(client: FeishuClient, doc_id: str, parent_id: str,
                 blocks: List[dict], batch_size: int = 5,
                 table_data_queue: Optional[List[tuple]] = None):
    """Write blocks to document in batches, then fill table cells.

    Tables are two-step: API auto-creates empty cells when the table
    skeleton is written, then we fill each cell with a text block.
    """
    # Phase 1: write all blocks (tables are just skeletons at this point)
    # Track which batch index each block starts at for table block ID retrieval
    created_block_ids: List[str] = []  # parallel to blocks list
    for start in range(0, len(blocks), batch_size):
        batch = blocks[start:start + batch_size]
        # Tables must be written one at a time (API limitation)
        if any(b.get("block_type") == BT_TABLE for b in batch) and len(batch) > 1:
            # Split: write non-table blocks in batch, tables individually
            for b in batch:
                result = client.post(
                    f"/docx/v1/documents/{doc_id}/blocks/{parent_id}/children",
                    {"children": [b]},
                )
                if result.get("code", 0) != 0:
                    Log.error(f"Block write failed: {result.get('msg', '?')}")
                    return False
                children = result.get("data", {}).get("children", [{}])
                created_block_ids.append(children[0].get("block_id", "") if children else "")
                time.sleep(0.4)
        else:
            result = client.post(
                f"/docx/v1/documents/{doc_id}/blocks/{parent_id}/children",
                {"children": batch},
            )
            if result.get("code", 0) != 0:
                Log.error(f"Block write failed at batch {start // batch_size + 1}: {result.get('msg', '?')}")
                return False
            for child in result.get("data", {}).get("children", [{}] * len(batch)):
                created_block_ids.append(child.get("block_id", ""))
            if start + batch_size < len(blocks):
                time.sleep(0.4)

    # Phase 2: fill table cells with content
    if table_data_queue:
        for block_idx, rows in table_data_queue:
            table_block_id = created_block_ids[block_idx] if block_idx < len(created_block_ids) else ""
            if not table_block_id:
                Log.warn(f"Table block at index {block_idx} has no ID, skipping cell fill.")
                continue
            _fill_table_cells(client, doc_id, table_block_id, rows)

    return True


def _fill_table_cells(client: FeishuClient, doc_id: str, table_block_id: str,
                      rows: List[List[str]]):
    """Fill table cells by updating existing empty text blocks inside each cell.

    When a table is created, the API auto-creates each cell with one empty text block.
    We PATCH that existing block instead of adding new children (which causes schema mismatch).
    """
    # Read the table block to get cell IDs
    result = client.get(f"/docx/v1/documents/{doc_id}/blocks/{table_block_id}")
    table_data = result.get("data", {}).get("block", {}).get("table", {})
    cell_ids = table_data.get("cells", [])
    col_size = table_data.get("property", {}).get("column_size", 1)

    for row_idx, row in enumerate(rows):
        for col_idx, cell_text in enumerate(row):
            cell_pos = row_idx * col_size + col_idx
            if cell_pos >= len(cell_ids):
                break
            cell_id = cell_ids[cell_pos]
            if not cell_text.strip():
                continue

            # Get the cell's existing child text block
            cell_block = client.get(f"/docx/v1/documents/{doc_id}/blocks/{cell_id}")
            children = cell_block.get("data", {}).get("block", {}).get("children", [])
            if not children:
                continue
            text_block_id = children[0]

            # Update the existing text block with content
            elements = _parse_inline_md(cell_text)
            client.patch(
                f"/docx/v1/documents/{doc_id}/blocks/{text_block_id}",
                {
                    "update_text_elements": {
                        "elements": elements,
                    },
                },
            )
            time.sleep(0.2)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="docx.py", description="Feishu Docx v1 管理")
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("create", help="创建文档")
    p.add_argument("--title", required=True)
    p.add_argument("--folder-token", default="")

    p = sub.add_parser("get", help="获取文档信息")
    p.add_argument("--document-id", required=True)

    p = sub.add_parser("read", help="读取所有 Block (JSON)")
    p.add_argument("--document-id", required=True)

    p = sub.add_parser("read-text", help="读取为纯文本")
    p.add_argument("--document-id", required=True)

    p = sub.add_parser("append-text", help="追加文本段落")
    p.add_argument("--document-id", required=True)
    p.add_argument("--text", required=True)

    p = sub.add_parser("append-heading", help="追加标题")
    p.add_argument("--document-id", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--level", type=int, default=2)

    p = sub.add_parser("append-code", help="追加代码块")
    p.add_argument("--document-id", required=True)
    p.add_argument("--code", required=True)
    p.add_argument("--language", default="plaintext")

    p = sub.add_parser("create-block", help="创建子 Block")
    p.add_argument("--document-id", required=True)
    p.add_argument("--parent-block-id", required=True)
    p.add_argument("--block-type", default="text")
    p.add_argument("--content", default="")

    p = sub.add_parser("append-markdown", help="从 Markdown 追加内容")
    p.add_argument("--document-id", required=True)
    p.add_argument("--file", required=True)

    p = sub.add_parser("create-from-markdown", help="从 Markdown 创建文档")
    p.add_argument("--title", required=True)
    p.add_argument("--file", required=True)
    p.add_argument("--folder-token", default="")

    p = sub.add_parser("list", help="List Drive files")
    p.add_argument("--type", default="", help="Filter: docx, sheet, bitable, folder")
    p.add_argument("--folder", default="", help="Folder token (default: root)")
    p.add_argument("--shared", action="store_true", help="List cached shared folders")

    p = sub.add_parser("tree", help="Recursive directory tree")
    p.add_argument("--folder", default="", help="Root folder token (default: root)")
    p.add_argument("--depth", type=int, default=2, help="Max depth (default: 2)")
    p.add_argument("--shared", action="store_true", help="Show shared folder tree")

    p = sub.add_parser("shared-add", help="Cache a shared folder by URL")
    p.add_argument("--url", required=True, help="Shared folder URL (right-click folder → copy link)")

    p = sub.add_parser("shared-list", help="List cached shared folders")

    p = sub.add_parser("shared-remove", help="Remove a cached shared folder")
    p.add_argument("--token", default="", help="Folder token to remove")
    p.add_argument("--all", action="store_true", help="Remove all cached shared folders")

    p = sub.add_parser("search", help="Search files by name")
    p.add_argument("--name", required=True, help="File name keyword")

    p = sub.add_parser("read-raw", help="Read document as raw text (fast)")
    p.add_argument("--document-id", default="", help="Document token")
    p.add_argument("--name", default="", help="Find by name (alternative to --document-id)")

    p = sub.add_parser("trash", help="Move file to _trash folder")
    p.add_argument("--token", required=True, help="File token to trash")
    p.add_argument("--type", default="docx", help="File type (docx, sheet, bitable, folder)")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    if args.command == "create":
        body: dict = {"title": args.title}
        if args.folder_token:
            body["folder_token"] = args.folder_token
        result = client.post("/docx/v1/documents", body)
        output(result)
        doc_id = result.get("data", {}).get("document", {}).get("document_id", "?")
        Log.ok(f"Document created: {doc_id}")
        Log.info(f"URL: https://feishu.cn/docx/{doc_id}")

    elif args.command == "get":
        output(client.get(f"/docx/v1/documents/{args.document_id}"))

    elif args.command == "read":
        items = client.get_all(
            f"/docx/v1/documents/{args.document_id}/blocks",
            params={"page_size": "500", "document_revision_id": "-1"},
        )
        output({"document_id": args.document_id, "blocks": items, "count": len(items)})

    elif args.command == "read-text":
        items = client.get_all(
            f"/docx/v1/documents/{args.document_id}/blocks",
            params={"page_size": "500", "document_revision_id": "-1"},
        )
        for block in items:
            bt = block.get("block_type", 0)
            text = _extract_text(block, bt)
            if text is not None:
                print(text)

    elif args.command == "append-text":
        blocks = [make_text_block(args.text)]
        flush_blocks(client, args.document_id, args.document_id, blocks)
        Log.ok("Text appended.")

    elif args.command == "append-heading":
        blocks = [make_heading_block(args.level, args.text)]
        flush_blocks(client, args.document_id, args.document_id, blocks)
        Log.ok(f"H{args.level} appended.")

    elif args.command == "append-code":
        blocks = [make_code_block(args.code, args.language)]
        flush_blocks(client, args.document_id, args.document_id, blocks)
        Log.ok("Code block appended.")

    elif args.command == "create-block":
        if args.block_type == "divider":
            blocks = [make_divider_block()]
        else:
            blocks = [make_text_block(args.content)]
        flush_blocks(client, args.document_id, args.parent_block_id, blocks)
        Log.ok("Block created.")

    elif args.command == "append-markdown":
        with open(args.file) as f:
            md_text = f.read()
        blocks, table_data = markdown_to_blocks(md_text)
        flush_blocks(client, args.document_id, args.document_id, blocks, table_data_queue=table_data)
        Log.ok(f"Appended {len(blocks)} blocks from {args.file}")

    elif args.command == "create-from-markdown":
        # Step 1: create document
        body = {"title": args.title}
        if args.folder_token:
            body["folder_token"] = args.folder_token
        result = client.post("/docx/v1/documents", body)
        doc_id = result.get("data", {}).get("document", {}).get("document_id")
        if not doc_id:
            Log.error("Failed to create document.")
            output(result)
            sys.exit(1)

        # Step 2: write markdown blocks
        with open(args.file) as f:
            md_text = f.read()
        blocks, table_data = markdown_to_blocks(md_text)
        flush_blocks(client, doc_id, doc_id, blocks, table_data_queue=table_data)

        Log.ok(f"Document created: {doc_id} ({len(blocks)} blocks)")
        Log.info(f"URL: https://feishu.cn/docx/{doc_id}")
        output(result)

    elif args.command == "list":
        if args.shared and not args.folder:
            # List cached shared folders, then let user pick one
            folders = _load_shared_folders()
            if not folders:
                Log.warn("No shared folders cached. Use: ./feishu doc shared-add --url 'URL'")
                sys.exit(0)
            print("  Cached shared folders:")
            for i, (token, info) in enumerate(folders.items(), 1):
                name = info.get("name", "(unknown)")
                print(f"  {i:2}. {name:40} {token}")
            print(f"\n  Total: {len(folders)}")
            print(f"  Use: ./feishu doc list --folder <token> to browse.")
        else:
            params = {
                "page_size": "200",
                "order_by": "EditedTime",
                "direction": "DESC",
            }
            if args.type:
                params["file_type"] = args.type
            if args.folder:
                params["folder_token"] = args.folder
            files = client.get_all("/drive/v1/files", params=params, items_key="files")
            if not files and args.folder:
                _evict_shared_folder(args.folder)
            for i, f in enumerate(files, 1):
                name = f.get("name", "") or "(unnamed)"
                ftype = f.get("type", "?")
                token = f.get("token", "")
                print(f"  {i:2}. [{ftype:7}] {name:40} {token}")
            print(f"\n  Total: {len(files)}")

    elif args.command == "tree":
        def _tree(folder_token: str, prefix: str, depth: int, max_depth: int):
            if depth > max_depth:
                return
            params = {"page_size": "200", "order_by": "EditedTime", "direction": "DESC"}
            if folder_token:
                params["folder_token"] = folder_token
            files = client.get_all("/drive/v1/files", params=params, items_key="files")
            if not files and depth == 1:
                # Top-level empty = possible permission loss
                _evict_shared_folder(folder_token)
            for i, f in enumerate(files):
                is_last = (i == len(files) - 1)
                connector = "└── " if is_last else "├── "
                name = f.get("name", "") or "(unnamed)"
                ftype = f.get("type", "?")
                print(f"{prefix}{connector}[{ftype}] {name}")
                if ftype == "folder":
                    child_prefix = prefix + ("    " if is_last else "│   ")
                    _tree(f["token"], child_prefix, depth + 1, max_depth)
                time.sleep(0.1)

        if args.shared and not args.folder:
            # Show tree for all cached shared folders
            folders = _load_shared_folders()
            if not folders:
                Log.warn("No shared folders cached. Use: ./feishu doc shared-add --url 'URL'")
                sys.exit(0)
            for token, info in folders.items():
                name = info.get("name", token[:12])
                print(f"  📁 {name} ({token[:12]}...)")
                _tree(token, "  ", 1, args.depth)
                print()
        else:
            root = args.folder
            if not root:
                r = client.get("/drive/explorer/v2/root_folder/meta")
                root = r.get("data", {}).get("token", "")
            print(f"  Drive ({root[:12]}...)")
            _tree(root, "  ", 1, args.depth)

    elif args.command == "search":
        files = client.get_all("/drive/v1/files", params={
            "page_size": "200",
            "order_by": "EditedTime",
            "direction": "DESC",
        }, items_key="files")
        keyword = args.name.lower()
        matched = [f for f in files if keyword in f.get("name", "").lower()]
        if not matched:
            Log.warn(f"No files matching '{args.name}'")
        for f in matched:
            print(f"  [{f.get('type', '?'):7}] {f.get('name', ''):40} {f.get('token', '')}")
        print(f"\n  Matched: {len(matched)}/{len(files)}")

    elif args.command == "read-raw":
        doc_id = args.document_id
        if not doc_id and args.name:
            # Resolve by name
            files = client.get_all("/drive/v1/files", params={
                "page_size": "200",
                "order_by": "EditedTime",
                "direction": "DESC",
            }, items_key="files")
            keyword = args.name.lower()
            matched = [f for f in files
                       if f.get("type") == "docx" and keyword in f.get("name", "").lower()]
            if not matched:
                Log.error(f"No docx matching '{args.name}'")
                sys.exit(1)
            if len(matched) > 1:
                Log.warn(f"Multiple matches for '{args.name}':")
                for f in matched:
                    print(f"  {f.get('name', ''):40} {f.get('token', '')}")
                Log.error("Use --document-id to specify.")
                sys.exit(1)
            doc_id = matched[0]["token"]
            Log.info(f"Found: {matched[0].get('name', '')} -> {doc_id}")
        elif not doc_id:
            Log.error("Provide --document-id or --name.")
            sys.exit(1)

        result = client.get(f"/docx/v1/documents/{doc_id}/raw_content")
        if result.get("code", -1) == 0:
            print(result.get("data", {}).get("content", ""))
        else:
            Log.error(f"Failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "trash":
        trash_token = _get_or_create_trash_folder(client)
        result = client.post(
            f"/drive/v1/files/{args.token}/move",
            {"type": args.type, "folder_token": trash_token},
        )
        if result.get("code", -1) == 0:
            Log.ok(f"Moved {args.token} to _trash folder.")
        else:
            Log.error(f"Move failed: {result.get('msg', '?')}")
            output(result)

    elif args.command == "shared-add":
        token = _extract_folder_token(args.url)
        if not token:
            Log.error("Cannot extract folder token from URL. Expected: https://xxx.feishu.cn/drive/folder/TOKEN")
            sys.exit(1)
        # Verify access and get folder name
        meta = client.get(f"/drive/explorer/v2/folder/{token}/meta")
        if meta.get("code", -1) != 0:
            Log.error(f"Cannot access folder: {meta.get('msg', '?')}")
            sys.exit(1)
        name = meta.get("data", {}).get("name", "(unnamed)")
        folders = _load_shared_folders()
        folders[token] = {
            "name": name,
            "url": args.url.strip(),
            "added_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }
        _save_shared_folders(folders)
        Log.ok(f"Shared folder cached: {name} ({token})")

    elif args.command == "shared-list":
        folders = _load_shared_folders()
        if not folders:
            Log.info("No shared folders cached.")
            Log.info("Add one: ./feishu doc shared-add --url 'https://xxx.feishu.cn/drive/folder/TOKEN'")
            sys.exit(0)
        for i, (token, info) in enumerate(folders.items(), 1):
            name = info.get("name", "(unknown)")
            added = info.get("added_at", "?")
            print(f"  {i}. {name:40} {token}")
            print(f"     added: {added}")
        print(f"\n  Total: {len(folders)}")

    elif args.command == "shared-remove":
        if args.all:
            _save_shared_folders({})
            Log.ok("All shared folders removed from cache.")
        elif args.token:
            token = _extract_folder_token(args.token)
            folders = _load_shared_folders()
            if token in folders:
                name = folders[token].get("name", token)
                del folders[token]
                _save_shared_folders(folders)
                Log.ok(f"Removed: {name}")
            else:
                Log.warn(f"Token not found in cache: {token}")
        else:
            Log.error("Provide --token or --all.")
            sys.exit(1)


def _render_elements_to_md(elems: List[dict]) -> str:
    """Render Feishu text elements back to Markdown syntax."""
    parts = []
    for e in elems:
        if "text_run" in e:
            content = e["text_run"].get("content", "")
            style = e["text_run"].get("text_element_style", {})
            if style.get("bold") and style.get("italic"):
                content = f"***{content}***"
            elif style.get("bold"):
                content = f"**{content}**"
            elif style.get("italic"):
                content = f"*{content}*"
            elif style.get("strikethrough"):
                content = f"~~{content}~~"
            elif style.get("inline_code"):
                content = f"`{content}`"
            elif style.get("link"):
                url = style["link"].get("url", "")
                content = f"[{content}]({url})"
            parts.append(content)
        elif "mention_doc" in e:
            parts.append(e["mention_doc"].get("title", "[doc]"))
        elif "equation" in e:
            parts.append(e["equation"].get("content", ""))
    return "".join(parts)


def _extract_text(block: dict, bt: int) -> Optional[str]:
    """Extract text from a block for read-text command, preserving inline formatting."""
    def field_md(field: str) -> str:
        return _render_elements_to_md(block.get(field, {}).get("elements", []))

    if bt == BT_PAGE:
        return None
    if bt == BT_TEXT:
        return field_md("text")
    if bt == BT_BULLET:
        return "- " + field_md("bullet")
    if bt == BT_ORDERED:
        return "1. " + field_md("ordered")
    if bt == BT_CODE:
        lang_name = LANG_NAME.get(block.get("code", {}).get("language", 0), "")
        elems = block.get("code", {}).get("elements", [])
        code_text = "".join(e.get("text_run", {}).get("content", "") for e in elems)
        return f"```{lang_name}\n{code_text}\n```"
    if bt == BT_QUOTE:
        return "> " + field_md("quote")
    if bt == BT_DIVIDER:
        return "---"
    if bt == BT_TODO:
        done = block.get("todo", {}).get("style", {}).get("done", False)
        marker = "[x]" if done else "[ ]"
        return f"- {marker} " + field_md("todo")

    # Headings: block_type 3~11 → heading level 1~9
    level = bt - 2
    if 1 <= level <= 9:
        return f"{'#' * level} " + field_md(HEADING_FIELD[level])

    # Fallback: callout, unknown types with elements
    for field in ("text", "callout"):
        elems = block.get(field, {}).get("elements", [])
        if elems:
            return _render_elements_to_md(elems)

    return f"[block_type={bt}]"


if __name__ == "__main__":
    main()
