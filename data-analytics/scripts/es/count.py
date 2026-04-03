#!/usr/bin/env python3
"""ES Analytics — Document Count."""

import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, get_profile, count as es_count


def main():
    parser = argparse.ArgumentParser(description="ES 文档计数")
    parser.add_argument("index", help="索引名")
    parser.add_argument("body", nargs="?", default=None, help="JSON 查询条件 (可选)")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("--full-range", action="store_true", default=True, help="SLS 全时间范围 (默认开启)")
    parser.add_argument("--no-full-range", action="store_true", help="禁用 SLS 自动全时间范围")
    args = parser.parse_args()

    _, profile = get_profile(args.profile)

    body = None
    if args.body:
        try:
            body = json.loads(args.body)
        except json.JSONDecodeError as e:
            Log.err(f"无效的 JSON: {e}")
            sys.exit(1)

    full_range = not args.no_full_range
    result = es_count(profile, args.index, body, full_range=full_range)
    total = result.get("count", 0)
    print(f"Count: {total:,}")


if __name__ == "__main__":
    main()
