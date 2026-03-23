#!/usr/bin/env python3
"""Coding.net Open API Core Engine — Authentication, HTTP, Retry, Error Handling.

Zero third-party dependencies. Uses only Python stdlib.
Import this module from other scripts: `from coding_api import CodingClient`

Coding.net Open API Protocol:
  - All requests are POST to https://{team}.coding.net/open-api?Action={ActionName}
  - Auth via Personal Access Token: Authorization: Bearer {token}
  - Response envelope: {"Response": {"RequestId": "...", ...data, "Error": {...}}}
"""

import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from credential_store import CredentialStore

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_RETRIES = int(os.environ.get("CODING_MAX_RETRIES", "3"))
RETRY_DELAY = int(os.environ.get("CODING_RETRY_DELAY", "2"))
CREDENTIALS_FILE = os.path.expanduser("~/.agents/data/coding/credentials.json")
DATA_DIR = os.path.dirname(CREDENTIALS_FILE)

_VAULT_SENTINEL = "***vault***"
_cred_store = CredentialStore("coding", DATA_DIR)

# ─── Colored Logging ─────────────────────────────────────────────────────────

class Log:
    """Minimal colored logger to stderr."""
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[0;33m"
    CYAN = "\033[0;36m"
    BOLD = "\033[1m"
    NC = "\033[0m"

    @staticmethod
    def _print(prefix: str, msg: str):
        print(f"{prefix} {msg}", file=sys.stderr, flush=True)

    @classmethod
    def info(cls, msg: str):
        cls._print(f"{cls.CYAN}[INFO]{cls.NC}", msg)

    @classmethod
    def ok(cls, msg: str):
        cls._print(f"{cls.GREEN}[OK]{cls.NC}", msg)

    @classmethod
    def warn(cls, msg: str):
        cls._print(f"{cls.YELLOW}[WARN]{cls.NC}", msg)

    @classmethod
    def error(cls, msg: str):
        cls._print(f"{cls.RED}[ERROR]{cls.NC}", msg)


# ─── Credentials ─────────────────────────────────────────────────────────────

def _resolve_api_base() -> str:
    """Resolve API base URL from credentials file.

    Format: https://{team}.coding.net/open-api
    """
    if os.path.isfile(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE) as f:
                creds = json.load(f)
            stored_team = creds.get("team", "")
            if stored_team:
                return f"https://{stored_team}.coding.net/open-api"
        except (json.JSONDecodeError, OSError):
            pass

    return ""


def _resolve_token() -> str:
    """Resolve personal access token from vault. No env var."""
    vault_token = _cred_store.get("token")
    if vault_token:
        return vault_token

    # Legacy: read from plaintext credentials file
    if os.path.isfile(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE) as f:
                creds = json.load(f)
            stored = creds.get("token", "")
            if stored and stored != _VAULT_SENTINEL:
                # Auto-migrate to vault
                _cred_store.set("token", stored)
                creds["token"] = _VAULT_SENTINEL
                with open(CREDENTIALS_FILE, "w") as f:
                    json.dump(creds, f, indent=2, ensure_ascii=False)
                return stored
        except (json.JSONDecodeError, OSError):
            pass

    return ""


# ─── Coding API Client ──────────────────────────────────────────────────────

class CodingClient:
    """Authenticated HTTP client for Coding.net Open API.

    Uses Personal Access Token for authentication.
    All API calls go through a single POST endpoint with Action query parameter.
    """

    def __init__(self):
        self._token: Optional[str] = None
        self._api_base: Optional[str] = None

    @property
    def api_base(self) -> str:
        if not self._api_base:
            self._api_base = _resolve_api_base()
            if not self._api_base:
                Log.error("No Coding.net team configured.")
                Log.error("")
                Log.error("  首次使用? 请按以下步骤配置:")
                Log.error("  ─────────────────────────────────────")
                Log.error("  1. 打开 Coding.net → 个人账户设置 → 访问令牌 → 新建令牌")
                Log.error("  2. 勾选所需权限 (project / depot / ci / artifact)")
                Log.error("  3. 运行:")
                Log.error("     ./coding auth init --team your-team --token your-token")
                Log.error("  或执行配置向导:")
                Log.error("     ./coding auth setup")
                Log.error("")
                sys.exit(1)
        return self._api_base

    @property
    def token(self) -> str:
        if not self._token:
            self._token = _resolve_token()
            if not self._token:
                Log.error("No access token found.")
                Log.error("")
                Log.error("  设置方式:")
                Log.error("     ./coding auth init --team xxx --token yyy")
                Log.error("  或执行: ./coding auth setup")
                Log.error("")
                sys.exit(1)
        return self._token

    # ── Core Request Engine ──────────────────────────────────────────────

    def call(self, action: str, body: Optional[dict] = None) -> dict:
        """Send an API request to Coding.net Open API.

        All Coding APIs use POST method with Action as query parameter.
        Auto-handles: 429 retry, 5xx retry.

        Returns the Response dict (unwrapped from envelope).
        """
        url = f"{self.api_base}?Action={action}"
        data = json.dumps(body or {}).encode()
        result: dict = {}

        for attempt in range(1, MAX_RETRIES + 1):
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Authorization", f"Bearer {self.token}")
            req.add_header("Content-Type", "application/json; charset=utf-8")

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result = json.loads(resp.read().decode())
            except urllib.error.HTTPError as e:
                http_code = e.code
                try:
                    result = json.loads(e.read().decode())
                except Exception:
                    result = {"Response": {"Error": {"Code": str(http_code), "Message": f"HTTP {http_code}"}}}

                if http_code == 429:
                    delay = RETRY_DELAY * attempt
                    Log.warn(f"Rate limited (429). Retry in {delay}s ({attempt}/{MAX_RETRIES})")
                    time.sleep(delay)
                    continue

                if 500 <= http_code < 600:
                    delay = RETRY_DELAY * attempt
                    Log.warn(f"Server error ({http_code}). Retry in {delay}s ({attempt}/{MAX_RETRIES})")
                    time.sleep(delay)
                    continue

                if http_code == 401:
                    Log.error("Authentication failed (401). Check your CODING_TOKEN.")
                    return result.get("Response", result)

            except Exception as e:
                Log.error(f"Request failed: {e}")
                return {"Error": {"Code": "NetworkError", "Message": str(e)}}

            response = result.get("Response", result)

            # Check for API-level error
            error = response.get("Error")
            if error:
                code = error.get("Code", "?")
                msg = error.get("Message", "?")
                Log.error(f"API error: {code} — {msg}")
                Log.error(f"  Action: {action}")
                return response

            return response

        Log.error(f"Max retries ({MAX_RETRIES}) exceeded for {action}")
        return result.get("Response", result)


# ─── Utilities ────────────────────────────────────────────────────────────────

def pretty_json(data: Any) -> str:
    """Format data as indented JSON string."""
    return json.dumps(data, indent=2, ensure_ascii=False)


def output(data: Any):
    """Print JSON response to stdout."""
    print(pretty_json(data))


# ─── Safe Data Cleanup ────────────────────────────────────────────────────────

_PROTECTED_DIRS = frozenset({
    ".ssh", ".gnupg", ".gpg", ".config", ".local", ".cache",
    ".npm", ".nvm", ".pyenv", ".rbenv", ".rustup", ".cargo",
    ".docker", ".kube", ".git", ".vim", ".vscode",
    ".zshrc", ".bashrc", ".profile", ".bash_profile",
})

def safe_clean(data_dir: str, skill_name: str):
    """Delete a skill's data directory with multi-layer safety validation.

    Layers: realpath resolve → $HOME subtree → agents data prefix → blacklist → double confirm.
    """
    home = os.path.expanduser("~")
    real_path = os.path.realpath(data_dir)
    agents_data = os.path.join(home, ".agents", "data")

    if not real_path.startswith(home + os.sep):
        Log.error(f"安全拒绝: 数据目录不在用户主目录下 ({real_path})")
        sys.exit(1)

    # Allow paths under ~/.agents/data/ or direct $HOME children
    is_agents_data = real_path.startswith(agents_data + os.sep)
    is_home_child = os.path.dirname(real_path) == home
    if not is_agents_data and not is_home_child:
        Log.error(f"安全拒绝: 仅允许删除 ~/.agents/data/ 下的目录或 $HOME 直接子目录 ({real_path})")
        sys.exit(1)

    basename = os.path.basename(real_path)
    if not basename.startswith("."):
        Log.error(f"安全拒绝: 仅允许删除隐藏目录 ({basename})")
        sys.exit(1)

    if basename in _PROTECTED_DIRS:
        Log.error(f"安全拒绝: {basename} 是受保护的系统目录")
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
