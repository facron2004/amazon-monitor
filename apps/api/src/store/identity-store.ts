import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword, PASSWORD_ALGO, verifyPassword } from "./password.js";
import { nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";
import {
  insertOrganization,
  insertUser,
  mapOrganization,
  mapSession,
  mapUser,
  type OrganizationRow,
  type SessionRow,
  type UserRow
} from "./identity-mappers.js";

type IdentityStoreMethods = Pick<
  Store,
  | "createOrganization"
  | "listOrganizations"
  | "getOrganization"
  | "createUser"
  | "replaceBootstrapAdmin"
  | "listUsers"
  | "getUserByUsername"
  | "verifyUserCredentials"
  | "recordUserLogin"
  | "createSession"
  | "findSessionByToken"
  | "revokeSession"
  | "purgeExpiredSessions"
>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken(): { token: string; id: string; tokenHash: string } {
  const id = randomBytes(16).toString("hex");
  const tokenSecret = randomBytes(32).toString("base64url");
  const token = `${id}.${tokenSecret}`;
  return { id, token, tokenHash: hashToken(token) };
}

export function createIdentityStore(db: DatabaseSync): IdentityStoreMethods {
  return {
    createOrganization(input) {
      const row = insertOrganization(db, { name: input.name, plan: input.plan });
      return mapOrganization(row);
    },

    listOrganizations() {
      const rows = db.prepare("SELECT * FROM organizations ORDER BY id ASC").all() as unknown as OrganizationRow[];
      return rows.map(mapOrganization);
    },

    getOrganization(id) {
      const row = db.prepare("SELECT * FROM organizations WHERE id = ?").get(id) as unknown as OrganizationRow | undefined;
      return row ? mapOrganization(row) : null;
    },

    createUser(input) {
      const algo = input.passwordAlgo ?? PASSWORD_ALGO;
      const { hash } = algo === PASSWORD_ALGO
        ? hashPassword(input.password)
        : { hash: input.password };
      const row = insertUser(db, {
        orgId: input.orgId,
        username: input.username,
        passwordHash: hash,
        passwordAlgo: algo,
        role: input.role,
        displayName: input.displayName ?? null,
        email: input.email ?? null
      });
      return mapUser(row);
    },

    replaceBootstrapAdmin(input) {
      const { hash } = hashPassword(input.password);
      const now = nowIso();
      db.prepare(
        `UPDATE users
         SET username = ?, password_hash = ?, password_algo = ?, role = 'admin',
             display_name = ?, email = ?, status = 'active', updated_at = ?
         WHERE id = ?`
      ).run(
        input.username.trim(),
        hash,
        PASSWORD_ALGO,
        input.displayName ?? "Administrator",
        input.email ?? null,
        now,
        input.userId
      );
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as unknown as UserRow | undefined;
      if (!row) {
        throw new Error(`Bootstrap admin not found: ${input.userId}`);
      }
      return mapUser(row);
    },

    listUsers() {
      const rows = db.prepare("SELECT * FROM users ORDER BY id ASC").all() as unknown as UserRow[];
      return rows.map(mapUser);
    },

    getUserByUsername(username) {
      const row = db
        .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1")
        .get(username) as unknown as UserRow | undefined;
      return row ? mapUser(row) : null;
    },

    verifyUserCredentials(username, password) {
      const row = db
        .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1")
        .get(username) as unknown as UserRow | undefined;
      if (!row) return null;
      if (row.status !== "active") return null;
      const ok = row.password_algo === PASSWORD_ALGO
        ? verifyPassword(password, row.password_hash, row.password_algo)
        : false;
      if (!ok) return null;
      return mapUser(row);
    },

    recordUserLogin(userId) {
      db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .run(nowIso(), nowIso(), userId);
    },

    createSession(input) {
      const { id, token, tokenHash } = generateOpaqueToken();
      const now = nowIso();
      db.prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.userId,
        tokenHash,
        input.expiresAt,
        input.ip ?? null,
        input.userAgent ?? null,
        now
      );
      return { token, session: { id, userId: input.userId, expiresAt: input.expiresAt, ip: input.ip ?? null, userAgent: input.userAgent ?? null, revokedAt: null, createdAt: now } };
    },

    findSessionByToken(token) {
      const tokenHash = hashToken(token);
      const row = db
        .prepare("SELECT * FROM sessions WHERE token_hash = ? LIMIT 1")
        .get(tokenHash) as SessionRow | undefined;
      if (!row) return null;
      if (row.revoked_at) return null;
      if (Date.parse(row.expires_at) < Date.now()) return null;
      return mapSession(row);
    },

    revokeSession(sessionId) {
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
        .run(nowIso(), sessionId);
    },

    purgeExpiredSessions() {
      const result = db
        .prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL")
        .run(nowIso());
      return Number(result.changes ?? 0);
    }
  };
}

// Re-export helpers for tests
export { hashToken };
