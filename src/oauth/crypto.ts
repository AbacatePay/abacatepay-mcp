import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Load the 32-byte AES key used for at-rest encryption.
 *
 * Resolution order:
 *   1. OAUTH_ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
 *   2. Key file beside the DB (e.g. oauth.db → oauth.key)
 *   3. Auto-generate, persist to the key file, warn operator
 */
export function loadEncryptionKey(dbPath: string): Buffer {
  const fromEnv = process.env.OAUTH_ENCRYPTION_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv.trim(), "hex");
    if (key.length !== 32) {
      throw new Error(
        "OAUTH_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
      );
    }
    return key;
  }

  const keyPath = dbPath.replace(/\.db$/i, "") + ".key";

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- keyPath derived from OAUTH_DB_PATH/OAUTH_ENCRYPTION_KEY operator config, not user input
  if (existsSync(keyPath)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see above
    const raw = readFileSync(keyPath, "utf8").trim();
    const key = Buffer.from(raw, "hex");
    if (key.length !== 32) {
      throw new Error(`Encryption key file ${keyPath} does not contain a valid 32-byte hex key.`);
    }
    return key;
  }

  const key = randomBytes(32);
  const dir = dirname(keyPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir derived from OAUTH_DB_PATH/OAUTH_ENCRYPTION_KEY operator config, not user input
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- see above
  writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });

  console.error(`🔑 OAuth encryption key auto-generated → ${keyPath}`);
  console.error("   Back this file up, or set OAUTH_ENCRYPTION_KEY in production.");
  console.error(`   To export: export OAUTH_ENCRYPTION_KEY=$(cat ${keyPath})`);

  return key;
}

/** Encrypt plaintext with AES-256-GCM. Returns base64: IV(12) + TAG(16) + CIPHERTEXT. */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64");
}

/** Decrypt a value produced by `encrypt`. Throws if tampered or wrong key. */
export function decrypt(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
