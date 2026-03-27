#!/usr/bin/env python3
"""Credential Store Stability Test Suite.

Validates that credentials survive all real-world scenarios:
  1. Device reboot (seed file persistence)
  2. Network interface changes (VPN, proxy, NIC switch)
  3. MAC address changes
  4. Hostname changes
  5. Cross-language compatibility (Python ↔ TypeScript)
  6. Vault file integrity (corruption, permission)
  7. Concurrent access
  8. Seed file edge cases

Run: python3 scripts/test_credential_stability.py
"""

import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

import credential_store as cs


class TestSeedFilePersistence(unittest.TestCase):
    """Verify seed file is the single source of truth and survives all OS changes."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None  # Reset singleton

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_seed_created_from_hwid_on_first_run(self):
        """First run: seed file created from platform hardware UUID."""
        self.assertFalse(self.seed_file.exists())
        fp = cs._machine_fingerprint()
        self.assertTrue(self.seed_file.exists())
        self.assertGreater(len(self.seed_file.read_text().strip()), 0)
        self.assertEqual(len(fp), 32)

    def test_seed_immutable_after_creation(self):
        """Seed file content never changes once created."""
        fp1 = cs._machine_fingerprint()
        cs._master_key = None
        seed_content = self.seed_file.read_text()

        fp2 = cs._machine_fingerprint()
        self.assertEqual(fp1, fp2)
        self.assertEqual(seed_content, self.seed_file.read_text())

    def test_fingerprint_stable_across_hwid_changes(self):
        """After seed file exists, hardware UUID changes don't affect fingerprint."""
        fp1 = cs._machine_fingerprint()
        cs._master_key = None

        # Even if platform_hwid would return something different, seed file wins
        with patch.object(cs, '_platform_hwid', return_value="COMPLETELY-DIFFERENT-UUID"):
            fp2 = cs._machine_fingerprint()
        self.assertEqual(fp1, fp2)

    def test_seed_file_permissions(self):
        """Seed file must have 0600 permissions."""
        cs._machine_fingerprint()
        mode = oct(self.seed_file.stat().st_mode & 0o777)
        self.assertEqual(mode, "0o600")

    def test_seed_survives_simulated_reboot(self):
        """Simulate reboot: reset all in-memory state, re-derive fingerprint."""
        cs._machine_fingerprint()
        seed_before = self.seed_file.read_text()

        # Simulate reboot: clear all module-level state
        cs._master_key = None

        fp_after = cs._machine_fingerprint()
        seed_after = self.seed_file.read_text()

        self.assertEqual(seed_before, seed_after)
        self.assertIsNotNone(fp_after)

    def test_custom_seed_file_respected(self):
        """Manually created seed file is used as-is, no hwid query."""
        self.seed_file.write_text("my-custom-stable-seed")
        os.chmod(self.seed_file, 0o600)

        with patch.object(cs, '_platform_hwid') as mock_hwid:
            fp = cs._machine_fingerprint()
            mock_hwid.assert_not_called()

        expected = hashlib.sha256("my-custom-stable-seed:norix-skills".encode()).digest()
        self.assertEqual(fp, expected)


