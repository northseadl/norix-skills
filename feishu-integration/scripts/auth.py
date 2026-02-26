#!/usr/bin/env python3
"""Feishu OAuth2 Authentication — Login, Refresh, Status, Tenant Token.

Usage via unified CLI:
  ./feishu auth login          # Full OAuth2 flow (opens browser)
  ./feishu auth login-explorer # Guide for API Explorer method
  ./feishu auth refresh        # Refresh an expired token
  ./feishu auth status         # Check current token status
  ./feishu auth tenant         # Get tenant_access_token
"""

import http.server
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import API_BASE, CREDENTIALS_FILE, Log

OAUTH_REDIRECT_PORT = int(os.environ.get("OAUTH_REDIRECT_PORT", "9876"))
OAUTH_REDIRECT_URI = f"http://localhost:{OAUTH_REDIRECT_PORT}/callback"

# ─── Two-Tier Scope Architecture ────────────────────────────────────────────
#
# Feishu OAuth2 scope behavior:
#   - New (un-granted) scopes → user sees consent dialog
#   - Already-granted scopes → silent pass, no dialog
#
# CORE_SCOPES:    Always requested on login/relogin. These cover the primary
#                 capabilities (task, document, wiki) that most users need.
# FEATURE_SCOPES: Requested on-demand when a feature is first used and hits
#                 a 99991679 permission error. Only prompts for the delta.

CORE_SCOPES = [
    "offline_access",
    "task:task:read", "task:task:write",
    "task:comment:write",
    "docx:document:readonly", "docx:document",
    "drive:drive:readonly", "drive:drive",
    "drive:file:readonly",
    "wiki:wiki:readonly", "wiki:wiki",
    "bitable:app:readonly", "bitable:app",
]

FEATURE_SCOPES = {
    "contacts": {
        "scopes": ["contact:user.base:readonly"],
        "description": "Member directory basic info (used by members.py name lookup)",
    },
}

# All scopes for discovery (e.g. auth.py status)
ALL_SCOPES = CORE_SCOPES + [
    s for feat in FEATURE_SCOPES.values() for s in feat["scopes"]
]


# ─── Credentials Storage ────────────────────────────────────────────────────

def save_credentials(creds: dict):
    os.makedirs(os.path.dirname(CREDENTIALS_FILE), exist_ok=True)
    with open(CREDENTIALS_FILE, "w") as f:
        json.dump(creds, f, indent=2, ensure_ascii=False)
    os.chmod(CREDENTIALS_FILE, 0o600)
    Log.ok(f"Credentials saved to {CREDENTIALS_FILE}")


def load_credentials() -> dict:
    if os.path.isfile(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE) as f:
            return json.load(f)
    return {}


