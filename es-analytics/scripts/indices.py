#!/usr/bin/env python3
"""ES Analytics — Index Listing."""

import argparse
import fnmatch
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, get_profile, safe_request


def main():
    parser = argparse.ArgumentParser(description="列出 ES 索引")
    parser.add_argument("-p", "--profile", default=None, help="Profile 名称")
    parser.add_argument("--filter", default=None, help="索引名过滤 (glob 模式)")
    args = parser.parse_args()

    _, profile = get_profile(args.profile)

    result = safe_request(profile, "GET", "/_cat/indices?v&s=index:asc")

    if isinstance(result, dict) and "_raw" in result:
        lines = result["_raw"].strip().split("\n")
        if args.filter:
            header = lines[0] if lines else ""
            filtered = [header] + [
                l for l in lines[1:]
                if args.filter in l
            ] if len(lines) > 1 else lines
            print("\n".join(filtered))
            Log.info(f"{len(filtered) - 1} 个索引匹配")
        else:
            print(result["_raw"])
            Log.info(f"{len(lines) - 1} 个索引")
    else:
        # JSON format fallback
        if isinstance(result, list):
            for idx in result:
                name = idx.get("index", "")
                if args.filter and not fnmatch.fnmatch(name, f"*{args.filter}*"):
                    continue
                print(f"  {name}")


if __name__ == "__main__":
    main()
