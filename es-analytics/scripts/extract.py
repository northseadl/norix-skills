#!/usr/bin/env python3
"""ES Analytics — Full Unique Value Extraction (search_after pagination)."""

import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, get_profile, scroll_extract


def main():
    parser = argparse.ArgumentParser(description="ES 全量去重提取")
    parser.add_argument("index", help="索引名")
    parser.add_argument("--field", required=True, help="要提取的字段名 (支持嵌套, 如 content.auth_id)")
    parser.add_argument("--filter", default=None, help="JSON 过滤条件")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("-o", "--output", default=None, help="输出文件路径 (CSV 格式)")
    parser.add_argument("--batch-size", type=int, default=500, help="每批大小 (默认 500)")
    parser.add_argument("--max-batches", type=int, default=1000, help="最大批次数 (默认 1000)")
    parser.add_argument("--full-range", action="store_true", default=True)
    parser.add_argument("--no-full-range", action="store_true")
    args = parser.parse_args()

    _, profile = get_profile(args.profile)

    filter_query = None
    if args.filter:
        try:
            filter_query = json.loads(args.filter)
        except json.JSONDecodeError as e:
            Log.err(f"无效的 JSON 过滤条件: {e}")
            sys.exit(1)

    full_range = not args.no_full_range

    values = scroll_extract(
        profile, args.index, args.field,
        filter_query=filter_query,
        full_range=full_range,
        batch_size=args.batch_size,
        max_batches=args.max_batches,
    )

    print(f"\nUnique {args.field}: {len(values)}")
    for v in values:
        print(f"  {v}")

    if args.output:
        with open(args.output, "w") as f:
            f.write(",".join(values))
        Log.ok(f"已保存到 {args.output}")


if __name__ == "__main__":
    main()
