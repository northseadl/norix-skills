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
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { networkInterfaces } from "node:os";

const NX1_PREFIX = "NX1$";
const NX1_DOMAIN = "norix-skills";
const NX1_KDF_SALT = Buffer.from("norix-skills-vault-v1", "utf-8");
const NX1_KDF_ITERATIONS = 200_000;
const NX1_KEY_LEN = 32;
const NX1_SALT_LEN = 16;
const NX1_TAG_LEN = 32;

function getMacAddress(): string {
  // CRITICAL: Must match Python's uuid.getnode() output for vault compatibility.
  // uuid.getnode() uses platform-specific methods that may return different MACs
  // than Node.js os.networkInterfaces(). We try Python first for compatibility.
  try {
    const { execSync } = require("node:child_process");
    const result = execSync(
      'python3 -c "import uuid; print(format(uuid.getnode(), \'012x\'))"',
      { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (result && /^[0-9a-f]{12}$/.test(result)) {
      return result;
    }
  } catch {
    // Python not available, fall through
  }

  // Fallback: try Node.js networkInterfaces (may differ from Python)
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        return iface.mac.replace(/:/g, "");
      }
    }
  }
  // Last resort: hostname hash
  return crypto
    .createHash("md5")
    .update(os.hostname())
    .digest("hex")
    .slice(0, 12);
}

function machineFingerprint(): Buffer {
  const hostname = os.hostname();
  const mac = getMacAddress();
  const username = os.userInfo().username;
  const identity = `${hostname}:${mac}:${username}:${NX1_DOMAIN}`;
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
