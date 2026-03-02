#!/usr/bin/env python3
"""ES Analytics — Read-only Query Execution."""

import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import (Log, get_profile, search, enforce_size, format_hits)


def main():
    parser = argparse.ArgumentParser(description="ES 只读查询")
    parser.add_argument("body", help="JSON 查询体")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("-i", "--index", default=None, help="索引名")
    parser.add_argument("--format", choices=["table", "csv", "json"], default="table", help="输出格式")
    parser.add_argument("--full-range", action="store_true", default=True, help="SLS 自动全时间范围 (默认开启)")
    parser.add_argument("--no-full-range", action="store_true", help="禁用 SLS 自动全时间范围")
    args = parser.parse_args()

    name, profile = get_profile(args.profile)
    index = args.index or profile.get("default_index")

    if not index:
        Log.err("未指定索引。使用 -i <index> 或在 profile 中设置 default-index")
        sys.exit(1)

    try:
        body = json.loads(args.body)
    except json.JSONDecodeError as e:
        Log.err(f"无效的 JSON 查询体: {e}")
        sys.exit(1)

    body = enforce_size(body)
    full_range = not args.no_full_range

    result = search(profile, index, body, full_range=full_range)

    # Handle response
    hits = result.get("hits", {})
    total = hits.get("total", {})
    if isinstance(total, dict):
        total_val = total.get("value", 0)
    else:
        total_val = total

    hit_list = hits.get("hits", [])

    if args.format == "json":
        print(json.dumps(result, indent=2, default=str, ensure_ascii=False))
    else:
        Log.info(f"总计 {total_val} 条匹配, 返回 {len(hit_list)} 条")
        format_hits(hit_list, args.format)

    # Show aggregations if present
    aggs = result.get("aggregations", {})
    if aggs:
        print("\n--- Aggregations ---")
        print(json.dumps(aggs, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
