#!/usr/bin/env python3
"""ADB Analytics — SQL Query Executor (Read-Only).

Usage via unified CLI:
  ./adb query "SELECT ..." [-p profile] [-d database] [--format table|csv|json]
  ./adb query -f query.sql
"""

import argparse
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from adb_core import Log, connect, execute, output


def main():
    parser = argparse.ArgumentParser(description="ADB 只读查询执行器")
    parser.add_argument("sql", nargs="?", help="SQL 语句")
    parser.add_argument("-f", "--file", help="从文件读取 SQL")
    parser.add_argument("-p", "--profile", default=None, help="连接 profile")
    parser.add_argument("-d", "--database", default=None, help="数据库名")
    parser.add_argument("--format", default="table", choices=["table", "csv", "json"], help="输出格式")

    args = parser.parse_args()

    sql = args.sql
    if args.file:
        if not os.path.exists(args.file):
            Log.err(f"SQL 文件不存在: {args.file}")
            sys.exit(1)
        with open(args.file, "r") as f:
            sql = f.read()

    if not sql:
        Log.err("未提供 SQL 语句。使用 ./adb query \"SELECT ...\" 或 -f file.sql")
        sys.exit(1)

    conn = connect(args.profile, args.database)
    try:
        columns, rows = execute(conn, sql)
        output(columns, rows, args.format)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
