import type { Organization, Session, User, UserRole } from "@amazon-monitor/shared";
import type { DatabaseSync } from "node:sqlite";
import { nowIso, withTransaction } from "./sql-utils.js";

export interface UserRow {
  id: number;
  org_id: number;
  username: string;
  password_hash: string;
  password_algo: string;
  role: string;
  display_name: string | null;
  email: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: number;
  name: string;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  token_hash: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    orgId: row.org_id,
    username: row.username,
    role: row.role as UserRole,
    displayName: row.display_name,
    email: row.email,
    status: row.status as User["status"],
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    status: row.status as Organization["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    ip: row.ip,
    userAgent: row.user_agent,
    revokedAt: row.revoked_at,
    createdAt: row.created_at
  };
}

export function insertOrganization(
  db: DatabaseSync,
  input: { name: string; plan?: string }
): OrganizationRow {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO organizations (name, plan, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .run(input.name.trim(), input.plan ?? "standard", now, now);
  return db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as unknown as OrganizationRow;
}

export function insertUser(
  db: DatabaseSync,
  input: {
    orgId: number;
    username: string;
    passwordHash: string;
    passwordAlgo: string;
    role: UserRole;
    displayName?: string | null;
    email?: string | null;
  }
): UserRow {
  const now = nowIso();
  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO users
       (org_id, username, password_hash, password_algo, role, display_name, email, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(
      input.orgId,
      input.username.trim(),
      input.passwordHash,
      input.passwordAlgo,
      input.role,
      input.displayName ?? null,
      input.email ?? null,
      now,
      now
    );
  });
  return db.prepare("SELECT * FROM users WHERE org_id = ? AND username = ?").get(
    input.orgId,
    input.username.trim()
  ) as unknown as UserRow;
}
