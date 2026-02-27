#!/usr/bin/env python3
"""ADB Analytics Core — Connection, Safety, and Output Engine."""

import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys

CONFIG_DIR = os.path.expanduser("~/.adb-mysql")
PROFILES_FILE = os.path.join(CONFIG_DIR, "profiles.json")
SCHEMA_DIR = os.path.join(CONFIG_DIR, "schema")
MAX_ROWS = 200

# ── Logging ──────────────────────────────────────────────────────────────────

class Log:
    @staticmethod
    def ok(msg): print(f"\033[0;32m✓\033[0m {msg}")
    @staticmethod
    def err(msg): print(f"\033[0;31m✗\033[0m {msg}", file=sys.stderr)
    @staticmethod
    def warn(msg): print(f"\033[1;33m⚠\033[0m {msg}", file=sys.stderr)
    @staticmethod
    def info(msg): print(f"\033[0;34mℹ\033[0m {msg}", file=sys.stderr)

# ── Profile Management ──────────────────────────────────────────────────────

def ensure_config_dir():
    os.makedirs(CONFIG_DIR, mode=0o700, exist_ok=True)

def load_profiles():
    if not os.path.exists(PROFILES_FILE):
        return {"default": None, "profiles": {}}
    with open(PROFILES_FILE, "r") as f:
        return json.load(f)

