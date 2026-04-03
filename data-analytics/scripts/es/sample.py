#!/usr/bin/env python3
"""ES Analytics — Data Sampling (quick peek at index data)."""

import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, get_profile, search, format_hits


def main():
    parser = argparse.ArgumentParser(description="ES 数据采样")
    parser.add_argument("index", help="索引名")
    parser.add_argument("-n", "--num", type=int, default=5, help="采样数量 (默认 5)")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("--format", choices=["table", "csv", "json"], default="table", help="输出格式")
    parser.add_argument("--oldest", action="store_true", help="从最早数据采样 (默认最新)")
    parser.add_argument("--no-full-range", action="store_true", help="禁用 SLS 自动全时间范围")
    args = parser.parse_args()

    _, profile = get_profile(args.profile)
    sort_order = "asc" if args.oldest else "desc"

    body = {
        "size": min(args.num, 200),
        "sort": [{"@timestamp": sort_order}]
    }

    full_range = not args.no_full_range
    result = search(profile, args.index, body, full_range=full_range)

    hits = result.get("hits", {}).get("hits", [])
    total = result.get("hits", {}).get("total", {})
    if isinstance(total, dict):
        total_val = total.get("value", 0)
    else:
        total_val = total

    Log.info(f"索引 {args.index} 总计 {total_val:,} 条, 采样 {len(hits)} 条 ({'最早' if args.oldest else '最新'})")

    if args.format == "json":
        # Show full _source for JSON mode
        sources = [h.get("_source", {}) for h in hits]
        print(json.dumps(sources, indent=2, default=str, ensure_ascii=False))
    else:
        format_hits(hits, args.format)


if __name__ == "__main__":
    main()
