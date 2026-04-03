#!/usr/bin/env python3
"""ADB Analytics — Connection Profile Management.

Usage via unified CLI:
  ./adb config add|list|use|test|remove|clean
"""

import argparse
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from adb_core import Log, CONFIG_DIR, load_profiles, save_profiles, get_profile, connect, safe_clean


def cmd_add(args):
    data = load_profiles()

    name = args.name
    if name in data["profiles"] and not args.force:
        Log.err(f"Profile '{name}' 已存在。使用 --force 覆盖")
        sys.exit(1)

    profile = {
        "host": args.host,
        "port": int(args.port),
        "user": args.user,
        "password": args.password,
    }
    if args.database:
        profile["database"] = args.database

    data["profiles"][name] = profile
    if data.get("default") is None or len(data["profiles"]) == 1:
        data["default"] = name

    save_profiles(data)
    Log.ok(f"已添加 profile: {name}")

    if args.test:
        _test_profile(name)


def cmd_list(_args):
    data = load_profiles()
    if not data["profiles"]:
        Log.info("无连接配置。使用 ./adb config add 添加")
        return

    default = data.get("default", "")
    print(f"{'  '} {'NAME':<16} {'HOST':<40} {'PORT':<6} {'USER':<20} {'DATABASE':<16}")
    print(f"{'  '} {'-'*16} {'-'*40} {'-'*6} {'-'*20} {'-'*16}")

    for name, p in data["profiles"].items():
        marker = "→ " if name == default else "  "
        db = p.get("database", "-")
        print(f"{marker} {name:<16} {p['host']:<40} {p.get('port', 3306):<6} {p['user']:<20} {db:<16}")


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
        conn = connect(name)
        with conn.cursor() as cur:
            cur.execute("SELECT VERSION() as version")
            version = (cur.fetchone() or {}).get("version", "unknown")
            cur.execute("SELECT DATABASE() as db")
            row = cur.fetchone()
            db = row["db"] if row and row["db"] else "(none)"
        conn.close()
        Log.ok(f"连接成功 [{name or '(default)'}] — Server: {version}, Database: {db}")
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
    safe_clean(CONFIG_DIR, "adb-mysql")


def main():
    parser = argparse.ArgumentParser(description="ADB 连接配置管理")
    sub = parser.add_subparsers(dest="command")

    p_add = sub.add_parser("add", help="添加连接配置")
    p_add.add_argument("name", help="Profile 名称")
    p_add.add_argument("--host", required=True, help="ADB/DMS 主机地址")
    p_add.add_argument("--port", default=3306, help="端口 (默认 3306)")
    p_add.add_argument("--user", required=True, help="用户名/AccessID")
    p_add.add_argument("--password", required=True, help="密码/AccessSecret")
    p_add.add_argument("--database", default="", help="默认数据库")
    p_add.add_argument("--force", action="store_true", help="覆盖已有 profile")
    p_add.add_argument("--test", action="store_true", help="添加后测试连接")

    sub.add_parser("list", help="列出所有连接配置")

    p_use = sub.add_parser("use", help="切换默认 profile")
    p_use.add_argument("name", help="Profile 名称")

    p_test = sub.add_parser("test", help="测试连接")
    p_test.add_argument("name", nargs="?", default=None, help="Profile 名称 (默认当前)")

    p_rm = sub.add_parser("remove", help="删除连接配置")
    p_rm.add_argument("name", help="Profile 名称")

    sub.add_parser("clean", help="清理所有技能数据 (~/.adb-mysql/)")

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
