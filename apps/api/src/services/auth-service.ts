import type { Organization, SessionContext, User, UserRole } from "@amazon-monitor/shared";
import { DEFAULT_SESSION_TTL_HOURS, USER_ROLES } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

export interface LoginResult {
  context: SessionContext;
  token: string;
  expiresAt: string;
}

export function buildSessionContext(user: User, organization: Organization): SessionContext {
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_HOURS * 3_600_000).toISOString();
  return { user, organization, expiresAt };
}

export interface AuthServiceOptions {
  ttlHours?: number;
  ip?: string | null;
  userAgent?: string | null;
}

/** Creates an opaque session for the HttpOnly response cookie and returns its public context. */
export function login(store: Store, username: string, password: string, options: AuthServiceOptions = {}): LoginResult | null {
  const user = store.verifyUserCredentials(username, password);
  if (!user) return null;
  const org = store.getOrganization(user.orgId);
  if (!org) return null;
  const ttl = options.ttlHours ?? DEFAULT_SESSION_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttl * 3_600_000).toISOString();
  const { token, session } = store.createSession({
    userId: user.id,
    expiresAt,
    ip: options.ip ?? null,
    userAgent: options.userAgent ?? null
  });
  store.recordUserLogin(user.id);
  return {
    context: { user, organization: org, expiresAt: session.expiresAt },
    token,
    expiresAt: session.expiresAt
  };
}

export function resolveContext(store: Store, token: string): SessionContext | null {
  const session = store.findSessionByToken(token);
  if (!session) return null;
  const user = store.listUsers().find((u) => u.id === session.userId);
  if (!user) return null;
  const org = store.getOrganization(user.orgId);
  if (!org) return null;
  return { user, organization: org, expiresAt: session.expiresAt };
}

export function logout(store: Store, token: string): boolean {
  const session = store.findSessionByToken(token);
  if (!session) return false;
  store.revokeSession(session.id);
  return true;
}

export const ROLE_VALUES: readonly UserRole[] = USER_ROLES;

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}
