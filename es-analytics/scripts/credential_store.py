#!/usr/bin/env python3
"""Credential Store — Machine-fingerprint encrypted secret storage.

Zero external dependencies. Uses only Python 3 stdlib.

Protocol NX1 (Norix Vault v1):
  - Key: PBKDF2-SHA256(SHA256(machine_fingerprint), salt, 200k iterations)
  - Cipher: PBKDF2-SHA256 keystream XOR (stream cipher)
  - Auth: HMAC-SHA256 over salt + ciphertext
  - Format: NX1$<base64(salt[16] || tag[32] || ciphertext[N])>

Cross-language: any language with SHA256 + PBKDF2 + HMAC + Base64 can
implement a compatible reader. See docstring of NX1Vault for protocol spec.

Usage:
    from credential_store import CredentialStore
    store = CredentialStore("adb-mysql", "~/.agents/data/adb-mysql")
    store.set("profile:prod", "s3cr3t")
    secret = store.get("profile:prod")
    store.delete("profile:prod")
"""

import base64
import getpass
import hashlib
import hmac
import json
import os
import socket
import sys
import uuid
from pathlib import Path
from typing import Optional


# ── NX1 Vault Core (Cross-Language Protocol) ─────────────────────────────────

_NX1_PREFIX = "NX1$"
_NX1_DOMAIN = "norix-skills"
_NX1_KDF_SALT = b"norix-skills-vault-v1"
_NX1_KDF_ITERATIONS = 200_000
_NX1_KEY_LEN = 32
_NX1_SALT_LEN = 16
_NX1_TAG_LEN = 32


def _machine_fingerprint() -> bytes:
    """Derive a stable machine fingerprint from hardware identifiers.

    Inputs (deterministic, stable across reboots):
      - hostname
      - MAC address (primary NIC)
      - OS username
      - Fixed domain string

    Cross-language spec:
      fingerprint = SHA256("{hostname}:{mac_hex}:{username}:norix-skills")
    """
    hostname = socket.gethostname()
    mac = format(uuid.getnode(), "012x")  # 48-bit MAC as lowercase hex
    username = getpass.getuser()
    identity = f"{hostname}:{mac}:{username}:{_NX1_DOMAIN}"
    return hashlib.sha256(identity.encode("utf-8")).digest()


def _derive_master_key(fingerprint: bytes) -> bytes:
    """Derive master key from fingerprint via PBKDF2.

    Cross-language spec:
      master_key = PBKDF2-SHA256(fingerprint, "norix-skills-vault-v1", 200000, 32)
    """
    return hashlib.pbkdf2_hmac(
        "sha256", fingerprint, _NX1_KDF_SALT, _NX1_KDF_ITERATIONS, dklen=_NX1_KEY_LEN
    )


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    """XOR two byte strings of equal length."""
    return bytes(x ^ y for x, y in zip(a, b))


def nx1_encrypt(plaintext: str, master_key: bytes) -> str:
    """Encrypt a string using NX1 protocol.

    Returns: "NX1$<base64(salt[16] + tag[32] + ciphertext[N])>"

    Cross-language spec:
      1. salt = random(16)
      2. keystream = PBKDF2-SHA256(master_key, salt, iterations=1, dklen=len(plaintext_bytes))
      3. ciphertext = XOR(plaintext_bytes, keystream)
      4. tag = HMAC-SHA256(master_key, salt || ciphertext)
      5. output = "NX1$" + base64(salt || tag || ciphertext)
    """
    plaintext_bytes = plaintext.encode("utf-8")
    salt = os.urandom(_NX1_SALT_LEN)

    # Generate keystream via PBKDF2 (single iteration = PRF expansion)
    keystream = hashlib.pbkdf2_hmac(
        "sha256", master_key, salt, iterations=1, dklen=len(plaintext_bytes)
    )
    ciphertext = _xor_bytes(plaintext_bytes, keystream)

    # Authentication tag
    tag = hmac.new(master_key, salt + ciphertext, hashlib.sha256).digest()

    blob = salt + tag + ciphertext
    return _NX1_PREFIX + base64.b64encode(blob).decode("ascii")


