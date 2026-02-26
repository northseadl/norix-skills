#!/usr/bin/env python3
"""Feishu Open API Core Engine — Authentication, HTTP, Retry, Error Handling.

Zero third-party dependencies. Uses only Python stdlib.
Import this module from other scripts: `from feishu_api import FeishuClient`
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

# ─── Constants ────────────────────────────────────────────────────────────────

API_BASE = os.environ.get("FEISHU_API_BASE", "https://open.feishu.cn/open-apis")
MAX_RETRIES = int(os.environ.get("FEISHU_MAX_RETRIES", "3"))
RETRY_DELAY = int(os.environ.get("FEISHU_RETRY_DELAY", "2"))
CREDENTIALS_FILE = os.path.expanduser("~/.feishu/credentials.json")

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

# ─── Feishu API Client ───────────────────────────────────────────────────────

class FeishuClient:
    """Authenticated HTTP client for Feishu Open API (user identity only).

    Token resolution:
    1. Stored credentials in ~/.feishu/credentials.json (managed by auth.py)
       — auto-refreshes if expired
    2. FEISHU_USER_ACCESS_TOKEN env var (manual override)
    """

    def __init__(self):
        self._token: Optional[str] = None

    # ── Token Resolution ──────────────────────────────────────────────────

    def _resolve_token(self) -> str:
        """Resolve user_access_token. This skill only operates with user identity.

        Priority:
        1. Stored credentials file (~/.feishu/credentials.json), auto-refresh if expired
        2. FEISHU_USER_ACCESS_TOKEN env var (manual override)
        """
        # Priority 1: stored credentials file (managed by auth.py)
        if os.path.isfile(CREDENTIALS_FILE):
            try:
                with open(CREDENTIALS_FILE) as f:
                    creds = json.load(f)
                stored = creds.get("user_access_token", "")
                expire_at = creds.get("expire_at", 0)
                now = int(time.time())
                if stored and expire_at > now:
                    remaining = (expire_at - now) // 60
                    Log.info(f"Using stored user_access_token (~{remaining}min remaining)")
                    return stored
                elif stored and expire_at > 0:
                    # Token expired — auto-refresh before failing
                    Log.warn("Stored user_access_token expired. Attempting auto-refresh...")
                    if self._auto_refresh():
                        with open(CREDENTIALS_FILE) as f:
                            creds = json.load(f)
                        refreshed = creds.get("user_access_token", "")
                        if refreshed:
                            remaining = (creds.get("expire_at", 0) - int(time.time())) // 60
                            Log.ok(f"Token refreshed (~{remaining}min remaining)")
                            return refreshed
                    Log.error("Auto-refresh failed. Run: ./feishu auth refresh")
                    Log.error("  Or re-login: ./feishu auth login")
                    sys.exit(1)
            except (json.JSONDecodeError, OSError):
                pass

        # Priority 2: env var (manual override for ad-hoc use)
        token = os.environ.get("FEISHU_USER_ACCESS_TOKEN", "")
        if token:
            Log.info("Using FEISHU_USER_ACCESS_TOKEN env var")
            return token

        Log.error("No user_access_token found.")
        Log.error("  Run: ./feishu auth login")
        sys.exit(1)

    @property
    def token(self) -> str:
        if not self._token:
            self._token = self._resolve_token()
        return self._token

    def clear_token(self):
        self._token = None

    # ── Raw HTTP (no auth, for token endpoint) ────────────────────────────

    @staticmethod
    def _raw_post(url: str, body: dict) -> dict:
        data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json; charset=utf-8")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_bytes = e.read()
            try:
                return json.loads(body_bytes.decode())
            except Exception:
                return {"code": e.code, "msg": body_bytes.decode()[:200]}
        except Exception as e:
            return {"code": -1, "msg": str(e)}

    # ── Authenticated Request Engine ──────────────────────────────────────

    def request(self, method: str, path: str, body: Optional[dict] = None,
                params: Optional[dict] = None) -> dict:
        """Send an authenticated request to Feishu API.

        Auto-handles: 429 retry, 5xx retry, 401 token refresh, 99991679 incremental auth.
        """
        url = f"{API_BASE}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)

        data = json.dumps(body).encode() if body else None
        result: dict = {"code": -1, "msg": "no response"}

        for attempt in range(1, MAX_RETRIES + 1):
            req = urllib.request.Request(url, data=data, method=method)
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
                    result = {"code": http_code, "msg": f"HTTP {http_code}"}

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

                if http_code == 401 or result.get("code") in (99991663, 99991664):
                    if self._auto_refresh():
                        retry = self._retry_request(method, url, data)
                        if retry is not None:
                            return retry
                    Log.warn("Token expired. Run: ./feishu auth refresh")
                    return result

            except Exception as e:
                Log.error(f"Request failed: {e}")
                return {"code": -1, "msg": str(e)}

            api_code = result.get("code", 0)
            if api_code == 0:
                return result

            if api_code == 99991679:
                needed = self._extract_needed_scopes(result)
                if needed and self._incremental_auth(needed):
                    retry = self._retry_request(method, url, data)
                    if retry is not None:
                        return retry

            Log.error(f"API error: code={api_code} msg={result.get('msg', '?')}")
            Log.error(f"  {method} {url}")
            return result

        Log.error(f"Max retries ({MAX_RETRIES}) exceeded for {method} {path}")
        return result

    def _retry_request(self, method: str, url: str, data: Optional[bytes] = None) -> Optional[dict]:
        """Retry a single request with the current (refreshed) token."""
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json; charset=utf-8")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return None

    @staticmethod
    def _extract_needed_scopes(result: dict) -> list:
        """Extract required scopes from a 99991679 error response."""
        violations = result.get("error", {}).get("permission_violations", [])
        scopes = [v.get("subject", "") for v in violations
                  if v.get("type") == "action_privilege_required"]
        scopes = [s for s in scopes if s]
        if scopes:
            return scopes

        msg = result.get("msg", "")
        match = re.search(r"\[([a-z_:.,\s]+)\]", msg)
        if match:
            candidates = [s.strip() for s in match.group(1).split(",")]
            return [s for s in candidates if ":" in s]
        return []

    def _incremental_auth(self, scopes: list) -> bool:
        """Attempt incremental OAuth2 for missing scopes."""
        Log.warn(f"Missing scopes: {scopes}")
        Log.info("Triggering incremental authorization...")
        try:
            from auth import incremental_authorize
            ok = incremental_authorize(scopes)
            if ok:
                self.clear_token()
            return ok
        except ImportError:
            Log.error("Cannot auto-authorize: auth.py not found in path.")
            Log.error("Run manually: ./feishu auth relogin")
            return False

    def _auto_refresh(self) -> bool:
        """Attempt to auto-refresh an expired token using stored refresh_token."""
        Log.info("Token expired, attempting auto-refresh...")
        try:
            from auth import cmd_refresh
            self.clear_token()
            cmd_refresh()
            return True
        except (ImportError, SystemExit):
            return False

    # ── Convenience Methods ───────────────────────────────────────────────

    def get(self, path: str, params: Optional[dict] = None) -> dict:
        return self.request("GET", path, params=params)

    def post(self, path: str, body: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        return self.request("POST", path, body=body, params=params)

    def patch(self, path: str, body: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        return self.request("PATCH", path, body=body, params=params)

    def put(self, path: str, body: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        return self.request("PUT", path, body=body, params=params)

    def delete(self, path: str, params: Optional[dict] = None) -> dict:
        return self.request("DELETE", path, params=params)

    # ── Pagination Helper ─────────────────────────────────────────────────

    def get_all(self, path: str, params: Optional[dict] = None,
                items_key: str = "items") -> list:
        """Fetch all pages of a paginated API and return combined items."""
        params = dict(params or {})
        params.setdefault("page_size", "50")
        all_items: list = []

        while True:
            result = self.get(path, params=params)
            data = result.get("data", {})
            items = data.get(items_key, [])
            all_items.extend(items)

            if not data.get("has_more"):
                break
            page_token = data.get("page_token", "")
            if not page_token:
                break
            params["page_token"] = page_token

        return all_items


# ─── Utilities ────────────────────────────────────────────────────────────────

def iso_to_timestamp(dt: str) -> str:
    """Convert ISO 8601 datetime to Unix timestamp string.
    Falls back to returning the input if it's already a timestamp.
    """
    import datetime as _dt
    try:
        # Python 3.7+ fromisoformat with timezone
        parsed = _dt.datetime.fromisoformat(dt)
        return str(int(parsed.timestamp()))
    except (ValueError, AttributeError):
        pass
    # Maybe already a timestamp
    try:
        int(dt)
        return dt
    except ValueError:
        Log.warn(f"Cannot parse datetime: {dt}, passing through")
        return dt


def pretty_json(data: Any) -> str:
    """Format data as indented JSON string."""
    return json.dumps(data, indent=2, ensure_ascii=False)


def output(data: Any):
    """Print JSON response to stdout."""
    print(pretty_json(data))
