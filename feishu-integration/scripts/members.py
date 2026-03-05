#!/usr/bin/env python3
"""Feishu Member Directory — Scan, Cache, and Lookup.

Usage via unified CLI:
  ./feishu member scan|list|find|whoami
"""

import argparse
import json
import os
import sys
import time
from typing import Dict, List, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output

CACHE_FILE = os.path.expanduser("~/.agents/data/feishu/members.json")
CACHE_TTL_HOURS = 24 * 7  # 7 days


# ─── Cache Layer ─────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if not os.path.isfile(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(data: dict):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.chmod(CACHE_FILE, 0o600)


def is_cache_fresh(cache: dict) -> bool:
    updated = cache.get("updated_at", 0)
    if not updated:
        return False
    age_hours = (time.time() - updated) / 3600
    return age_hours < CACHE_TTL_HOURS


def build_index(members: List[Dict]) -> Dict[str, str]:
    """Build name → open_id reverse index (last-write-wins for duplicates)."""
    index: Dict[str, str] = {}
    for m in members:
        open_id = m.get("open_id", "")
        if not open_id:
            continue
        for key in ("name", "en_name"):
            name = m.get(key, "").strip()
            if name:
                index[name] = open_id
    return index


# ─── Member Resolution (importable by other scripts) ────────────────────────

def resolve_id_to_name(open_id: str) -> str:
    """Reverse resolve open_id to display name from cache. Returns open_id if not found."""
    cache = load_cache()
    for m in cache.get("members", []):
        if m.get("open_id") == open_id:
            return m.get("name") or m.get("en_name") or open_id
    return open_id


def resolve_ids_to_names(open_ids: list) -> list:
    """Batch resolve open_ids to display names. Single cache load for efficiency."""
    cache = load_cache()
    members = cache.get("members", [])
    id_map = {m["open_id"]: m.get("name") or m.get("en_name") or m["open_id"]
              for m in members if m.get("open_id")}
    return [id_map.get(oid, oid) for oid in open_ids]


def resolve_member(name: str, client: Optional[FeishuClient] = None) -> str:
    """Resolve a member name to open_id. Auto-scans if cache is stale."""
    cache = load_cache()
    if not is_cache_fresh(cache) or not cache.get("members"):
        if client:
            Log.info("Member cache stale, scanning...")
            cache = scan_members(client)
        else:
            Log.warn("Member cache stale. Run: ./feishu member scan")

    index = cache.get("index", {})
    members = cache.get("members", [])

    # Exact match
    if name in index:
        return index[name]

    # Fuzzy: substring match
    matches = [
        (m.get("name", ""), m.get("open_id", ""))
        for m in members
        if name in m.get("name", "") or name in m.get("en_name", "")
    ]

    if len(matches) == 1:
        return matches[0][1]
    elif len(matches) > 1:
        Log.warn(f"Multiple matches for '{name}':")
        for n, oid in matches:
            Log.warn(f"  {n} -> {oid}")
        Log.error("Please use a more specific name.")
        return ""
    else:
        Log.error(f"No member found for '{name}'")
        return ""


def resolve_members(names: str, client: Optional[FeishuClient] = None) -> List[str]:
    """Resolve comma-separated names to open_id list."""
    result: List[str] = []
    for name in names.split(","):
        name = name.strip()
        if not name:
            continue
        # Already an open_id
        if name.startswith("ou_"):
            result.append(name)
            continue
        oid = resolve_member(name, client)
        if oid:
            result.append(oid)
    return result


# ─── Scan ────────────────────────────────────────────────────────────────────

def scan_members(client: FeishuClient) -> dict:
    """Scan all organization members via contacts API and cache locally."""
    Log.info("Scanning organization members...")
    all_members: List[dict] = []
    page_token = ""

    while True:
        params: dict = {"department_id": "0", "page_size": "50"}
        if page_token:
            params["page_token"] = page_token
        result = client.get("/contact/v3/users", params=params)

        if result.get("code", -1) != 0:
            Log.error(f"Contacts API failed: {result.get('msg', '?')}")
            Log.error("Ensure 'contact:user.base:readonly' is enabled in developer console.")
            Log.error("Then run: ./feishu auth relogin")
            break

        data = result.get("data", {})
        items = data.get("items", [])
        for u in items:
            all_members.append({
                "open_id": u.get("open_id", ""),
                "name": u.get("name", ""),
                "en_name": u.get("en_name", ""),
                "email": u.get("email", ""),
                "mobile": u.get("mobile", ""),
                "department_ids": u.get("department_ids", []),
                "status": u.get("status", {}),
            })

        if not data.get("has_more"):
            break
        page_token = data.get("page_token", "")
        if not page_token:
            break

    index = build_index(all_members)

    cache = {
        "updated_at": time.time(),
        "updated_at_human": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(all_members),
        "members": all_members,
        "index": index,
    }
    save_cache(cache)
    Log.ok(f"Cached {len(all_members)} members → {CACHE_FILE}")
    return cache


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="members.py", description="飞书成员管理")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("scan", help="扫描组织成员并缓存")
    sub.add_parser("whoami", help="显示当前用户信息")

    p = sub.add_parser("list", help="列出缓存成员")
    p.add_argument("--format", choices=["table", "json"], default="table")

    p = sub.add_parser("find", help="按名字查找成员")
    p.add_argument("--name", required=True, help="成员名字（支持模糊匹配）")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    if args.command == "scan":
        scan_members(client)

    elif args.command == "whoami":
        result = client.get("/authen/v1/user_info")
        if result.get("code", -1) == 0:
            data = result.get("data", {})
            print(f"  Name:    {data.get('name', '?')}")
            print(f"  Open ID: {data.get('open_id', '?')}")
            print(f"  Email:   {data.get('email', '?')}")
            print(f"  Mobile:  {data.get('mobile', '?')}")
        else:
            output(result)

    elif args.command == "list":
        cache = load_cache()
        members = cache.get("members", [])
        if not members:
            Log.warn("No cached members. Run: ./feishu member scan")
            sys.exit(1)

        updated = cache.get("updated_at_human", "?")
        Log.info(f"{len(members)} members cached (updated: {updated})")

        if args.format == "json":
            output({"members": members, "count": len(members)})
        else:
            for m in members:
                status = "+" if m.get("status", {}).get("is_activated") else "-"
                print(f"  [{status}] {m['name']:<12} {m.get('en_name', ''):<16} {m['open_id']}")

    elif args.command == "find":
        oid = resolve_member(args.name, client)
        if oid:
            Log.ok(f"{args.name} → {oid}")
        else:
            sys.exit(1)


if __name__ == "__main__":
    main()
