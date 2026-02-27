#!/usr/bin/env python3
"""ADB Analytics — Schema Documentation Generator.

Usage via unified CLI:
  ./adb schema [database] [-p profile] [-o output_dir]
"""

import argparse
import re
import sys
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from adb_core import Log, connect, execute_raw, find_column_by_type, SCHEMA_DIR

_ENGINE_LABELS = {
    "XUANWU": "列式存储 (OLAP)",
    "ADB_SIMPLE": "行存 (点查)",
    "ADB_DIMENSION": "维表 (广播)",
}


def generate_table_doc(conn, db, table):
    """Generate Markdown documentation for a single table."""
    lines = [f"# 表: {table}", "", f"数据库: {db}", "", "---", ""]

    # Basic info
    _, rows = execute_raw(conn,
        f"SELECT ENGINE, TABLE_ROWS, DATA_LENGTH, TABLE_COMMENT "
        f"FROM information_schema.TABLES "
        f"WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'"
    )
    if rows:
        r = rows[0]
        engine = r.get("ENGINE", "")
        lines += [
            "## 基本信息", "",
            "| 属性 | 值 |", "|------|-----|",
            f"| 存储引擎 | {engine} |",
            f"| 引擎类型 | {_ENGINE_LABELS.get(engine, engine)} |",
            f"| 记录数 | {r.get('TABLE_ROWS', 'N/A')} |",
            f"| 数据大小 | {r.get('DATA_LENGTH', 'N/A')} bytes |",
        ]
        comment = r.get("TABLE_COMMENT", "")
        if comment:
            lines.append(f"| 注释 | {comment} |")
        lines.append("")

    # Columns
    _, cols = execute_raw(conn,
        f"SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, "
        f"IFNULL(COLUMN_DEFAULT, '') as COL_DEFAULT, "
        f"IFNULL(COLUMN_COMMENT, '') as COL_COMMENT "
        f"FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}' "
        f"ORDER BY ORDINAL_POSITION"
    )
    lines += ["## 字段定义", "", "| 字段名 | 类型 | 可空 | 默认值 | 注释 |",
              "|--------|------|------|--------|------|"]
    for c in cols:
        lines.append(
            f"| {c['COLUMN_NAME']} | {c['COLUMN_TYPE']} | {c['IS_NULLABLE']} "
            f"| {c.get('COL_DEFAULT', '')} | {c.get('COL_COMMENT', '')} |"
        )
    lines.append("")

    # Indexes
    _, idxs = execute_raw(conn,
        f"SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME "
        f"FROM information_schema.STATISTICS "
        f"WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}' "
        f"ORDER BY INDEX_NAME, SEQ_IN_INDEX"
    )
    if idxs:
        lines += ["## 索引", "", "| 索引名 | 唯一性 | 字段 |", "|--------|--------|------|"]
        for idx in idxs:
            unique = "主键" if idx["INDEX_NAME"] == "PRIMARY" else ("唯一" if idx["NON_UNIQUE"] == 0 else "非唯一")
            lines.append(f"| {idx['INDEX_NAME']} | {unique} | {idx['COLUMN_NAME']} |")
        lines.append("")

    # Distribution key (ADB-specific)
    lines += ["## 分布键", ""]
    try:
        _, show_rows = execute_raw(conn, f"SHOW CREATE TABLE `{table}`")
        create_sql = str(show_rows[0].get("Create Table", "")) if show_rows else ""
        match = re.search(r"DISTRIBUTED BY\s*\([^)]+\)", create_sql, re.IGNORECASE)
        if match:
            lines.append(f"- **分布键**: {match.group(0)}")
            lines.append("")
            lines.append("> **优化建议**: JOIN 和 GROUP BY 时使用分布键可提升性能")
        else:
            lines.append("- 未显式设置分布键（使用默认分布策略）")
    except Exception:
        lines.append("- 无法获取分布键信息")
    lines.append("")

    # Query examples
    lines += ["## 查询示例", "", "```sql",
              f"-- 查询前 200 条", f"SELECT * FROM {table} LIMIT 200;", "",
              f"-- 统计记录数", f"SELECT COUNT(*) FROM {table};", "```", ""]

    # Time-based example
    tc = find_column_by_type(conn, table, ["datetime", "timestamp", "date"])
    if tc:
        lines += [
            "### 时间范围查询", "```sql",
            f"SELECT * FROM {table}",
            f"WHERE {tc} >= '2024-01-01' AND {tc} < '2024-02-01'",
            "LIMIT 200;", "```", "",
        ]

    lines += ["---", "", f"*生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*"]
    return "\n".join(lines)


def generate_index_doc(conn, db, tables):
    """Generate a schema index file listing all tables."""
    lines = [
        f"# 数据库: {db} — Schema 索引", "",
        "> **ADB (AnalyticDB) 列式分布式数据库**",
        f"> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", "",
        "---", "",
        "## 概览", "", f"- **表数量**: {len(tables)}", "",
        "## 表列表", "",
        "| 表名 | 引擎 | 记录数 |", "|------|------|--------|",
    ]

    for table in tables:
        _, rows = execute_raw(conn,
            f"SELECT ENGINE, TABLE_ROWS FROM information_schema.TABLES "
            f"WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'"
        )
        if rows:
            lines.append(f"| [{table}]({table}.md) | {rows[0].get('ENGINE', '')} | {rows[0].get('TABLE_ROWS', '')} |")

    lines += ["", "## 快速导航", ""]
    for table in tables:
        lines.append(f"- [{table}]({table}.md)")

    lines += [
        "", "---", "",
        "## 查询规范", "",
        "- **最大返回行数**: 200 条",
        "- **优先使用 WHERE**: 利用分区裁剪和索引",
        "- **避免 SELECT ***: 使用列裁剪",
        "- **分布键**: JOIN 和 GROUP BY 时使用分布键",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="ADB Schema 文档生成器")
    parser.add_argument("database", nargs="?", default=None, help="数据库名")
    parser.add_argument("-p", "--profile", default=None, help="连接 profile")
    parser.add_argument("-o", "--output", default=SCHEMA_DIR, help="输出目录 (默认 ~/.adb-mysql/schema)")

    args = parser.parse_args()

    conn = connect(args.profile, args.database)
    try:
        _, db_row = execute_raw(conn, "SELECT DATABASE() as db")
        db = db_row[0]["db"] if db_row and db_row[0].get("db") else None

        if not db:
            Log.info("可用数据库:")
            _, dbs = execute_raw(conn, "SHOW DATABASES")
            for r in dbs:
                name = list(r.values())[0]
                if name not in ("information_schema", "mysql", "performance_schema", "sys"):
                    print(f"  {name}")
            Log.err("请指定数据库: ./adb schema <database>")
            sys.exit(1)

        Log.info(f"生成 '{db}' 的 Schema 文档...")

        _, table_rows = execute_raw(conn, "SHOW TABLES")
        tables = [list(r.values())[0] for r in table_rows]
        if not tables:
            Log.warn("数据库中没有表")
            return

        out_dir = os.path.join(args.output, db)
        os.makedirs(out_dir, exist_ok=True)

        for table in tables:
            doc = generate_table_doc(conn, db, table)
            with open(os.path.join(out_dir, f"{table}.md"), "w") as f:
                f.write(doc)
            Log.ok(table)

        index_doc = generate_index_doc(conn, db, tables)
        index_path = os.path.join(out_dir, "schema.md")
        with open(index_path, "w") as f:
            f.write(index_doc)

        Log.ok(f"Schema 文档生成完成: {out_dir}/")
        Log.info(f"索引: {index_path}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
