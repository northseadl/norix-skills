#!/usr/bin/env python3
"""Coding.net Authentication — Init, Setup, Status, Clean.

Usage via unified CLI:
  ./coding auth init --team X --token Y  # Non-interactive init (Agent-friendly)
  ./coding auth setup                    # Interactive setup (human-friendly)
  ./coding auth status                   # Check current auth status
  ./coding auth clean                    # Delete all stored credentials (~/.coding/)
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from coding_api import CREDENTIALS_FILE, DATA_DIR, CodingClient, Log, safe_clean


# ─── Shared Logic ────────────────────────────────────────────────────────────

def _normalize_team(raw: str) -> str:
    """Extract team slug from various input formats.

    Handles: 'my-team', 'https://my-team.coding.net', 'my-team.coding.net/xxx'
    """
    raw = raw.replace("https://", "").replace("http://", "")
    return raw.split(".coding.net")[0].split("/")[0].strip()


def _verify_and_save(team: str, token: str) -> bool:
    """Verify connectivity and persist credentials.

    Verification strategy:
    1. Try DescribeCodingProjects (only needs project:profile:ro, most tokens have this)
    2. If scope error (UnauthorizedOperation) but API responded → connectivity proven
    3. Only fail on network errors or auth failures (401)

    Returns True on success, calls sys.exit(1) on failure.
    """
    Log.info(f"验证连接: https://{team}.coding.net ...")

    # Inject into env so CodingClient can resolve
    os.environ["CODING_TEAM"] = team
    os.environ["CODING_TOKEN"] = token
    client = CodingClient()

    result = client.call("DescribeCodingProjects", {
        "PageNumber": 1,
        "PageSize": 1,
    })
    error = result.get("Error")

    if error:
        err_code = error.get("Code", "")
        err_msg = error.get("Message", "?")

        # Network or auth failure → truly broken
        if err_code in ("NetworkError", "AuthFailure") or "401" in str(err_code):
            Log.error(f"连接验证失败: {err_msg}")
            Log.error("请检查团队域名和 Token 是否正确")
            sys.exit(1)

        # Scope error → API responded, connectivity is fine, just limited permissions
        if err_code == "UnauthorizedOperation":
            Log.warn(f"Token scope 受限，但连接正常: {err_msg}")
            Log.warn("部分 API 可能因 scope 不足而无法访问")
        else:
            Log.warn(f"验证返回非致命错误: {err_code} — {err_msg}")
    else:
        project_count = result.get("Data", {}).get("TotalCount", "?")
        Log.ok(f"连接验证成功，可访问 {project_count} 个项目")

    # Persist credentials
    os.makedirs(os.path.dirname(CREDENTIALS_FILE), exist_ok=True)
    creds = {
        "team": team,
        "token": token,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(CREDENTIALS_FILE, "w") as f:
        json.dump(creds, f, indent=2, ensure_ascii=False)
    os.chmod(CREDENTIALS_FILE, 0o600)

    Log.ok(f"配置成功! 已连接到 {team}.coding.net")
    Log.info(f"凭证已保存: {CREDENTIALS_FILE}")
    return True


# ─── Init (Non-Interactive, Agent-Friendly) ──────────────────────────────────

def cmd_init():
    """Non-interactive init via CLI args. Designed for Agent automation.

    Usage: ./coding auth init --team my-team --token xxx-yyy-zzz
    """
    parser = argparse.ArgumentParser(prog="coding auth init",
                                     description="Non-interactive credential setup")
    parser.add_argument("--team", required=True, help="Team slug (xxx in xxx.coding.net)")
    parser.add_argument("--token", required=True, help="Personal Access Token")
    args = parser.parse_args(sys.argv[2:])  # skip 'auth' and 'init'

    team = _normalize_team(args.team)
    if not team:
        Log.error("团队域名不能为空")
        sys.exit(1)

    _verify_and_save(team, args.token)


# ─── Setup (Interactive, Human-Friendly) ─────────────────────────────────────

def cmd_setup():
    """Interactive setup wizard. For human users, NOT for Agent automation."""
    print()
    print("  Coding.net 配置向导")
    print("  ─────────────────────────────────────")
    print()
    print("  前置步骤:")
    print("  1. 登录 Coding.net → 个人头像 → 个人账户设置 → 访问令牌")
    print("  2. 新建令牌 → 勾选所需权限范围:")
    print("     - project:depot:rw      (代码仓库读写)")
    print("     - project:ci:rw         (持续集成)")
    print("     - project:artifacts:rw  (制品库)")
    print("     - team:profile:ro       (团队信息，验证连通性)")
    print("  3. 复制生成的令牌 (仅显示一次!)")
    print()

    # Load existing credentials as defaults
    existing = {}
    if os.path.isfile(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE) as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    existing_team = existing.get("team", "")
    team_prompt = "  团队域名 (xxx.coding.net 中的 xxx)"
    if existing_team:
        team_prompt += f" [{existing_team}]"
    team_prompt += ": "

    try:
        team = input(team_prompt).strip() or existing_team
    except (EOFError, KeyboardInterrupt):
        print()
        Log.info("已取消")
        return

    if not team:
        Log.error("团队域名不能为空")
        sys.exit(1)

    team = _normalize_team(team)

    try:
        token = input("  Personal Access Token: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        Log.info("已取消")
        return

    if not token:
        Log.error("Token 不能为空")
        sys.exit(1)

    print()
    _verify_and_save(team, token)
    print()


# ─── Status ──────────────────────────────────────────────────────────────────

def cmd_status():
    """Show current auth status, including live connectivity check."""
    print()
    print("  Coding.net 认证状态")
    print()

    team_env = os.environ.get("CODING_TEAM", "")
    token_env = os.environ.get("CODING_TOKEN", "")

    print(f"  CODING_TEAM:   {'[Y] ' + team_env if team_env else '[N] not set'}")
    print(f"  CODING_TOKEN:  {'[Y] ' + token_env[:15] + '...' if token_env else '[N] not set'}")
    print()

    if os.path.isfile(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE) as f:
                creds = json.load(f)
            team = creds.get("team", "?")
            user = creds.get("user_name", "?")
            updated = creds.get("updated_at", "?")
            print(f"  Credentials: [Y] exists (updated {updated})")
            print(f"  Team:        {team}.coding.net")
            print(f"  User:        {user}")

            # Live connectivity check — PAT can be revoked at any time
            client = CodingClient()
            result = client.call("DescribeCodingProjects", {"PageNumber": 1, "PageSize": 1})
            if result.get("Error"):
                print(f"  Token:       [!] INVALID — token may have been revoked")
            else:
                print(f"  Token:       [Y] valid (live check passed)")

        except (json.JSONDecodeError, OSError):
            print("  Credentials: [!] file exists but cannot be read")
    else:
        print("  Credentials: [N] not found")
    print()

    print("  快速开始:")
    print("    ./coding auth init --team xxx --token yyy   (Agent/脚本)")
    print("    ./coding auth setup                        (交互式向导)")
    print()


# ─── Clean ───────────────────────────────────────────────────────────────────

def cmd_clean():
    """Safely delete ~/.coding/ with multi-layer validation."""
    safe_clean(DATA_DIR, "coding")


# ─── CLI Router ──────────────────────────────────────────────────────────────

def main():
    commands = {
        "init": cmd_init,
        "setup": cmd_setup,
        "status": cmd_status,
        "clean": cmd_clean,
    }

    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        print("Usage: ./coding auth <command>")
        print()
        print("Commands:")
        print("  init      非交互式配置 (Agent/脚本使用): --team X --token Y")
        print("  setup     交互式配置向导 (人类使用)")
        print("  status    查看认证状态 (含实时连通性检查)")
        print("  clean     清理所有凭据数据 (~/.coding/)")
        sys.exit(0)

    commands[sys.argv[1]]()


if __name__ == "__main__":
    main()
