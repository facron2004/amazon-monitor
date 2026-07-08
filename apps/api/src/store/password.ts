import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing using Node's built-in scrypt (no external deps).
 *
 * Format: `scrypt$N$r$p$saltB64$hashB64`
 * - N=16384, r=8, p=1 (Node default; 64MB memory ceiling so we keep p small)
 * - Salt: 16 bytes
 * - Hash: 64 bytes
 *
 * The `password_algo` column stores the algorithm name so we can rotate
 * later (e.g. migrate to argon2) without breaking existing hashes.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LEN = 16;
const HASH_LEN = 64;
const ALGO = "scrypt";

export interface PasswordHashComponents {
  algo: string;
  hash: string;
}

export function hashPassword(plain: string): PasswordHashComponents {
  const salt = randomBytes(SALT_LEN);
  const derived = scryptSync(plain.normalize("NFKC"), salt, HASH_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return {
    algo: ALGO,
    hash: `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`
  };
}

export function verifyPassword(plain: string, stored: string, algo: string): boolean {
  if (algo !== ALGO) return false;
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, nStr, rStr, pStr, saltB64, hashB64] = parts;
  if (prefix !== "scrypt") return false;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  let derived: Buffer;
  try {
    derived = scryptSync(plain.normalize("NFKC"), salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export const PASSWORD_ALGO = ALGO;