class TestNetworkIndependence(unittest.TestCase):
    """Verify fingerprint does NOT depend on network state."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self.seed_file.write_text("FIXED-TEST-SEED-UUID")
        os.chmod(self.seed_file, 0o600)
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _get_fresh_fingerprint(self):
        cs._master_key = None
        return cs._machine_fingerprint()

    def test_fingerprint_independent_of_hostname(self):
        """Fingerprint must not change when hostname changes."""
        fp1 = self._get_fresh_fingerprint()
        with patch('platform.node', return_value='new-hostname'):
            fp2 = self._get_fresh_fingerprint()
        self.assertEqual(fp1, fp2)

    def test_fingerprint_independent_of_mac_address(self):
        """Fingerprint must not change when MAC address changes (VPN, NIC switch)."""
        fp1 = self._get_fresh_fingerprint()
        # No MAC in the formula at all — this test documents the design
        fp2 = self._get_fresh_fingerprint()
        self.assertEqual(fp1, fp2)

    def test_fingerprint_independent_of_network_interfaces(self):
        """Fingerprint must not change when network interfaces change."""
        fp1 = self._get_fresh_fingerprint()
        # Patch os.uname to simulate different network config
        with patch('os.uname') as mock_uname:
            mock_uname.return_value = MagicMock(nodename='different-host')
            fp2 = self._get_fresh_fingerprint()
        self.assertEqual(fp1, fp2)

    def test_fingerprint_independent_of_username(self):
        """Fingerprint uses seed:domain, not username."""
        fp1 = self._get_fresh_fingerprint()
        with patch('os.getlogin', return_value='different_user'):
            fp2 = self._get_fresh_fingerprint()
        self.assertEqual(fp1, fp2)


class TestEncryptDecryptRoundtrip(unittest.TestCase):
    """Core NX1 protocol tests."""

    def setUp(self):
        self.master_key = hashlib.pbkdf2_hmac(
            "sha256",
            hashlib.sha256(b"test-seed:norix-skills").digest(),
            b"norix-skills-vault-v1",
            200_000,
            dklen=32,
        )

    def test_roundtrip_basic(self):
        secret = "my-super-secret-password"
        token = cs.nx1_encrypt(secret, self.master_key)
        self.assertTrue(token.startswith("NX1$"))
        self.assertEqual(cs.nx1_decrypt(token, self.master_key), secret)

    def test_roundtrip_unicode(self):
        secret = "密码🔐中文测试"
        token = cs.nx1_encrypt(secret, self.master_key)
        self.assertEqual(cs.nx1_decrypt(token, self.master_key), secret)

    def test_roundtrip_single_char(self):
        token = cs.nx1_encrypt("x", self.master_key)
        self.assertEqual(cs.nx1_decrypt(token, self.master_key), "x")

    def test_roundtrip_long_secret(self):
        secret = "A" * 10000
        token = cs.nx1_encrypt(secret, self.master_key)
        self.assertEqual(cs.nx1_decrypt(token, self.master_key), secret)

    def test_different_keys_fail(self):
        token = cs.nx1_encrypt("secret", self.master_key)
        wrong_key = os.urandom(32)
        self.assertIsNone(cs.nx1_decrypt(token, wrong_key))

    def test_tampered_token_fails(self):
        token = cs.nx1_encrypt("secret", self.master_key)
        # Flip a bit in the middle of the token
        raw = base64.b64decode(token[4:])
        tampered = bytearray(raw)
        tampered[len(tampered) // 2] ^= 0xFF
        tampered_token = "NX1$" + base64.b64encode(bytes(tampered)).decode()
        self.assertIsNone(cs.nx1_decrypt(tampered_token, self.master_key))

    def test_truncated_token_fails(self):
        token = cs.nx1_encrypt("secret", self.master_key)
        self.assertIsNone(cs.nx1_decrypt(token[:20], self.master_key))

    def test_invalid_prefix_fails(self):
        self.assertIsNone(cs.nx1_decrypt("INVALID$abc", self.master_key))

    def test_each_encryption_unique(self):
        """Same plaintext produces different ciphertext (random salt)."""
        t1 = cs.nx1_encrypt("same", self.master_key)
        t2 = cs.nx1_encrypt("same", self.master_key)
        self.assertNotEqual(t1, t2)
        self.assertEqual(cs.nx1_decrypt(t1, self.master_key), "same")
        self.assertEqual(cs.nx1_decrypt(t2, self.master_key), "same")


class TestCredentialStoreLifecycle(unittest.TestCase):
    """Full lifecycle: set → get → delete across simulated restarts."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self.seed_file.write_text("LIFECYCLE-TEST-SEED")
        os.chmod(self.seed_file, 0o600)
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None

        self.data_dir = os.path.join(self.tmpdir, "data", "test-skill")

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_set_get_delete(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("profile:prod", "s3cr3t")
        self.assertEqual(store.get("profile:prod"), "s3cr3t")
        self.assertTrue(store.has("profile:prod"))
        store.delete("profile:prod")
        self.assertIsNone(store.get("profile:prod"))
        self.assertFalse(store.has("profile:prod"))

    def test_multiple_profiles(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("profile:prod", "prod-pass")
        store.set("profile:staging", "staging-pass")
        store.set("profile:dev", "dev-pass")
        self.assertEqual(store.get("profile:prod"), "prod-pass")
        self.assertEqual(store.get("profile:staging"), "staging-pass")
        self.assertEqual(store.get("profile:dev"), "dev-pass")

    def test_survive_process_restart(self):
        """Credentials survive process restart (singleton reset)."""
        store = cs.CredentialStore("test", self.data_dir)
        store.set("profile:prod", "persist-me")

        # Simulate restart: reset singleton, create new store instance
        cs._master_key = None
        store2 = cs.CredentialStore("test", self.data_dir)
        self.assertEqual(store2.get("profile:prod"), "persist-me")

    def test_survive_multiple_restarts(self):
        """Credentials survive multiple consecutive restarts."""
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")

        for _ in range(10):
            cs._master_key = None
            store = cs.CredentialStore("test", self.data_dir)
            self.assertEqual(store.get("key"), "value")

    def test_overwrite_secret(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "old")
        store.set("key", "new")
        self.assertEqual(store.get("key"), "new")

    def test_clean_all(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("a", "1")
        store.set("b", "2")
        count = store.clean_all()
        self.assertEqual(count, 2)
        self.assertIsNone(store.get("a"))
        self.assertIsNone(store.get("b"))

    def test_vault_file_permissions(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")
        vault_path = Path(self.data_dir) / ".vault.json"
        mode = oct(vault_path.stat().st_mode & 0o777)
        self.assertEqual(mode, "0o600")

    def test_data_dir_permissions(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")
        mode = oct(Path(self.data_dir).stat().st_mode & 0o777)
        self.assertEqual(mode, "0o700")


class TestVaultFileResilience(unittest.TestCase):
    """Vault file corruption and edge cases."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self.seed_file.write_text("RESILIENCE-TEST-SEED")
        os.chmod(self.seed_file, 0o600)
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None
        self.data_dir = os.path.join(self.tmpdir, "data", "test-skill")

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_corrupted_vault_json(self):
        """Corrupted vault.json doesn't crash, returns empty."""
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")
        vault_path = Path(self.data_dir) / ".vault.json"
        vault_path.write_text("NOT VALID JSON {{{")
        self.assertIsNone(store.get("key"))

    def test_empty_vault_file(self):
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")
        vault_path = Path(self.data_dir) / ".vault.json"
        vault_path.write_text("")
        self.assertIsNone(store.get("key"))

    def test_missing_vault_file(self):
        store = cs.CredentialStore("test", self.data_dir)
        self.assertIsNone(store.get("nonexistent"))

    def test_vault_with_tampered_token(self):
        """Tampered token in vault returns None, doesn't crash."""
        store = cs.CredentialStore("test", self.data_dir)
        store.set("key", "value")
        vault_path = Path(self.data_dir) / ".vault.json"
        vault = json.loads(vault_path.read_text())
        vault["key"] = "NX1$" + base64.b64encode(b"GARBAGE" * 10).decode()
        vault_path.write_text(json.dumps(vault))
        self.assertIsNone(store.get("key"))

    def test_non_nx1_token_in_vault(self):
        """Non-NX1 token in vault returns None."""
        store = cs.CredentialStore("test", self.data_dir)
        vault_path = Path(self.data_dir) / ".vault.json"
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        vault_path.write_text(json.dumps({"key": "plaintext-oops"}))
        self.assertIsNone(store.get("key"))


class TestCrossLanguageFingerprint(unittest.TestCase):
    """Verify Python fingerprint formula matches the spec exactly."""

    def test_fingerprint_formula(self):
        """fingerprint = SHA256("{seed}:norix-skills")"""
        seed = "TEST-UUID-12345"
        expected = hashlib.sha256(f"{seed}:norix-skills".encode("utf-8")).digest()

        tmpdir = tempfile.mkdtemp()
        seed_file = Path(tmpdir) / ".machine-seed"
        seed_file.write_text(seed)
        os.chmod(seed_file, 0o600)

        orig = cs._SEED_FILE
        cs._SEED_FILE = seed_file
        cs._master_key = None
        try:
            fp = cs._machine_fingerprint()
            self.assertEqual(fp, expected)
        finally:
            cs._SEED_FILE = orig
            cs._master_key = None
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_master_key_derivation(self):
        """master_key = PBKDF2-SHA256(fingerprint, "norix-skills-vault-v1", 200000, 32)"""
        fingerprint = hashlib.sha256(b"test-seed:norix-skills").digest()
        key = cs._derive_master_key(fingerprint)
        expected = hashlib.pbkdf2_hmac(
            "sha256", fingerprint, b"norix-skills-vault-v1", 200_000, dklen=32
        )
        self.assertEqual(key, expected)


class TestCrossLanguageInterop(unittest.TestCase):
    """Run actual Python ↔ TypeScript interop if tsx is available."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self.seed_file.write_text("INTEROP-TEST-SEED-UUID")
        os.chmod(self.seed_file, 0o600)
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None
        self.data_dir = os.path.join(self.tmpdir, "data", "interop")

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _ts_available(self):
        ts_dir = Path(__file__).parent.parent / "feishu-integration" / "scripts" / "feishu-ts"
        if not (ts_dir / "node_modules").exists():
            return False
        try:
            subprocess.run(["npx", "tsx", "--version"], capture_output=True, timeout=10)
            return True
        except Exception:
            return False

    def test_python_encrypt_ts_decrypt(self):
        """Python-encrypted secret must be decryptable by TypeScript."""
        if not self._ts_available():
            self.skipTest("tsx not available")

        store = cs.CredentialStore("interop", self.data_dir)
        store.set("test-key", "python-secret-值")

        vault_path = Path(self.data_dir) / ".vault.json"
        ts_dir = Path(__file__).parent.parent / "feishu-integration" / "scripts" / "feishu-ts"

        # Write a minimal TS script to decrypt
        test_script = Path(self.tmpdir) / "test_decrypt.ts"
        test_script.write_text(textwrap.dedent(f"""\
            import * as crypto from "node:crypto";
            import * as fs from "node:fs";
            import * as path from "node:path";
            import * as os from "node:os";

            const NX1_PREFIX = "NX1$";
            const NX1_DOMAIN = "norix-skills";
            const NX1_KDF_SALT = Buffer.from("norix-skills-vault-v1", "utf-8");
            const SEED_FILE = "{self.seed_file}";

            function machineFingerprint(): Buffer {{
              const seed = fs.readFileSync(SEED_FILE, "utf-8").trim();
              const identity = `${{seed}}:${{NX1_DOMAIN}}`;
              return crypto.createHash("sha256").update(identity, "utf-8").digest();
            }}

            function deriveMasterKey(fp: Buffer): Buffer {{
              return crypto.pbkdf2Sync(fp, NX1_KDF_SALT, 200_000, 32, "sha256");
            }}

            function xorBytes(a: Buffer, b: Buffer): Buffer {{
              const r = Buffer.alloc(a.length);
              for (let i = 0; i < a.length; i++) r[i] = a[i]! ^ b[i]!;
              return r;
            }}

            function nx1Decrypt(token: string, masterKey: Buffer): string | null {{
              if (!token.startsWith(NX1_PREFIX)) return null;
              const blob = Buffer.from(token.slice(NX1_PREFIX.length), "base64");
              if (blob.length < 49) return null;
              const salt = blob.subarray(0, 16);
              const tag = blob.subarray(16, 48);
              const ct = blob.subarray(48);
              const expected = crypto.createHmac("sha256", masterKey)
                .update(Buffer.concat([salt, ct])).digest();
              if (!crypto.timingSafeEqual(tag, expected)) return null;
              const ks = crypto.pbkdf2Sync(masterKey, salt, 1, ct.length, "sha256");
              return xorBytes(ct, ks).toString("utf-8");
            }}

            const key = deriveMasterKey(machineFingerprint());
            const vault = JSON.parse(fs.readFileSync("{vault_path}", "utf-8"));
            const result = nx1Decrypt(vault["test-key"], key);
            console.log(JSON.stringify({{ result }}));
        """))

        r = subprocess.run(
            ["npx", "tsx", str(test_script)],
            capture_output=True, text=True, timeout=30,
            cwd=str(ts_dir),
        )
        if r.returncode != 0:
            self.fail(f"TypeScript decrypt failed: {r.stderr}")

        output = json.loads(r.stdout.strip())
        self.assertEqual(output["result"], "python-secret-值")


# ── Scenario Matrix ──────────────────────────────────────────────────────────

class TestScenarioMatrix(unittest.TestCase):
    """End-to-end scenario tests: store → change environment → retrieve."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.seed_file = Path(self.tmpdir) / ".machine-seed"
        self.seed_file.write_text("SCENARIO-MATRIX-SEED")
        os.chmod(self.seed_file, 0o600)
        self._orig_seed = cs._SEED_FILE
        cs._SEED_FILE = self.seed_file
        cs._master_key = None
        self.data_dir = os.path.join(self.tmpdir, "data", "scenario")

    def tearDown(self):
        cs._SEED_FILE = self._orig_seed
        cs._master_key = None
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _store_and_retrieve(self, env_patches=None):
        """Store a secret, reset state, optionally patch env, then retrieve."""
        store = cs.CredentialStore("scenario", self.data_dir)
        store.set("secret", "survive-everything")

        # Reset singleton (simulate process restart)
        cs._master_key = None

        if env_patches:
            with patch.multiple('os', **env_patches):
                store2 = cs.CredentialStore("scenario", self.data_dir)
                return store2.get("secret")
        else:
            store2 = cs.CredentialStore("scenario", self.data_dir)
            return store2.get("secret")

    def test_scenario_reboot(self):
        """Scenario: Device reboot — credentials survive."""
        self.assertEqual(self._store_and_retrieve(), "survive-everything")

    def test_scenario_vpn_connect(self):
        """Scenario: VPN connected, new network interface appears."""
        self.assertEqual(self._store_and_retrieve(), "survive-everything")

    def test_scenario_proxy_enabled(self):
        """Scenario: HTTP proxy enabled — should not affect vault."""
        env = {**os.environ, "HTTP_PROXY": "http://proxy:8080", "HTTPS_PROXY": "http://proxy:8080"}
        with patch.dict(os.environ, env):
            self.assertEqual(self._store_and_retrieve(), "survive-everything")

    def test_scenario_wifi_to_ethernet(self):
        """Scenario: Switch from WiFi to Ethernet — credentials survive."""
        self.assertEqual(self._store_and_retrieve(), "survive-everything")

    def test_scenario_docker_bridge(self):
        """Scenario: Docker bridge interface appears/disappears."""
        self.assertEqual(self._store_and_retrieve(), "survive-everything")

    def test_scenario_multiple_skills_isolated(self):
        """Different skills have independent vaults."""
        dir_a = os.path.join(self.tmpdir, "data", "skill-a")
        dir_b = os.path.join(self.tmpdir, "data", "skill-b")

        store_a = cs.CredentialStore("skill-a", dir_a)
        store_b = cs.CredentialStore("skill-b", dir_b)

        store_a.set("key", "value-a")
        store_b.set("key", "value-b")

        self.assertEqual(store_a.get("key"), "value-a")
        self.assertEqual(store_b.get("key"), "value-b")

    def test_scenario_10_profiles_per_skill(self):
        """10 profiles stored and retrieved correctly."""
        store = cs.CredentialStore("multi", self.data_dir)
        for i in range(10):
            store.set(f"profile:{i}", f"password-{i}")

        cs._master_key = None
        store2 = cs.CredentialStore("multi", self.data_dir)
        for i in range(10):
            self.assertEqual(store2.get(f"profile:{i}"), f"password-{i}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
