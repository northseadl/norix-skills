#!/usr/bin/env python3
"""ES Analytics — Connection Profile Management.

Usage via unified CLI:
  ./es config add|list|use|test|remove|clean
"""

import argparse
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from es_core import Log, CONFIG_DIR, load_profiles, save_profiles, get_profile, es_request, safe_clean


def cmd_add(args):
    data = load_profiles()

    name = args.name
    if name in data["profiles"] and not args.force:
        Log.err(f"Profile '{name}' 已存在。使用 --force 覆盖")
        sys.exit(1)

    profile = {"url": args.url.rstrip("/")}

    if args.user:
        profile["user"] = args.user
    if args.password:
        profile["password"] = args.password
    if args.default_index:
        profile["default_index"] = args.default_index
    if args.sls:
        profile["sls"] = True

    data["profiles"][name] = profile
    if data.get("default") is None or len(data["profiles"]) == 1:
        data["default"] = name

    save_profiles(data)
    Log.ok(f"已添加 profile: {name}")

    if args.sls:
        Log.info("已标记为 SLS ES 兼容端点（查询将自动注入全时间范围）")

    if args.test:
        _test_profile(name)


def cmd_list(_args):
    data = load_profiles()
    if not data["profiles"]:
        Log.info("无连接配置。使用 ./es config add 添加")
        return

    default = data.get("default", "")
    print(f"{'  '} {'NAME':<16} {'URL':<55} {'SLS':<5} {'DEFAULT_INDEX':<20}")
    print(f"{'  '} {'-'*16} {'-'*55} {'-'*5} {'-'*20}")

    for name, p in data["profiles"].items():
        marker = "→ " if name == default else "  "
        sls = "✓" if p.get("sls") else ""
        idx = p.get("default_index", "-")
        url = p["url"][:55]
        print(f"{marker} {name:<16} {url:<55} {sls:<5} {idx:<20}")


def cmd_use(args):
    data = load_profiles()
    if args.name not in data["profiles"]:
        Log.err(f"Profile '{args.name}' 不存在")
        sys.exit(1)

    data["default"] = args.name
    save_profiles(data)
    Log.ok(f"默认 profile 已切换为: {args.name}")


def cmd_test(args):
    _test_profile(args.name)


def _test_profile(name=None):
    try:
        pname, profile = get_profile(name)
        # Simple cluster health check
        try:
            result = es_request(profile, "GET", "/")
            version = result.get("version", {}).get("number", "unknown")
            cluster = result.get("cluster_name", "unknown")
            Log.ok(f"连接成功 [{pname}] — Cluster: {cluster}, Version: {version}")
        except SystemExit:
            # Standard ES root might work; SLS might not have root endpoint
            # Try _cat/indices instead
            try:
                result = es_request(profile, "GET", "/_cat/indices?format=json&h=index&s=index:asc", timeout=10)
                if isinstance(result, list):
                    Log.ok(f"连接成功 [{pname}] — {len(result)} 个索引可用")
                elif isinstance(result, dict) and "_raw" in result:
                    lines = [l for l in result["_raw"].strip().split("\n") if l.strip()]
                    Log.ok(f"连接成功 [{pname}] — {len(lines)} 个索引可用")
                else:
                    Log.ok(f"连接成功 [{pname}]")
            except SystemExit:
                Log.err(f"连接失败 [{pname}]")
    except SystemExit:
        pass


def cmd_remove(args):
    data = load_profiles()
    if args.name not in data["profiles"]:
        Log.err(f"Profile '{args.name}' 不存在")
        sys.exit(1)

    del data["profiles"][args.name]
    if data.get("default") == args.name:
        data["default"] = next(iter(data["profiles"]), None)

    save_profiles(data)
    Log.ok(f"已删除 profile: {args.name}")


def cmd_clean(_args):
    safe_clean(CONFIG_DIR, "es-analytics")


def main():
    parser = argparse.ArgumentParser(description="ES 连接配置管理")
    sub = parser.add_subparsers(dest="command")

    p_add = sub.add_parser("add", help="添加连接配置")
    p_add.add_argument("name", help="Profile 名称")
    p_add.add_argument("--url", required=True, help="ES 基础 URL (含协议和端口)")
    p_add.add_argument("--user", default="", help="用户名/AccessID")
    p_add.add_argument("--password", default="", help="密码/AccessSecret")
    p_add.add_argument("--default-index", default="", help="默认索引名")
    p_add.add_argument("--sls", action="store_true", help="标记为 SLS ES 兼容端点")
    p_add.add_argument("--force", action="store_true", help="覆盖已有 profile")
    p_add.add_argument("--test", action="store_true", help="添加后测试连接")

    sub.add_parser("list", help="列出所有连接配置")

    p_use = sub.add_parser("use", help="切换默认 profile")
    p_use.add_argument("name", help="Profile 名称")

    p_test = sub.add_parser("test", help="测试连接")
    p_test.add_argument("name", nargs="?", default=None, help="Profile 名称 (默认当前)")

    p_rm = sub.add_parser("remove", help="删除连接配置")
    p_rm.add_argument("name", help="Profile 名称")

    sub.add_parser("clean", help="清理所有技能数据 (~/.agents/data/es-analytics/)")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    dispatch = {
        "add": cmd_add, "list": cmd_list, "use": cmd_use,
        "test": cmd_test, "remove": cmd_remove, "clean": cmd_clean,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