def save_profiles(data):
    ensure_config_dir()
    with open(PROFILES_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.chmod(PROFILES_FILE, 0o600)

def get_profile(name=None):
    """Resolve connection profile by name, or use default."""
    data = load_profiles()
    if not data["profiles"]:
        Log.err("无可用连接配置。请先运行: ./adb config add")
        sys.exit(1)

    target = name or data.get("default")
    if not target or target not in data["profiles"]:
        target = next(iter(data["profiles"]))

    return target, data["profiles"][target]

# ── Dependency Check ─────────────────────────────────────────────────────────

def ensure_pymysql():
    """Auto-detect pymysql; prompt to install if missing. Returns the module."""
    try:
        import pymysql
        return pymysql
    except ImportError:
        pass

    Log.warn("未检测到 pymysql（纯 Python MySQL 驱动）")
    try:
        answer = input("  是否自动安装? (pip install pymysql) [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = ""

    if answer != "y":
        Log.err("pymysql 未安装。请手动运行: pip install pymysql")
        sys.exit(1)

    Log.info("正在安装 pymysql ...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "pymysql"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        Log.err(f"安装失败:\n{result.stderr}")
        sys.exit(1)

    Log.ok("pymysql 安装成功")
    import pymysql
    return pymysql

# ── Safe Data Cleanup ────────────────────────────────────────────────────────

_PROTECTED_DIRS = frozenset({
    ".ssh", ".gnupg", ".gpg", ".config", ".local", ".cache",
    ".npm", ".nvm", ".pyenv", ".rbenv", ".rustup", ".cargo",
    ".docker", ".kube", ".git", ".vim", ".vscode",
    ".zshrc", ".bashrc", ".profile", ".bash_profile",
})

def safe_clean(data_dir, skill_name):
    """Delete a skill's data directory with multi-layer safety validation.

    Layers: realpath resolve → $HOME direct child → hidden dir → blacklist → double confirm.
    """
    home = os.path.expanduser("~")
    real_path = os.path.realpath(data_dir)

    if not real_path.startswith(home + os.sep):
        Log.err(f"安全拒绝: 数据目录不在用户主目录下 ({real_path})")
        sys.exit(1)

    if os.path.dirname(real_path) != home:
        Log.err(f"安全拒绝: 仅允许删除 $HOME 下的直接子目录 ({real_path})")
        sys.exit(1)

    basename = os.path.basename(real_path)
    if not basename.startswith("."):
        Log.err(f"安全拒绝: 仅允许删除隐藏目录 ({basename})")
        sys.exit(1)

    if basename in _PROTECTED_DIRS:
        Log.err(f"安全拒绝: {basename} 是受保护的系统目录")
        sys.exit(1)

    if not os.path.isdir(real_path):
        Log.info(f"数据目录不存在，无需清理: {real_path}")
        return

    if os.path.islink(data_dir):
        Log.warn(f"数据目录是符号链接 → {real_path}")

    file_count = sum(len(files) for _, _, files in os.walk(real_path))
    Log.warn(f"即将删除 {skill_name} 数据目录:")
    Log.warn(f"  路径: {real_path}")
    Log.warn(f"  文件数: {file_count}")

    try:
        confirm1 = input(f"  确认删除? 输入 '{skill_name}' 确认: ").strip()
    except (EOFError, KeyboardInterrupt):
        confirm1 = ""
    if confirm1 != skill_name:
        Log.info("已取消")
        return

    try:
        confirm2 = input("  二次确认: 此操作不可恢复，继续? [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        confirm2 = ""
    if confirm2 != "y":
        Log.info("已取消")
        return

    shutil.rmtree(real_path)
    Log.ok(f"已删除: {real_path}")

# ── Connection ───────────────────────────────────────────────────────────────

def connect(profile_name=None, database=None):
    """Create a pymysql connection from a named profile."""
    pymysql = ensure_pymysql()

    name, profile = get_profile(profile_name)
    db = database or profile.get("database", "")

    try:
        conn = pymysql.connect(
            host=profile["host"],
            port=int(profile.get("port", 3306)),
            user=profile["user"],
            password=profile["password"],
            database=db if db else None,
            charset="utf8mb4",
            connect_timeout=10,
            read_timeout=30,
            cursorclass=pymysql.cursors.DictCursor,
        )
        return conn
    except Exception as e:
        Log.err(f"连接失败 [{name}]: {e}")
        sys.exit(1)

# ── SQL Safety ───────────────────────────────────────────────────────────────

_WRITE_PATTERNS = re.compile(
    r"^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|CREATE|ALTER|TRUNCATE|"
    r"LOAD\s+DATA|CALL|EXECUTE|GRANT|REVOKE)\b",
    re.IGNORECASE | re.MULTILINE,
)

_DANGEROUS_PATTERNS = re.compile(
    r"(INTO\s+OUTFILE|INTO\s+DUMPFILE)",
    re.IGNORECASE,
)

# SHOW/DESCRIBE/EXPLAIN start with these keywords but are read-only
_READONLY_WHITELIST = re.compile(
    r"^\s*(SHOW|DESCRIBE|DESC|EXPLAIN)\b",
    re.IGNORECASE,
)

def _check_readonly(sql):
    """Reject write operations. Returns (ok, reason)."""
    if _READONLY_WHITELIST.match(sql):
        return True, ""
    if _WRITE_PATTERNS.search(sql):
        return False, "检测到写入操作，违反只读策略"
    if _DANGEROUS_PATTERNS.search(sql):
        return False, "检测到危险操作 (OUTFILE/DUMPFILE)"
    return True, ""

def _enforce_limit(sql, max_rows=MAX_ROWS):
    """Ensure user-facing SQL has a LIMIT clause not exceeding max_rows."""
    # Skip LIMIT enforcement for aggregate-only queries (GROUP BY without existing LIMIT)
    has_group = bool(re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE))
    limit_match = re.search(r"LIMIT\s+(\d+)", sql, re.IGNORECASE)

    if limit_match:
        current = int(limit_match.group(1))
        if current > max_rows:
            sql = re.sub(r"LIMIT\s+\d+", f"LIMIT {max_rows}", sql, count=1, flags=re.IGNORECASE)
            Log.warn(f"LIMIT 已调整为 {max_rows}")
    elif not has_group:
        sql = sql.rstrip().rstrip(";") + f" LIMIT {max_rows}"

    return sql

def _check_performance(sql):
    """Emit performance warnings for common anti-patterns."""
    if re.search(r"SELECT\s+\*\s+FROM", sql, re.IGNORECASE):
        Log.warn("SELECT * 在列式存储中消耗大量 IO，建议指定列名")
    if not re.search(r"\bWHERE\b", sql, re.IGNORECASE):
        Log.warn("缺少 WHERE 条件，无法利用分区裁剪")
    if re.search(r"\bJOIN\b", sql, re.IGNORECASE) and not re.search(r"\bON\b", sql, re.IGNORECASE):
        Log.warn("JOIN 缺少 ON 条件，可能导致笛卡尔积")

# ── Query Execution ──────────────────────────────────────────────────────────

def execute_raw(conn, sql, params=None):
    """Execute SQL without safety checks. For internal/metadata queries only."""
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
    return columns, rows

def execute(conn, sql, params=None):
    """Execute user-facing SQL with readonly check, performance warnings, and LIMIT."""
    ok, reason = _check_readonly(sql)
    if not ok:
        Log.err(reason)
        sys.exit(1)

    _check_performance(sql)
    sql = _enforce_limit(sql)

    return execute_raw(conn, sql, params)

# ── Schema Introspection ─────────────────────────────────────────────────────

def find_column_by_type(conn, table, data_types):
    """Find the first column of a given data type in a table."""
    type_list = ",".join(f"'{t}'" for t in data_types)
    _, rows = execute_raw(conn,
        f"SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' "
        f"AND DATA_TYPE IN ({type_list}) LIMIT 1"
    )
    return rows[0]["COLUMN_NAME"] if rows else None

# ── Output Formatting ────────────────────────────────────────────────────────

def output(columns, rows, fmt="table"):
    """Format and print query results."""
    if not rows:
        Log.info("查询结果为空")
        return

    if fmt == "json":
        print(json.dumps(rows, indent=2, default=str, ensure_ascii=False))
    elif fmt == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        print(buf.getvalue(), end="")
    else:
        _print_table(columns, rows)

def _print_table(columns, rows):
    """Render rows as an ASCII table."""
    widths = {}
    for col in columns:
        max_w = len(str(col))
        for row in rows:
            max_w = max(max_w, len(str(row.get(col, ""))))
        widths[col] = min(max_w, 40)

    header = " | ".join(str(col).ljust(widths[col]) for col in columns)
    separator = "-+-".join("-" * widths[col] for col in columns)
    print(header)
    print(separator)
    for row in rows:
        print(" | ".join(str(row.get(col, "")).ljust(widths[col])[:widths[col]] for col in columns))
    Log.info(f"{len(rows)} 行")
