#!/usr/bin/env python3
"""ES Analytics — Mapping Viewer."""

import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, get_profile, safe_request


def _flatten_mapping(properties, prefix=""):
    """Flatten nested mapping properties into field_name -> type pairs."""
    rows = []
    for name, info in sorted(properties.items()):
        full_name = f"{prefix}{name}" if not prefix else f"{prefix}.{name}"
        field_type = info.get("type", "object")
        rows.append({"field": full_name, "type": field_type})

        # Recurse into nested properties
        if "properties" in info:
            rows.extend(_flatten_mapping(info["properties"], full_name))

    return rows


def main():
    parser = argparse.ArgumentParser(description="查看索引 Mapping")
    parser.add_argument("index", help="索引名")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("--raw", action="store_true", help="输出原始 JSON")
    args = parser.parse_args()

    _, profile = get_profile(args.profile)

    result = safe_request(profile, "GET", f"/{args.index}/_mapping")

    if args.raw:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    # Parse mapping
    for index_name, index_data in result.items():
        mappings = index_data.get("mappings", {})
        properties = mappings.get("properties", {})

        if not properties:
            Log.info(f"索引 {index_name} 无 mapping 信息")
            continue

        rows = _flatten_mapping(properties)
        print(f"\n索引: {index_name}")
        print(f"{'字段':<50} {'类型':<15}")
        print(f"{'-'*50} {'-'*15}")
        for row in rows:
            print(f"{row['field']:<50} {row['type']:<15}")
        Log.info(f"{len(rows)} 个字段")


if __name__ == "__main__":
    main()