def nx1_decrypt(token: str, master_key: bytes) -> Optional[str]:
    """Decrypt an NX1 token. Returns None on any failure (tampered, wrong key, etc.)."""
    if not token.startswith(_NX1_PREFIX):
        return None

    try:
        blob = base64.b64decode(token[len(_NX1_PREFIX):])
    except Exception:
        return None

    if len(blob) < _NX1_SALT_LEN + _NX1_TAG_LEN + 1:
        return None

    salt = blob[:_NX1_SALT_LEN]
    tag = blob[_NX1_SALT_LEN : _NX1_SALT_LEN + _NX1_TAG_LEN]
    ciphertext = blob[_NX1_SALT_LEN + _NX1_TAG_LEN :]

    # Verify integrity (constant-time comparison)
    expected_tag = hmac.new(master_key, salt + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        return None

    # Decrypt
    keystream = hashlib.pbkdf2_hmac(
        "sha256", master_key, salt, iterations=1, dklen=len(ciphertext)
    )
    plaintext_bytes = _xor_bytes(ciphertext, keystream)

    try:
        return plaintext_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None


# ── Credential Store (High-Level API) ────────────────────────────────────────

# Singleton master key (derived once per process)
_master_key: Optional[bytes] = None


def _get_master_key() -> bytes:
    global _master_key
    if _master_key is None:
        _master_key = _derive_master_key(_machine_fingerprint())
    return _master_key


class CredentialStore:
    """Encrypted credential store backed by a JSON vault file.

    Secrets are encrypted with NX1 protocol using a machine-fingerprint-derived key.
    The vault file only contains encrypted tokens — never plaintext secrets.
    """

    def __init__(self, namespace: str, data_dir: str):
        """Initialize store.

        Args:
            namespace: Logical namespace (e.g. "adb-mysql", "feishu")
            data_dir:  Directory to store the vault file
        """
        self.namespace = namespace
        self.data_dir = Path(os.path.expanduser(data_dir))
        self._vault_file = self.data_dir / ".vault.json"
        self._key = _get_master_key()

    # ── Public API ───────────────────────────────────────────────

    def get(self, account: str) -> Optional[str]:
        """Retrieve and decrypt a secret. Returns None if not found or tampered."""
        vault = self._load_vault()
        token = vault.get(account)
        if token is None:
            return None
        return nx1_decrypt(token, self._key)

    def set(self, account: str, secret: str) -> None:
        """Encrypt and store a secret."""
        vault = self._load_vault()
        vault[account] = nx1_encrypt(secret, self._key)
        self._save_vault(vault)

    def delete(self, account: str) -> bool:
        """Delete a secret. Returns True if deleted, False if not found."""
        vault = self._load_vault()
        if account in vault:
            del vault[account]
            self._save_vault(vault)
            return True
        return False

    def has(self, account: str) -> bool:
        """Check if a secret exists (without decrypting)."""
        vault = self._load_vault()
        return account in vault

    def clean_all(self) -> int:
        """Delete all secrets. Returns count of deleted items."""
        vault = self._load_vault()
        count = len(vault)
        if count > 0:
            self._vault_file.unlink(missing_ok=True)
        return count

    # ── File Backend ─────────────────────────────────────────────

    def _load_vault(self) -> dict:
        if self._vault_file.exists():
            try:
                return json.loads(self._vault_file.read_text())
            except (json.JSONDecodeError, OSError):
                return {}
        return {}

    def _save_vault(self, vault: dict) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.data_dir, 0o700)
        except OSError:
            pass
        self._vault_file.write_text(json.dumps(vault, indent=2, ensure_ascii=False))
        try:
            os.chmod(self._vault_file, 0o600)
        except OSError:
            pass
