#!/usr/bin/env python3
"""Vault Migration — Re-encrypt all vaults from legacy fingerprint to seed-based fingerprint.

Legacy formula:  SHA256("{hostname}:{mac}:{username}:norix-skills")
New formula:     SHA256("{seed}:norix-skills")  where seed = ~/.agents/.machine-seed

This script:
  1. Scans all vault files under ~/.agents/data/
  2. Tries to decrypt each token with both old and new keys
  3. Re-encrypts tokens that were using the old key
  4. Creates a backup before modifying any vault file

Run: python3 scripts/migrate_vault.py [--dry-run]

Idempotent: safe to run multiple times. Tokens already using the new key are skipped.
"""

import base64
import getpass
import hashlib
import hmac
import json
import os
import shutil
import socket
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

_NX1_PREFIX = "NX1$"
_NX1_DOMAIN = "norix-skills"
_NX1_KDF_SALT = b"norix-skills-vault-v1"
_NX1_KDF_ITERATIONS = 200_000
_NX1_KEY_LEN = 32
_NX1_SALT_LEN = 16
_NX1_TAG_LEN = 32

SEED_FILE = Path.home() / ".agents" / ".machine-seed"
DATA_DIR = Path.home() / ".agents" / "data"


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _derive_key(fingerprint: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", fingerprint, _NX1_KDF_SALT, _NX1_KDF_ITERATIONS, dklen=_NX1_KEY_LEN
    )


def _nx1_decrypt(token: str, master_key: bytes) -> Optional[str]:
    if not token.startswith(_NX1_PREFIX):
        return None
    try:
        blob = base64.b64decode(token[len(_NX1_PREFIX):])
    except Exception:
        return None
    if len(blob) < _NX1_SALT_LEN + _NX1_TAG_LEN + 1:
        return None
    salt = blob[:_NX1_SALT_LEN]
    tag = blob[_NX1_SALT_LEN:_NX1_SALT_LEN + _NX1_TAG_LEN]
    ciphertext = blob[_NX1_SALT_LEN + _NX1_TAG_LEN:]
    expected_tag = hmac.new(master_key, salt + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        return None
    keystream = hashlib.pbkdf2_hmac("sha256", master_key, salt, 1, dklen=len(ciphertext))
    return _xor_bytes(ciphertext, keystream).decode("utf-8")


def _nx1_encrypt(plaintext: str, master_key: bytes) -> str:
    plaintext_bytes = plaintext.encode("utf-8")
    salt = os.urandom(_NX1_SALT_LEN)
    keystream = hashlib.pbkdf2_hmac("sha256", master_key, salt, 1, dklen=len(plaintext_bytes))
    ciphertext = _xor_bytes(plaintext_bytes, keystream)
    tag = hmac.new(master_key, salt + ciphertext, hashlib.sha256).digest()
    return _NX1_PREFIX + base64.b64encode(salt + tag + ciphertext).decode("ascii")


def get_legacy_key() -> bytes:
    """Derive master key using the LEGACY formula: hostname:mac:username."""
    hostname = socket.gethostname()
    mac = format(uuid.getnode(), "012x")
    username = getpass.getuser()
    identity = f"{hostname}:{mac}:{username}:{_NX1_DOMAIN}"
    fp = hashlib.sha256(identity.encode()).digest()
    return _derive_key(fp)


def get_new_key() -> bytes:
    """Derive master key using the NEW formula: seed file."""
    if not SEED_FILE.exists():
        raise FileNotFoundError(f"Seed file not found: {SEED_FILE}")
    seed = SEED_FILE.read_text().strip()
    fp = hashlib.sha256(f"{seed}:{_NX1_DOMAIN}".encode()).digest()
    return _derive_key(fp)


def migrate():
    dry_run = "--dry-run" in sys.argv

    if not SEED_FILE.exists():
        print(f"ERROR: {SEED_FILE} does not exist. Run any skill once to initialize it.")
        sys.exit(1)

    if not DATA_DIR.exists():
        print(f"No data directory found at {DATA_DIR}. Nothing to migrate.")
        return

    legacy_key = get_legacy_key()
    new_key = get_new_key()

    if legacy_key == new_key:
        print("Legacy and new keys are identical. No migration needed.")
        return

    vault_files = list(DATA_DIR.glob("*/.vault.json"))
    if not vault_files:
        print("No vault files found. Nothing to migrate.")
        return

    print(f"{'[DRY RUN] ' if dry_run else ''}Migrating {len(vault_files)} vault file(s)...")
    print(f"  Legacy formula: hostname:mac:username:norix-skills")
    print(f"  New formula:    seed:norix-skills (from {SEED_FILE})")
    print()

    total_migrated = 0
    total_already_new = 0
    total_undecryptable = 0

    for vault_path in vault_files:
        skill_name = vault_path.parent.name
        print(f"── {skill_name} ({vault_path})")

        try:
            vault = json.loads(vault_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            print(f"   SKIP: Cannot read vault: {e}")
            continue

        modified = False
        for account, token in vault.items():
            if not isinstance(token, str) or not token.startswith(_NX1_PREFIX):
                print(f"   {account}: SKIP (not NX1 token)")
                continue

            # Try new key first
            if _nx1_decrypt(token, new_key) is not None:
                print(f"   {account}: OK (already using new key)")
                total_already_new += 1
                continue

            # Try legacy key
            plaintext = _nx1_decrypt(token, legacy_key)
            if plaintext is not None:
                new_token = _nx1_encrypt(plaintext, new_key)
                vault[account] = new_token
                modified = True
                total_migrated += 1
                print(f"   {account}: MIGRATED (re-encrypted with new key)")
            else:
                print(f"   {account}: UNDECRYPTABLE (neither key works)")
                total_undecryptable += 1

        if modified and not dry_run:
            # Backup original
            backup_path = vault_path.with_suffix(
                f".vault.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            )
            shutil.copy2(vault_path, backup_path)
            print(f"   Backup: {backup_path}")

            vault_path.write_text(json.dumps(vault, indent=2, ensure_ascii=False))
            os.chmod(vault_path, 0o600)
            print(f"   Saved: {vault_path}")

    print()
    print(f"Summary:")
    print(f"  Migrated:      {total_migrated}")
    print(f"  Already new:   {total_already_new}")
    print(f"  Undecryptable: {total_undecryptable}")

    if dry_run and total_migrated > 0:
        print(f"\nRe-run without --dry-run to apply migration.")


if __name__ == "__main__":
    migrate()
