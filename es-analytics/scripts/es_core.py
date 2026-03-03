#!/usr/bin/env python3
"""ES Analytics Core — HTTP Connection, Safety, and Output Engine.

Zero-dependency: uses only Python 3 stdlib (urllib, json, base64).
Handles both standard ES and Alibaba Cloud SLS ES-compatible endpoints.
"""

import base64
import csv
import io
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request

import datetime

# ── Constants ────────────────────────────────────────────────────────────────

CONFIG_DIR = os.path.expanduser("~/.agents/data/es-analytics")
PROFILES_FILE = os.path.join(CONFIG_DIR, "profiles.json")
MAX_SIZE = 200
DEFAULT_TIMEOUT = 30

def _sls_full_range():
    """Dynamic SLS time range: 5 years back to end of next year."""
    now = datetime.datetime.now()
    return {"range": {"@timestamp": {
        "gte": f"{now.year - 5}-01-01T00:00:00",
        "lte": f"{now.year + 1}-12-31T23:59:59"
    }}}

# Computed once at import time
SLS_FULL_RANGE = _sls_full_range()

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
        Log.err("无可用连接配置。请先运行: ./es config add")
        sys.exit(1)

    target = name or data.get("default")
    if not target or target not in data["profiles"]:
        target = next(iter(data["profiles"]))

    return target, data["profiles"][target]

# ── Safe Data Cleanup ────────────────────────────────────────────────────────

_PROTECTED_DIRS = frozenset({
    ".ssh", ".gnupg", ".gpg", ".config", ".local", ".cache",
    ".npm", ".nvm", ".pyenv", ".rbenv", ".rustup", ".cargo",
    ".docker", ".kube", ".git", ".vim", ".vscode",
    ".zshrc", ".bashrc", ".profile", ".bash_profile",
})

def safe_clean(data_dir, skill_name):
    """Delete a skill's data directory with multi-layer safety validation."""
    home = os.path.expanduser("~")
    real_path = os.path.realpath(data_dir)
    agents_data = os.path.join(home, ".agents", "data")

    if not real_path.startswith(home + os.sep):
        Log.err(f"安全拒绝: 数据目录不在用户主目录下 ({real_path})")
        sys.exit(1)

    is_agents_data = real_path.startswith(agents_data + os.sep)
    is_home_child = os.path.dirname(real_path) == home
    if not is_agents_data and not is_home_child:
        Log.err(f"安全拒绝: 仅允许删除 ~/.agents/data/ 下的目录 ({real_path})")
        sys.exit(1)

    basename = os.path.basename(real_path)
    if basename in _PROTECTED_DIRS:
        Log.err(f"安全拒绝: {basename} 是受保护的系统目录")
        sys.exit(1)

    if not os.path.isdir(real_path):
        Log.info(f"数据目录不存在，无需清理: {real_path}")
        return

    file_count = sum(len(files) for _, _, files in os.walk(real_path))
    Log.warn(f"即将删除 {skill_name} 数据目录:")
    Log.warn(f"  路径: {real_path}")
    Log.warn(f"  文件数: {file_count}")

    try:
        confirm = input(f"  确认删除? 输入 '{skill_name}' 确认: ").strip()
    except (EOFError, KeyboardInterrupt):
        confirm = ""
    if confirm != skill_name:
        Log.info("已取消")
        return

    shutil.rmtree(real_path)
    Log.ok(f"已删除: {real_path}")

# ── HTTP Client ──────────────────────────────────────────────────────────────

def _build_auth_header(profile):
    """Build Basic auth header from profile credentials."""
    user = profile.get("user", "")
    password = profile.get("password", "")
    if user or password:
        cred = base64.b64encode(f"{user}:{password}".encode()).decode()
        return f"Basic {cred}"
    return None

def _normalize_url(base_url):
    """Ensure URL ends without trailing slash."""
    return base_url.rstrip("/")

