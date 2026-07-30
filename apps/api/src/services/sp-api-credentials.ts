import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export interface SpApiCredentials {
  lwaClientId: string;
  lwaClientSecret: string;
  lwaRefreshToken: string;
}

export interface EncryptedSpApiCredentials {
  keyVersion: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSpApiCredentials(
  credentials: SpApiCredentials,
  context: { orgId: number; dataSourceId: number }
): EncryptedSpApiCredentials {
  const key = loadCredentialsKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(contextBuffer(context));
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    keyVersion: process.env.DATA_SOURCE_CREDENTIALS_KEY_VERSION?.trim() || "v1",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptSpApiCredentials(
  encrypted: EncryptedSpApiCredentials,
  context: { orgId: number; dataSourceId: number }
): SpApiCredentials {
  const decipher = createDecipheriv(ALGORITHM, loadCredentialsKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAAD(contextBuffer(context));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<SpApiCredentials>;
  if (!parsed.lwaClientId || !parsed.lwaClientSecret || !parsed.lwaRefreshToken) {
    throw new Error("Stored SP-API credentials are invalid");
  }
  return {
    lwaClientId: parsed.lwaClientId,
    lwaClientSecret: parsed.lwaClientSecret,
    lwaRefreshToken: parsed.lwaRefreshToken
  };
}

function loadCredentialsKey(): Buffer {
  const encoded = process.env.DATA_SOURCE_CREDENTIALS_KEY?.trim();
  if (!encoded) {
    throw Object.assign(new Error("DATA_SOURCE_CREDENTIALS_KEY is required to save SP-API credentials"), { statusCode: 503 });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw Object.assign(new Error("DATA_SOURCE_CREDENTIALS_KEY must be base64-encoded"), { statusCode: 503 });
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw Object.assign(new Error("DATA_SOURCE_CREDENTIALS_KEY must decode to 32 bytes"), { statusCode: 503 });
  }
  return key;
}

function contextBuffer(context: { orgId: number; dataSourceId: number }): Buffer {
  return Buffer.from(`sp-api-credentials:v1:${context.orgId}:${context.dataSourceId}`, "utf8");
}
