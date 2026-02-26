#!/usr/bin/env python3
"""Feishu Bitable (多维表格) Management CLI.

Usage via unified CLI:
  ./feishu bitable list-tables|list-fields|list-records|get-record
  ./feishu bitable create-record|update-record|delete-record
  ./feishu bitable batch-create|batch-update|batch-delete
  ./feishu bitable create-table|delete-table|get-app|create-app
  ./feishu bitable export
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import time
from typing import List

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_app_token(url_or_token: str) -> str:
    """Extract app_token from a Bitable URL or raw token."""
    match = re.search(r"/base/([A-Za-z0-9]+)", url_or_token)
    if match:
        return match.group(1)
    if re.match(r"^[A-Za-z0-9]{10,}$", url_or_token.strip()):
        return url_or_token.strip()
    return url_or_token.strip()


def _parse_fields_json(raw: str) -> dict:
    """Parse field JSON from CLI argument or file path."""
    if os.path.isfile(raw):
        with open(raw) as f:
            return json.load(f)
    return json.loads(raw)


def _format_record_row(record: dict, field_names: List[str]) -> List[str]:
    """Format a record's fields into a flat string list for display."""
    fields = record.get("fields", {})
    row = [record.get("record_id", "")]
    for name in field_names:
        val = fields.get(name, "")
        if isinstance(val, list):
            # Multi-select, person, attachment arrays
            parts = []
            for item in val:
                if isinstance(item, dict):
                    parts.append(item.get("text", item.get("name", item.get("id", str(item)))))
                else:
                    parts.append(str(item))
            row.append(", ".join(parts))
        elif isinstance(val, dict):
            # Hyperlink, single-link
            row.append(val.get("text", val.get("link", json.dumps(val, ensure_ascii=False))))
        elif isinstance(val, bool):
            row.append("✅" if val else "❌")
        else:
            row.append(str(val) if val is not None else "")
    return row


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="bitable.py", description="Feishu Bitable 多维表格管理")
    sub = parser.add_subparsers(dest="command")

    # App operations
    p = sub.add_parser("get-app", help="获取多维表格信息")
    p.add_argument("--app-token", required=True, help="App token or Bitable URL")

    p = sub.add_parser("create-app", help="创建多维表格")
    p.add_argument("--name", required=True)
    p.add_argument("--folder-token", default="")

    # Table operations
    p = sub.add_parser("list-tables", help="列出数据表")
    p.add_argument("--app-token", required=True)

    p = sub.add_parser("create-table", help="创建数据表")
    p.add_argument("--app-token", required=True)
    p.add_argument("--name", required=True)

    p = sub.add_parser("delete-table", help="删除数据表")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)

    # Field operations
    p = sub.add_parser("list-fields", help="列出字段")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)

    p = sub.add_parser("create-field", help="创建字段")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--type", type=int, required=True, help="Field type ID (1=text, 2=number, 3=select...)")

    # Record operations
    p = sub.add_parser("list-records", help="列出记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--view-id", default="")
    p.add_argument("--filter", default="", help="Filter expression")
    p.add_argument("--page-size", type=int, default=100)
    p.add_argument("--json", action="store_true", help="Output as JSON")

    p = sub.add_parser("get-record", help="获取单条记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--record-id", required=True)

    p = sub.add_parser("create-record", help="创建记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--fields", required=True, help="JSON string or file path")

    p = sub.add_parser("update-record", help="更新记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--record-id", required=True)
    p.add_argument("--fields", required=True, help="JSON string or file path")

    p = sub.add_parser("delete-record", help="删除记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--record-id", required=True)

    # Batch operations
    p = sub.add_parser("batch-create", help="批量创建记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--file", required=True, help="JSON file: [{fields: {...}}, ...]")

    p = sub.add_parser("batch-update", help="批量更新记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--file", required=True, help="JSON file: [{record_id: ..., fields: {...}}, ...]")

    p = sub.add_parser("batch-delete", help="批量删除记录")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--record-ids", required=True, help="Comma-separated record IDs")

    # Export
    p = sub.add_parser("export", help="导出记录为 JSON 或 CSV")
    p.add_argument("--app-token", required=True)
    p.add_argument("--table-id", required=True)
    p.add_argument("--format", default="json", choices=["json", "csv"])
    p.add_argument("--output", default="", help="Output file path (default: stdout)")
    p.add_argument("--view-id", default="")
    p.add_argument("--filter", default="")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    # Normalize app_token from URL
    if hasattr(args, "app_token"):
        args.app_token = _extract_app_token(args.app_token)

    base = "/bitable/v1/apps"

    # ── App ──────────────────────────────────────────────────────────────

    if args.command == "get-app":
        output(client.get(f"{base}/{args.app_token}"))

    elif args.command == "create-app":
        body: dict = {"name": args.name}
        if args.folder_token:
            body["folder_token"] = args.folder_token
        result = client.post(base, body)
        output(result)
        token = result.get("data", {}).get("app", {}).get("app_token", "?")
        Log.ok(f"Bitable created: {token}")
        Log.info(f"URL: https://feishu.cn/base/{token}")

    # ── Table ────────────────────────────────────────────────────────────

    elif args.command == "list-tables":
        items = client.get_all(
            f"{base}/{args.app_token}/tables",
            params={"page_size": "20"},
        )
        for i, t in enumerate(items, 1):
            print(f"  {i:2}. {t.get('name', ''):30} {t.get('table_id', '')}")
        print(f"\n  Total: {len(items)}")

    elif args.command == "create-table":
        result = client.post(f"{base}/{args.app_token}/tables", {
            "table": {"name": args.name},
        })
        output(result)
        tid = result.get("data", {}).get("table_id", "?")
        Log.ok(f"Table created: {tid}")

    elif args.command == "delete-table":
        result = client.delete(f"{base}/{args.app_token}/tables/{args.table_id}")
        if result.get("code", -1) == 0:
            Log.ok(f"Table {args.table_id} deleted.")
        else:
            Log.error(f"Delete failed: {result.get('msg', '?')}")
            output(result)

    # ── Field ────────────────────────────────────────────────────────────

    elif args.command == "list-fields":
        items = client.get_all(
            f"{base}/{args.app_token}/tables/{args.table_id}/fields",
            params={"page_size": "100"},
        )
        TYPE_NAMES = {
            1: "Text", 2: "Number", 3: "Select", 4: "MultiSel",
            5: "DateTime", 7: "Check", 11: "Person", 13: "Phone",
            15: "Link", 17: "Attach", 18: "Relation", 19: "Lookup",
            20: "Formula", 22: "Created", 23: "Modified",
            1001: "CreatedBy", 1002: "ModifiedBy", 1005: "AutoNum",
        }
        for f in items:
            ftype = TYPE_NAMES.get(f.get("type", 0), f"type={f.get('type')}")
            primary = " ★" if f.get("is_primary") else ""
            print(f"  {f.get('field_name', ''):20} [{ftype:10}] {f.get('field_id', '')}{primary}")
        print(f"\n  Total: {len(items)}")

    elif args.command == "create-field":
        result = client.post(
            f"{base}/{args.app_token}/tables/{args.table_id}/fields",
            {"field_name": args.name, "type": args.type},
        )
        output(result)
        fid = result.get("data", {}).get("field", {}).get("field_id", "?")
        Log.ok(f"Field created: {fid}")

    # ── Record CRUD ──────────────────────────────────────────────────────

    elif args.command == "list-records":
        params: dict = {"page_size": str(args.page_size)}
        if args.view_id:
            params["view_id"] = args.view_id
        if args.filter:
            params["filter"] = args.filter

        items = client.get_all(
            f"{base}/{args.app_token}/tables/{args.table_id}/records",
            params=params,
        )

        if getattr(args, "json", False):
            output({"records": items, "total": len(items)})
        else:
            if not items:
                Log.info("No records found.")
                return
            # Auto-detect field names from first record
            field_names = list(items[0].get("fields", {}).keys())
            # Print header
            header = ["record_id"] + field_names
            print("  " + " | ".join(f"{h:15}" for h in header[:6]))
            print("  " + "-" * min(100, 17 * min(len(header), 6)))
            for rec in items:
                row = _format_record_row(rec, field_names)
                print("  " + " | ".join(f"{c[:15]:15}" for c in row[:6]))
            print(f"\n  Total: {len(items)}")

    elif args.command == "get-record":
        result = client.get(
            f"{base}/{args.app_token}/tables/{args.table_id}/records/{args.record_id}"
        )
        output(result)

    elif args.command == "create-record":
        fields = _parse_fields_json(args.fields)
        result = client.post(
            f"{base}/{args.app_token}/tables/{args.table_id}/records",
            {"fields": fields},
        )
        rid = result.get("data", {}).get("record", {}).get("record_id", "?")
        Log.ok(f"Record created: {rid}")
        output(result)

    elif args.command == "update-record":
        fields = _parse_fields_json(args.fields)
        result = client.put(
            f"{base}/{args.app_token}/tables/{args.table_id}/records/{args.record_id}",
            {"fields": fields},
        )
        Log.ok(f"Record {args.record_id} updated.")
        output(result)

    elif args.command == "delete-record":
        result = client.delete(
            f"{base}/{args.app_token}/tables/{args.table_id}/records/{args.record_id}"
        )
        if result.get("code", -1) == 0:
            Log.ok(f"Record {args.record_id} deleted.")
        else:
            Log.error(f"Delete failed: {result.get('msg', '?')}")
            output(result)

    # ── Batch Operations ─────────────────────────────────────────────────

    elif args.command == "batch-create":
        with open(args.file) as f:
            records = json.load(f)
        if not isinstance(records, list):
            Log.error("File must contain a JSON array of records.")
            sys.exit(1)

        # Batch in chunks of 500
        created = 0
        for start in range(0, len(records), 500):
            batch = records[start:start + 500]
            result = client.post(
                f"{base}/{args.app_token}/tables/{args.table_id}/records/batch_create",
                {"records": [{"fields": r} if "fields" not in r else r for r in batch]},
            )
            if result.get("code", 0) != 0:
                Log.error(f"Batch create failed at offset {start}: {result.get('msg', '?')}")
                output(result)
                return
            created += len(batch)
            if start + 500 < len(records):
                time.sleep(0.5)
        Log.ok(f"Batch created {created} records.")

    elif args.command == "batch-update":
        with open(args.file) as f:
            records = json.load(f)
        if not isinstance(records, list):
            Log.error("File must contain a JSON array of {record_id, fields} objects.")
            sys.exit(1)

        updated = 0
        for start in range(0, len(records), 500):
            batch = records[start:start + 500]
            result = client.post(
                f"{base}/{args.app_token}/tables/{args.table_id}/records/batch_update",
                {"records": batch},
            )
            if result.get("code", 0) != 0:
                Log.error(f"Batch update failed at offset {start}: {result.get('msg', '?')}")
                output(result)
                return
            updated += len(batch)
            if start + 500 < len(records):
                time.sleep(0.5)
        Log.ok(f"Batch updated {updated} records.")

    elif args.command == "batch-delete":
        record_ids = [r.strip() for r in args.record_ids.split(",") if r.strip()]
        if not record_ids:
            Log.error("No record IDs provided.")
            sys.exit(1)

        deleted = 0
        for start in range(0, len(record_ids), 500):
            batch = record_ids[start:start + 500]
            result = client.post(
                f"{base}/{args.app_token}/tables/{args.table_id}/records/batch_delete",
                {"records": batch},
            )
            if result.get("code", 0) != 0:
                Log.error(f"Batch delete failed at offset {start}: {result.get('msg', '?')}")
                output(result)
                return
            deleted += len(batch)
            if start + 500 < len(record_ids):
                time.sleep(0.5)
        Log.ok(f"Batch deleted {deleted} records.")

    # ── Export ────────────────────────────────────────────────────────────

    elif args.command == "export":
        params: dict = {"page_size": "500"}
        if args.view_id:
            params["view_id"] = args.view_id
        if args.filter:
            params["filter"] = args.filter

        items = client.get_all(
            f"{base}/{args.app_token}/tables/{args.table_id}/records",
            params=params,
        )

        if not items:
            Log.info("No records to export.")
            return

        if args.format == "json":
            content = json.dumps(
                [{"record_id": r.get("record_id"), **r.get("fields", {})} for r in items],
                ensure_ascii=False, indent=2,
            )
        else:
            # CSV
            field_names = list(items[0].get("fields", {}).keys())
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["record_id"] + field_names)
            for rec in items:
                writer.writerow(_format_record_row(rec, field_names))
            content = buf.getvalue()

        if args.output:
            with open(args.output, "w") as f:
                f.write(content)
            Log.ok(f"Exported {len(items)} records to {args.output}")
        else:
            print(content)
            Log.ok(f"Exported {len(items)} records.")


if __name__ == "__main__":
    main()