def es_request(profile, method, path, body=None, timeout=DEFAULT_TIMEOUT):
    """Execute an HTTP request against ES endpoint.

    Args:
        profile: Profile dict with url, user, password, sls flag
        method: HTTP method (GET/POST)
        path: API path (e.g., /_cat/indices, /my-index/_search)
        body: Request body dict (will be JSON-encoded)
        timeout: Request timeout in seconds

    Returns:
        Parsed JSON response dict

    Raises:
        SystemExit on connection errors
    """
    base_url = _normalize_url(profile["url"])
    url = f"{base_url}{path}"

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")

    auth = _build_auth_header(profile)
    if auth:
        req.add_header("Authorization", auth)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            # _cat APIs return plain text
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return json.loads(raw)
            return {"_raw": raw.decode("utf-8", errors="replace")}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        try:
            error_json = json.loads(error_body)
            reason = error_json.get("error", {})
            if isinstance(reason, dict):
                reason = reason.get("reason", error_body)
            Log.err(f"ES 请求失败 [{e.code}]: {reason}")
        except json.JSONDecodeError:
            Log.err(f"ES 请求失败 [{e.code}]: {error_body[:200]}")
        sys.exit(1)
    except urllib.error.URLError as e:
        Log.err(f"连接失败: {e.reason}")
        sys.exit(1)
    except Exception as e:
        Log.err(f"请求异常: {e}")
        sys.exit(1)

# ── Safety ───────────────────────────────────────────────────────────────────

_SAFE_METHODS = {
    "GET": True,
    "HEAD": True,
}

# Explicitly blocked write methods (whitelist already blocks, but this is for auditability)
_BLOCKED_METHODS = frozenset({"DELETE", "PUT", "PATCH"})

# POST is only safe for search/count/msearch endpoints
_SAFE_POST_PATHS = re.compile(
    r"(_search|_count|_msearch|_mapping|_analyze|_validate|_explain|_field_caps)$"
)

def check_safety(method, path):
    """Validate that the request is read-only. Returns (ok, reason).

    Strategy: whitelist (GET/HEAD + POST to safe paths).
    DELETE/PUT/PATCH are explicitly blocked for auditability.
    """
    method = method.upper()

    # Explicit write method block
    if method in _BLOCKED_METHODS:
        return False, f"安全拒绝: 写入方法 {method} 被禁止"

    if method in _SAFE_METHODS:
        return True, ""

    if method == "POST":
        if _SAFE_POST_PATHS.search(path):
            return True, ""
        return False, f"POST 仅允许 _search/_count 等只读端点，拒绝: {path}"

    return False, f"拒绝未知方法: {method}"

def safe_request(profile, method, path, body=None, timeout=DEFAULT_TIMEOUT):
    """Execute a safety-checked ES request."""
    ok, reason = check_safety(method, path)
    if not ok:
        Log.err(reason)
        sys.exit(1)
    return es_request(profile, method, path, body, timeout)

# ── SLS Helpers ──────────────────────────────────────────────────────────────

def is_sls(profile):
    """Check if profile is an SLS ES-compatible endpoint."""
    return profile.get("sls", False)

def inject_sls_time_range(body, force=False):
    """Inject full time range for SLS endpoints to bypass 24h default window.

    Only injects if no range query on @timestamp already exists in the body.
    """
    if not body:
        body = {}

    query = body.get("query", {})

    # Check if user already specified a time range
    if _has_timestamp_range(query):
        return body

    # Wrap existing query in bool.must with time range
    if not query:
        body["query"] = SLS_FULL_RANGE
    else:
        body["query"] = {
            "bool": {
                "must": [query, SLS_FULL_RANGE]
            }
        }

    return body

def _has_timestamp_range(query):
    """Recursively check if query already contains a @timestamp range."""
    if not isinstance(query, dict):
        return False

    if "range" in query:
        range_q = query["range"]
        if isinstance(range_q, dict) and "@timestamp" in range_q:
            return True

    # Check bool clauses
    for clause in ("must", "filter", "should"):
        items = query.get("bool", {}).get(clause, [])
        if isinstance(items, list):
            for item in items:
                if _has_timestamp_range(item):
                    return True
        elif isinstance(items, dict):
            if _has_timestamp_range(items):
                return True

    return False

def auto_sls_body(profile, body, full_range=True):
    """Apply SLS-specific adjustments to request body if needed."""
    if is_sls(profile) and full_range:
        body = inject_sls_time_range(body)
    return body

# ── Size Enforcement ─────────────────────────────────────────────────────────

