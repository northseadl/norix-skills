/**
 * NX1 Credential Store — Machine-fingerprint encrypted secret storage.
 *
 * Cross-language compatible with Python NX1 implementation.
 * Protocol NX1 (Norix Vault v1):
 *   - Key: PBKDF2-SHA256(SHA256(machine_fingerprint), salt, 200k iterations)
 *   - Cipher: PBKDF2-SHA256 keystream XOR (stream cipher)
 *   - Auth: HMAC-SHA256 over salt + ciphertext
 *   - Format: NX1$<base64(salt[16] || tag[32] || ciphertext[N])>
 */

import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const NX1_PREFIX = "NX1$";
const NX1_DOMAIN = "norix-skills";
const NX1_KDF_SALT = Buffer.from("norix-skills-vault-v1", "utf-8");
const NX1_KDF_ITERATIONS = 200_000;
const NX1_KEY_LEN = 32;
const NX1_SALT_LEN = 16;
const NX1_TAG_LEN = 32;

const SEED_FILE = path.join(os.homedir(), ".agents", ".machine-seed");

/**
 * Read hardware-bound unique ID from the OS (matches Python _platform_hwid).
 * - macOS:   IOPlatformUUID (burned into Apple Silicon / T2 chip)
 * - Linux:   /etc/machine-id
 * - Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 */
function platformHwid(): string {
  const system = os.platform();

  if (system === "darwin") {
    const stdout = execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const m = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (m) return m[1]!;
  } else if (system === "linux") {
    for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      if (fs.existsSync(p)) {
        const mid = fs.readFileSync(p, "utf-8").trim();
        if (mid) return mid;
      }
    }
  } else if (system === "win32") {
    const stdout = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: "utf-8", timeout: 5000 }
    );
    const m = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
    if (m) return m[1]!;
  }

  throw new Error(
    `Cannot obtain hardware ID on ${system}. ` +
      `Create ${SEED_FILE} manually with a stable unique string.`
  );
}

/**
 * Derive a stable machine fingerprint — exact same logic as Python.
 *
 * Source of truth: ~/.agents/.machine-seed (immutable once written).
 * On first run, initialized from platform hardware UUID and persisted.
 *
 * Cross-language spec:
 *   fingerprint = SHA256("{seed}:norix-skills")
 */
function machineFingerprint(): Buffer {
  let seed: string;

  if (fs.existsSync(SEED_FILE)) {
    seed = fs.readFileSync(SEED_FILE, "utf-8").trim();
  } else {
    seed = platformHwid();
    const dir = path.dirname(SEED_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = SEED_FILE + ".tmp";
    fs.writeFileSync(tmp, seed, { mode: 0o600 });
    fs.renameSync(tmp, SEED_FILE);
  }

  const identity = `${seed}:${NX1_DOMAIN}`;
  return crypto.createHash("sha256").update(identity, "utf-8").digest();
}

function deriveMasterKey(fingerprint: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    fingerprint,
    NX1_KDF_SALT,
    NX1_KDF_ITERATIONS,
    NX1_KEY_LEN,
    "sha256"
  );
}

function xorBytes(a: Buffer, b: Buffer): Buffer {
  const result = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! ^ b[i]!;
  }
  return result;
}

function nx1Encrypt(plaintext: string, masterKey: Buffer): string {
  const plaintextBytes = Buffer.from(plaintext, "utf-8");
  const salt = crypto.randomBytes(NX1_SALT_LEN);

  const keystream = crypto.pbkdf2Sync(
    masterKey,
    salt,
    1,
    plaintextBytes.length,
    "sha256"
  );
  const ciphertext = xorBytes(plaintextBytes, keystream);

  const tag = crypto
    .createHmac("sha256", masterKey)
    .update(Buffer.concat([salt, ciphertext]))
    .digest();

  const blob = Buffer.concat([salt, tag, ciphertext]);
  return NX1_PREFIX + blob.toString("base64");
}

function nx1Decrypt(token: string, masterKey: Buffer): string | null {
  if (!token.startsWith(NX1_PREFIX)) return null;

  let blob: Buffer;
  try {
    blob = Buffer.from(token.slice(NX1_PREFIX.length), "base64");
  } catch {
    return null;
  }

  if (blob.length < NX1_SALT_LEN + NX1_TAG_LEN + 1) return null;

  const salt = blob.subarray(0, NX1_SALT_LEN);
  const tag = blob.subarray(NX1_SALT_LEN, NX1_SALT_LEN + NX1_TAG_LEN);
  const ciphertext = blob.subarray(NX1_SALT_LEN + NX1_TAG_LEN);

  const expectedTag = crypto
    .createHmac("sha256", masterKey)
    .update(Buffer.concat([salt, ciphertext]))
    .digest();

  if (!crypto.timingSafeEqual(tag, expectedTag)) return null;

  const keystream = crypto.pbkdf2Sync(
    masterKey,
    salt,
    1,
    ciphertext.length,
    "sha256"
  );
  const plaintextBytes = xorBytes(ciphertext, keystream);

  try {
    return plaintextBytes.toString("utf-8");
  } catch {
    return null;
  }
}

// Singleton master key
let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (!_masterKey) {
    _masterKey = deriveMasterKey(machineFingerprint());
  }
  return _masterKey;
}

export class CredentialStore {
  private vaultFile: string;
  private key: Buffer;
  private dataDir: string;

  constructor(
    public readonly namespace: string,
    dataDir: string
  ) {
    this.dataDir = dataDir;
    this.vaultFile = path.join(dataDir, ".vault.json");
    this.key = getMasterKey();
  }

  get(account: string): string | null {
    const vault = this.loadVault();
    const token = vault[account];
    if (!token) return null;
    return nx1Decrypt(token, this.key);
  }

  set(account: string, secret: string): void {
    const vault = this.loadVault();
    vault[account] = nx1Encrypt(secret, this.key);
    this.saveVault(vault);
  }

  delete(account: string): boolean {
    const vault = this.loadVault();
    if (account in vault) {
      delete vault[account];
      this.saveVault(vault);
      return true;
    }
    return false;
  }

  has(account: string): boolean {
    const vault = this.loadVault();
    return account in vault;
  }

  private loadVault(): Record<string, string> {
    if (fs.existsSync(this.vaultFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.vaultFile, "utf-8"));
      } catch {
        return {};
      }
    }
    return {};
  }

  private saveVault(vault: Record<string, string>): void {
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      this.vaultFile,
      JSON.stringify(vault, null, 2),
      { mode: 0o600 }
    );
  }
}
