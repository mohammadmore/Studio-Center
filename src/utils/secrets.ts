import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config.js";

/**
 * Encryption at rest for third-party credentials (SMS key, mail password, bot and
 * social tokens), so a copied database or backup does not hand them out.
 *
 * The key comes from SECRETS_KEY when set (keep it in the host's environment, away
 * from the data folder); otherwise one is generated once into DATA_DIR/.secrets.key.
 * Values are stored as "enc:v1:<base64url(iv | tag | ciphertext)>" with AES-256-GCM.
 */
const PREFIX = "enc:v1:";
const KEY_FILE = ".secrets.key";
let key: Buffer | null = null;
let warned = false;

function loadKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.SECRETS_KEY || "";
  if (fromEnv.length >= 32) {
    key = crypto.createHash("sha256").update(fromEnv).digest();
    return key;
  }
  const file = path.join(config.dataDir, KEY_FILE);
  try {
    const stored = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(stored)) key = Buffer.from(stored, "hex");
  } catch {
    /* no key yet */
  }
  if (!key) {
    const fresh = crypto.randomBytes(32);
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(file, fresh.toString("hex"), { mode: 0o600, flag: "wx" });
      key = fresh;
    } catch {
      // Another process created it first, or the folder is read-only.
      try {
        const stored = fs.readFileSync(file, "utf8").trim();
        if (/^[0-9a-f]{64}$/i.test(stored)) key = Buffer.from(stored, "hex");
      } catch {
        /* fall through */
      }
      if (!key) {
        console.warn("WARNING: could not store a secrets key; set SECRETS_KEY. Falling back to SESSION_SECRET.");
        key = crypto.createHash("sha256").update("secrets:" + config.sessionSecret).digest();
      }
    }
  }
  return key;
}

export function isEncrypted(value: unknown) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(value: unknown): string {
  const plain = value == null ? "" : String(value);
  if (!plain || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", loadKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The plain value; an unreadable value (wrong key) reads as empty so the admin can enter it again. */
export function decryptSecret(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (!isEncrypted(s)) return s;
  try {
    const raw = Buffer.from(s.slice(PREFIX.length), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", loadKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    if (!warned) {
      warned = true;
      console.warn("WARNING: a stored credential could not be decrypted (SECRETS_KEY or .secrets.key changed). Enter it again in the integrations or tokens page.");
    }
    return "";
  }
}

/** Test hook: forget the cached key. */
export function resetSecretsKeyForTests() {
  key = null;
}