def get_app_credentials() -> tuple[str, str]:
    app_id = os.environ.get("FEISHU_APP_ID", "")
    app_secret = os.environ.get("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        creds = load_credentials()
        app_id = app_id or creds.get("app_id", "")
        app_secret = app_secret or creds.get("app_secret", "")
    return app_id, app_secret


# ─── OAuth2 Authorization Flow ─────────────────────────────────────────────

def _build_authorize_url(app_id: str, scopes: list) -> str:
    """Build OAuth2 authorization URL with given scopes."""
    encoded_uri = urllib.parse.quote(OAUTH_REDIRECT_URI)
    scope_str = urllib.parse.quote(" ".join(scopes))
    return (
        f"{API_BASE}/authen/v1/authorize"
        f"?app_id={app_id}"
        f"&redirect_uri={encoded_uri}"
        f"&response_type=code"
        f"&scope={scope_str}"
        f"&state=feishu_auth"
    )


def _open_browser_and_exchange(app_id: str, app_secret: str, scopes: list):
    """Open browser for OAuth2 consent, wait for callback, exchange token."""
    auth_url = _build_authorize_url(app_id, scopes)

    Log.info("Opening browser for authorization...")
    try:
        subprocess.run(["open", auth_url], check=False)
    except FileNotFoundError:
        try:
            subprocess.run(["xdg-open", auth_url], check=False)
        except FileNotFoundError:
            print(f"\n  请手动打开: {auth_url}\n")

    Log.info(f"Waiting for callback on http://localhost:{OAUTH_REDIRECT_PORT} ...")
    Log.info("Please authorize in the browser window.")

    code = _wait_for_callback()
    if not code:
        Log.error("No authorization code received.")
        return False
    Log.ok(f"Authorization code received: {code[:10]}...")

    _exchange_code(app_id, app_secret, code)
    return True


def cmd_login():
    """Login with CORE_SCOPES."""
    app_id, app_secret = get_app_credentials()

    if not app_id or not app_secret:
        Log.error("FEISHU_APP_ID and FEISHU_APP_SECRET must be set.")
        print()
        print("  如何获取：")
        print("  1. 打开 https://open.feishu.cn/app")
        print("  2. 创建自建应用 → 复制 App ID 和 App Secret")
        print(f"  3. 安全设置 → 重定向 URL → 添加 {OAUTH_REDIRECT_URI}")
        print()
        print('  export FEISHU_APP_ID="cli_xxxxxxxx"')
        print('  export FEISHU_APP_SECRET="xxxxxxxx"')
        sys.exit(1)

    _open_browser_and_exchange(app_id, app_secret, CORE_SCOPES)


def incremental_authorize(feature_scopes: list) -> bool:
    """Trigger incremental OAuth2 for additional scopes.

    Feishu only shows consent dialog for un-granted scopes; already-granted
    ones pass silently. So it's safe to include CORE_SCOPES alongside new
    ones — only the delta triggers a dialog.

    Returns True if authorization succeeded, False otherwise.
    """
    app_id, app_secret = get_app_credentials()
    if not app_id or not app_secret:
        Log.error("Cannot do incremental auth: missing app credentials.")
        Log.error("Set FEISHU_APP_ID and FEISHU_APP_SECRET, or run auth.py login first.")
        return False

    # Include core + new scopes so the resulting token has everything
    all_scopes = list(set(CORE_SCOPES + feature_scopes))
    Log.info(f"Requesting additional permissions: {feature_scopes}")
    return _open_browser_and_exchange(app_id, app_secret, all_scopes)


def _wait_for_callback() -> str:
    """Start a temporary HTTP server to capture the OAuth2 callback."""
    captured_code = {"value": ""}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/callback" and "code" in params:
                captured_code["value"] = params["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                html = (
                    '<!DOCTYPE html><html><head><meta charset="utf-8">'
                    '<style>'
                    'body{margin:0;height:100vh;display:flex;align-items:center;'
                    'justify-content:center;background:#fafafa;'
                    'font-family:-apple-system,"Helvetica Neue",sans-serif;color:#1a1a1a}'
                    '.card{max-width:360px;padding:48px 40px;text-align:center}'
                    '.mark{width:40px;height:40px;border-radius:50%;'
                    'background:#22863a;margin:0 auto 24px;display:flex;'
                    'align-items:center;justify-content:center}'
                    '.mark svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.5;'
                    'stroke-linecap:round;stroke-linejoin:round}'
                    'h2{font-size:18px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}'
                    'p{font-size:14px;color:#666;margin:0;line-height:1.5}'
                    '</style></head><body>'
                    '<div class="card">'
                    '<div class="mark"><svg viewBox="0 0 24 24">'
                    '<polyline points="20 6 9 17 4 12"/></svg></div>'
                    '<h2>Authorization Complete</h2>'
                    '<p>You may close this window and return to the terminal.</p>'
                    '</div></body></html>'
                )
                self.wfile.write(html.encode())
            else:
                self.send_response(400)
                self.end_headers()

        def log_message(self, fmt, *args):
            pass

    server = http.server.HTTPServer(("localhost", OAUTH_REDIRECT_PORT), Handler)
    server.timeout = 180
    server.handle_request()
    return captured_code["value"]


def _exchange_code(app_id: str, app_secret: str, code: str):
    """Exchange authorization code for user_access_token."""
    payload = json.dumps({
        "grant_type": "authorization_code",
        "client_id": app_id,
        "client_secret": app_secret,
        "code": code,
        "redirect_uri": OAUTH_REDIRECT_URI,
    }).encode()

    req = urllib.request.Request(
        f"{API_BASE}/authen/v2/oauth/token",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        result = json.loads(e.read().decode())

    if result.get("code", 0) != 0:
        Log.error(f"Token exchange failed: {result.get('msg', 'unknown')}")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(1)

    data = result.get("data", result)
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    expires_in = data.get("expires_in", 7200)

    if not access_token:
        Log.error("No access_token in response.")
        sys.exit(1)

    scope_str = data.get("scope", "")

    expire_at = int(time.time()) + expires_in
    save_credentials({
        "user_access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
        "expire_at": expire_at,
        "scope": scope_str,
        "app_id": app_id,
        "app_secret": app_secret,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    print()
    Log.ok("认证成功!")
    print(f"  user_access_token: {access_token[:25]}...")
    print(f"  有效期: {expires_in}s (~{expires_in // 3600}h)")
    print(f"  已授权 scopes: {scope_str[:80]}{'...' if len(scope_str) > 80 else ''}")
    print(f"  凭证已保存: {CREDENTIALS_FILE}")


# ─── API Explorer Guide ─────────────────────────────────────────────────────

def cmd_login_explorer():
    print()
    print("  通过 API Explorer 获取 user_access_token（最快捷）")
    print()
    print("  步骤：")
    print("  1. 打开 https://open.feishu.cn/api-explorer/")
    print("  2. 左侧选择一个需要 user_access_token 的 API")
    print("  3. 右侧「认证信息」→ 选择应用 → 点击「获取 user_access_token」")
    print("  4. 在弹出窗口中授权")
    print("  5. 复制 token，设置环境变量：")
    print()
    print('     export FEISHU_USER_ACCESS_TOKEN="u-xxxxxxxx"')
    print()
    print("  注意: Token 有效期约 2 小时")
    print()


# ─── Token Refresh ───────────────────────────────────────────────────────────

def cmd_refresh():
    app_id, app_secret = get_app_credentials()
    if not app_id or not app_secret:
        Log.error("FEISHU_APP_ID and FEISHU_APP_SECRET required for refresh.")
        sys.exit(1)

    creds = load_credentials()
    refresh_token = creds.get("refresh_token", "")
    if not refresh_token:
        Log.error("No refresh_token found.")
        Log.error("Ensure 'offline_access' permission is enabled, then: ./feishu auth relogin")
        sys.exit(1)

    Log.info("Refreshing user_access_token...")
    payload = json.dumps({
        "grant_type": "refresh_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "refresh_token": refresh_token,
    }).encode()

    req = urllib.request.Request(
        f"{API_BASE}/authen/v2/oauth/token",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        result = json.loads(e.read().decode())

    code = result.get("code", 0)
    if code != 0:
        if code == 20037:
            Log.error("refresh_token expired (365-day limit). Must re-authorize.")
            Log.error("Run: ./feishu auth relogin")
        elif code in (20064, 20073):
            Log.error("refresh_token already used (single-use). Run: ./feishu auth login")
        else:
            Log.error(f"Refresh failed: {result.get('error_description', result.get('msg', '?'))}")
            Log.error("Run: ./feishu auth login")
        sys.exit(1)

    data = result.get("data", result)
    access_token = data.get("access_token", "")
    new_refresh = data.get("refresh_token", "")
    expires_in = data.get("expires_in", 7200)
    scope_str = data.get("scope", creds.get("scope", ""))
    refresh_expires_in = data.get("refresh_token_expires_in", 0)
    expire_at = int(time.time()) + expires_in

    creds.update({
        "user_access_token": access_token,
        "refresh_token": new_refresh,
        "expires_in": expires_in,
        "expire_at": expire_at,
        "scope": scope_str,
        "refresh_token_expires_in": refresh_expires_in,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    save_credentials(creds)

    Log.ok("Token refreshed!")
    if not new_refresh:
        Log.warn("No refresh_token returned. Ensure 'offline_access' is in scope.")


# ─── Status ──────────────────────────────────────────────────────────────────

def cmd_status():
    print()
    print("  飞书认证状态 (user identity only)")
    print()

    uat = os.environ.get("FEISHU_USER_ACCESS_TOKEN", "")
    aid = os.environ.get("FEISHU_APP_ID", "")

    print(f"  FEISHU_USER_ACCESS_TOKEN:   {'[Y] ' + uat[:15] + '...' if uat else '[N] not set'}")
    print(f"  FEISHU_APP_ID:              {'[Y] ' + aid if aid else '[N] not set'}")
    print()

    if os.path.isfile(CREDENTIALS_FILE):
        creds = load_credentials()
        expire_at = creds.get("expire_at", 0)
        updated = creds.get("updated_at", "?")
        now = int(time.time())
        print(f"  Credentials: [Y] exists (updated {updated})")
        if expire_at > now:
            remaining = (expire_at - now) // 60
            print(f"  Token:       [Y] valid ({remaining}min remaining)")
            scope = creds.get("scope", "")
            if scope:
                print(f"  Scopes:      {scope[:80]}{'...' if len(scope) > 80 else ''}")
        elif expire_at > 0:
            print("  Token:       [N] expired -> ./feishu auth refresh")

        if uat:
            stored = creds.get("user_access_token", "")
            if stored and stored != uat:
                print()
                print("  [!] FEISHU_USER_ACCESS_TOKEN env var differs from credentials file.")
                print("      Credentials file takes priority. To use env var: rm ~/.feishu/credentials.json")
    else:
        print("  Credentials: [N] not found")
    print()

    print("  快速开始:")
    print("    ./feishu auth login")
    print("    ./feishu auth relogin  (权限变更后使用)")
    print()


# ─── Tenant Token ────────────────────────────────────────────────────────────

def cmd_tenant():
    app_id, app_secret = get_app_credentials()
    if not app_id or not app_secret:
        Log.error("FEISHU_APP_ID and FEISHU_APP_SECRET must be set.")
        sys.exit(1)

    payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/auth/v3/tenant_access_token/internal",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    if result.get("code", 0) != 0:
        Log.error(f"Failed: {result.get('msg')}")
        sys.exit(1)

    token = result["tenant_access_token"]
    Log.ok(f"tenant_access_token: {token[:20]}...")
    print(f'  export FEISHU_TENANT_ACCESS_TOKEN="{token}"')


# ─── Relogin (Revoke + Login) ────────────────────────────────────────────────

def cmd_relogin():
    """Revoke existing authorization, clear credentials, and re-login.

    Why: Feishu reuses old authorization records when the user has already
    authorized the app. If scopes were added AFTER the first authorization,
    subsequent logins silently inherit the old (insufficient) scopes.
    This command forces a clean re-authorization with all current scopes.
    """
    app_id, app_secret = get_app_credentials()

    if not app_id or not app_secret:
        Log.error("FEISHU_APP_ID and FEISHU_APP_SECRET must be set.")
        sys.exit(1)

    Log.info("Step 1/3: Revoking old authorization...")

    # Get a tenant_access_token to call the revoke API
    payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/auth/v3/tenant_access_token/internal",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
        tenant_token = result.get("tenant_access_token", "")
    except Exception:
        tenant_token = ""

    # Try to revoke user authorization via tenant API
    revoked = False
    if tenant_token:
        # Load stored user info to find open_id for revocation
        creds = load_credentials()
        stored_token = creds.get("user_access_token", "")

        # Try direct token revocation
        if stored_token:
            try:
                rev_req = urllib.request.Request(
                    f"{API_BASE}/authen/v1/access_token/revoke",
                    data=json.dumps({"token": stored_token, "token_type_hint": "access_token"}).encode(),
                    method="POST",
                )
                rev_req.add_header("Authorization", f"Bearer {tenant_token}")
                rev_req.add_header("Content-Type", "application/json")
                with urllib.request.urlopen(rev_req) as resp:
                    rev_result = json.loads(resp.read().decode())
                if rev_result.get("code", -1) == 0:
                    Log.ok("Access token revoked via API.")
                    revoked = True
                else:
                    Log.warn(f"Token revocation returned: {rev_result.get('msg', '?')}")
            except Exception as e:
                Log.warn(f"Token revocation API not available: {e}")

    if not revoked:
        Log.warn("Could not revoke via API (this is normal for expired tokens).")
        Log.info("Will proceed — Feishu should re-prompt for consent with new scopes.")

    # Step 2: Clear local credentials
    Log.info("Step 2/3: Clearing local credentials...")
    if os.path.isfile(CREDENTIALS_FILE):
        os.remove(CREDENTIALS_FILE)
        Log.ok(f"Removed {CREDENTIALS_FILE}")

    # Clear env vars for this process
    os.environ.pop("FEISHU_USER_ACCESS_TOKEN", None)
    os.environ.pop("FEISHU_TENANT_ACCESS_TOKEN", None)

    # Step 3: Re-login with ALL scopes (core + features)
    Log.info("Step 3/3: Starting fresh OAuth2 authorization...")
    Log.info("Please RE-AUTHORIZE in the browser — you should see the full permission list.")
    print()
    _open_browser_and_exchange(app_id, app_secret, ALL_SCOPES)


# ─── CLI Router ──────────────────────────────────────────────────────────────

def main():
    commands = {
        "login": cmd_login,
        "relogin": cmd_relogin,
        "login-explorer": cmd_login_explorer,
        "refresh": cmd_refresh,
        "status": cmd_status,
        "tenant": cmd_tenant,
    }

    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        print("Usage: ./feishu auth <command>")
        print()
        print("Commands:")
        print("  login            OAuth2 授权（开浏览器）")
        print("  relogin          撤销旧授权 + 重新登录（scope 变更后使用）")
        print("  login-explorer   API Explorer 手动获取")
        print("  refresh          刷新过期 token")
        print("  status           查看认证状态")
        print("  tenant           获取应用 token")
        sys.exit(0)

    commands[sys.argv[1]]()


if __name__ == "__main__":
    main()
