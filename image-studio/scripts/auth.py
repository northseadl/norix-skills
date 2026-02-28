#!/usr/bin/env python3
"""
Nano Banana API authentication management.

Commands:
  init     — Store API key (non-interactive, Agent-safe)
  status   — Check authentication status
  clean    — Remove stored credentials
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from nanobanana_api import (
    save_credentials, clear_credentials, validate_connection, CREDENTIALS_FILE, ENV_KEY_NAMES,
)


def cmd_init(args):
    """Store API key and validate connection."""
    api_key = args.api_key
    if not api_key:
        print("Error: --api-key is required.", file=sys.stderr)
        sys.exit(1)

    save_credentials(api_key)

    # Set env for immediate use in this session
    os.environ["NANOBANANA_API_KEY"] = api_key

    if args.verify:
        print("Verifying API key...")
        if not validate_connection():
            print("Warning: API key saved but validation failed. Double-check the key.", file=sys.stderr)
            sys.exit(1)


def cmd_status(_args):
    """Display current auth status."""
    env_key = None
    env_name_found = None
    for env_name in ENV_KEY_NAMES:
        val = os.environ.get(env_name)
        if val:
            env_key = val
            env_name_found = env_name
            break

    file_key = None

    if CREDENTIALS_FILE.exists():
        import json
        try:
            data = json.loads(CREDENTIALS_FILE.read_text())
            file_key = data.get("api_key")
        except Exception:
            pass

    print("Nano Banana Auth Status (Google Gemini API)")
    print("-" * 45)

    if env_key:
        masked = f"{env_key[:6]}...{env_key[-4:]}" if len(env_key) > 12 else "***"
        print(f"Environment: ✓ {env_name_found} = {masked}")
    else:
        print(f"Environment: ✗ None of {', '.join(ENV_KEY_NAMES)} set")

    if file_key:
        masked = f"{file_key[:6]}...{file_key[-4:]}" if len(file_key) > 12 else "***"
        print(f"Credentials: ✓ {CREDENTIALS_FILE} = {masked}")
    else:
        print(f"Credentials: ✗ {CREDENTIALS_FILE} not found")

    if not env_key and not file_key:
        print("\nNo credentials configured. Run:")
        print("  ./nanobanana auth init --api-key <YOUR_GEMINI_KEY>")
        sys.exit(1)

    print(f"\nActive key source: {'environment' if env_key else 'file'}")


def cmd_clean(_args):
    """Remove stored credentials."""
    clear_credentials()


def main():
    parser = argparse.ArgumentParser(description="Nano Banana authentication management")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # init
    init_parser = subparsers.add_parser("init", help="Store API key")
    init_parser.add_argument("--api-key", required=True, help="Nano Banana API key")
    init_parser.add_argument("--verify", action="store_true", default=True,
                             help="Verify API key after saving (default: True)")
    init_parser.add_argument("--no-verify", action="store_false", dest="verify",
                             help="Skip API key verification")
    init_parser.set_defaults(func=cmd_init)

    # status
    status_parser = subparsers.add_parser("status", help="Check auth status")
    status_parser.set_defaults(func=cmd_status)

    # clean
    clean_parser = subparsers.add_parser("clean", help="Remove stored credentials")
    clean_parser.set_defaults(func=cmd_clean)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