def enforce_size(body, max_size=MAX_SIZE):
    """Ensure query size doesn't exceed limit (for user-facing queries)."""
    if not body:
        body = {}

    size = body.get("size")
    if size is None:
        body["size"] = max_size
    elif size > max_size:
        body["size"] = max_size
        Log.warn(f"size 已调整为 {max_size}")

    return body

# ── Output Formatting ────────────────────────────────────────────────────────

def format_hits(hits, fmt="table"):
    """Format ES search hits for display."""
    if not hits:
        Log.info("查询结果为空")
        return

    # Flatten _source into rows
    rows = []
    for hit in hits:
        row = {"_index": hit.get("_index", ""), "_id": hit.get("_id", "")}
        source = hit.get("_source", {})
        if isinstance(source, dict):
            row.update(_flatten_dict(source))
        else:
            row["_source"] = str(source)
        rows.append(row)

    if not rows:
        Log.info("查询结果为空")
        return

    columns = list(rows[0].keys())
    output(columns, rows, fmt)

def _flatten_dict(d, prefix="", sep="."):
    """Flatten nested dict keys with dot separator. Max depth 2 for readability."""
    items = {}
    for k, v in d.items():
        key = f"{prefix}{sep}{k}" if prefix else k
        if isinstance(v, dict) and not prefix:  # Only flatten one level
            items.update(_flatten_dict(v, key, sep))
        elif isinstance(v, (list, dict)):
            items[key] = json.dumps(v, ensure_ascii=False)[:100]
        else:
            items[key] = v
    return items

def output(columns, rows, fmt="table"):
    """Format and print query results."""
    if not rows:
        Log.info("查询结果为空")
        return

    if fmt == "json":
        print(json.dumps(rows, indent=2, default=str, ensure_ascii=False))
    elif fmt == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
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
            val = str(row.get(col, ""))
            max_w = max(max_w, len(val))
        widths[col] = min(max_w, 50)

    header = " | ".join(str(col).ljust(widths[col]) for col in columns)
    separator = "-+-".join("-" * widths[col] for col in columns)
    print(header)
    print(separator)
    for row in rows:
        print(" | ".join(str(row.get(col, "")).ljust(widths[col])[:widths[col]] for col in columns))
    Log.info(f"{len(rows)} 行")

# ── Search Helpers ───────────────────────────────────────────────────────────

def search(profile, index, body, full_range=True, timeout=DEFAULT_TIMEOUT):
    """Execute a search query against an index."""
    body = auto_sls_body(profile, body, full_range)
    path = f"/{index}/_search"
    return safe_request(profile, "POST", path, body, timeout)

def count(profile, index, body=None, full_range=True, timeout=DEFAULT_TIMEOUT):
    """Execute a count query against an index."""
    body = body or {}
    body = auto_sls_body(profile, body, full_range)
    path = f"/{index}/_count"
    return safe_request(profile, "POST", path, body, timeout)

def scroll_extract(profile, index, field, filter_query=None, full_range=True,
                   batch_size=500, max_batches=1000, timeout=60):
    """Extract unique values of a field using search_after pagination.

    Returns a sorted list of unique values.
    """
    values = set()
    search_after = None

    body_template = {
        "size": batch_size,
        "sort": [{"@timestamp": "asc"}],
    }
    if filter_query:
        body_template["query"] = filter_query

    for batch in range(1, max_batches + 1):
        body = dict(body_template)
        if search_after:
            body["search_after"] = search_after

        body = auto_sls_body(profile, body, full_range)
        path = f"/{index}/_search"

        try:
            result = safe_request(profile, "POST", path, body, timeout)
        except SystemExit:
            break

        hits = result.get("hits", {}).get("hits", [])
        if not hits:
            break

        for hit in hits:
            source = hit.get("_source", {})
            val = _extract_field(source, field)
            if val is not None:
                values.add(str(val))

        search_after = hits[-1].get("sort")
        if not search_after:
            break

        sys.stdout.write(f"\r  batch {batch} | scanned {batch * batch_size} | unique {field}: {len(values)}")
        sys.stdout.flush()

        if len(hits) < batch_size:
            break

    sys.stdout.write("\n")
    return sorted(values, key=lambda x: (x.isdigit(), int(x) if x.isdigit() else 0, x))

def _extract_field(source, field):
    """Extract a potentially nested field from _source (supports dot notation)."""
    parts = field.split(".")
    current = source
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current
