#!/usr/bin/env python3
"""ADB Analytics — Data Analyzer with Cross-Validation.

Usage via unified CLI:
  ./adb analyze -t table [-d database] [-p profile] [-c] [-g field] [--time-col col]
"""

import argparse
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from adb_core import Log, connect, execute, execute_raw, output, find_column_by_type, MAX_ROWS


def cross_validate(conn, table, where=""):
    """Run cross-validation checks: total count → random sample → numeric stats → time range."""
    Log.info("─── 交叉验证 ───")
    wc = f"WHERE {where}" if where else ""

    # Total rows
    cols, rows = execute_raw(conn, f"SELECT COUNT(*) as total_rows FROM {table} {wc}")
    output(cols, rows)

    # Random sample
    Log.info("随机样本抽查 (10 条)")
    cols, rows = execute_raw(conn, f"SELECT * FROM {table} {wc} ORDER BY RAND() LIMIT 10")
    output(cols, rows)

    # Numeric field stats
    num_col = find_column_by_type(conn, table, ["bigint", "int", "decimal", "float", "double"])
    if num_col:
        Log.info(f"数值字段 '{num_col}' 统计")
        cols, rows = execute_raw(conn,
            f"SELECT COUNT({num_col}) as cnt, MIN({num_col}) as min_val, "
            f"MAX({num_col}) as max_val, AVG({num_col}) as avg_val "
            f"FROM {table} {wc}"
        )
        output(cols, rows)

    # Time range
    time_col = find_column_by_type(conn, table, ["datetime", "timestamp", "date"])
    if time_col:
        Log.info(f"时间字段 '{time_col}' 范围")
        cols, rows = execute_raw(conn,
            f"SELECT MIN({time_col}) as earliest, MAX({time_col}) as latest, "
            f"COUNT(DISTINCT DATE({time_col})) as unique_days "
            f"FROM {table} {wc}"
        )
        output(cols, rows)

    Log.ok("交叉验证完成")


def main():
    parser = argparse.ArgumentParser(description="ADB 数据分析 (带交叉验证)")
    parser.add_argument("-t", "--table", required=True, help="表名")
    parser.add_argument("-p", "--profile", default=None, help="连接 profile")
    parser.add_argument("-d", "--database", default=None, help="数据库名")
    parser.add_argument("-w", "--where", default="", help="WHERE 条件")
    parser.add_argument("-c", "--count", action="store_true", help="计数分析")
    parser.add_argument("-g", "--group", default="", help="GROUP BY 字段")
    parser.add_argument("-a", "--aggregate", default="COUNT(*)", help="聚合表达式")
    parser.add_argument("--time-col", default="", help="时间字段")
    parser.add_argument("--start-date", default="", help="开始日期")
    parser.add_argument("--end-date", default="", help="结束日期")
    parser.add_argument("--format", default="table", choices=["table", "csv", "json"])

    args = parser.parse_args()

    # Build WHERE clause from time range
    where = args.where
    if args.time_col and args.start_date:
        time_cond = f"{args.time_col} >= '{args.start_date}'"
        if args.end_date:
            time_cond += f" AND {args.time_col} < '{args.end_date}'"
        where = f"{where} AND {time_cond}" if where else time_cond

    where_clause = f"WHERE {where}" if where else ""

    conn = connect(args.profile, args.database)
    try:
        if args.count:
            Log.info(f"计数分析: {args.table}")
            sql = f"SELECT COUNT(*) as total FROM {args.table} {where_clause}"
            cols, rows = execute(conn, sql)
            output(cols, rows, args.format)

        elif args.group:
            Log.info(f"聚合分析: {args.table} GROUP BY {args.group}")
            sql = (f"SELECT {args.group}, {args.aggregate} as metric "
                   f"FROM {args.table} {where_clause} "
                   f"GROUP BY {args.group} ORDER BY metric DESC LIMIT {MAX_ROWS}")
            cols, rows = execute(conn, sql)
            output(cols, rows, args.format)

        elif args.time_col:
            Log.info(f"时间序列分析: {args.table} BY {args.time_col}")
            sql = (f"SELECT DATE({args.time_col}) as date, COUNT(*) as count "
                   f"FROM {args.table} {where_clause} "
                   f"GROUP BY DATE({args.time_col}) ORDER BY date LIMIT {MAX_ROWS}")
            cols, rows = execute(conn, sql)
            output(cols, rows, args.format)

        else:
            Log.info(f"数据查询: {args.table}")
            sql = f"SELECT * FROM {args.table} {where_clause} LIMIT {MAX_ROWS}"
            cols, rows = execute(conn, sql)
            output(cols, rows, args.format)

        print()
        cross_validate(conn, args.table, where)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
