/**
 * Identity types (Stage 0)
 *
 * Multi-tenant user accounts with three roles:
 * - admin: full access, can manage users/organizations
 * - operator: operations role (default for current operator workflows)
 * - developer: product research / selection role (Stage 3-4 surface)
 *
 * Stage 0 only needs the bare models; rich permission matrices are wired in
 * Stage 5 (PermissionGate + role middleware).
 */

export type UserRole = "admin" | "operator" | "developer";

export const USER_ROLES: readonly UserRole[] = ["admin", "operator", "developer"] as const;

export interface Organization {
  id: number;
  name: string;
  plan: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  orgId: number;
  username: string;
  role: UserRole;
  displayName: string | null;
  email: string | null;
  status: "active" | "disabled";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: number;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Public view of the current user, embedded in /api/auth/me responses and
 * available to the frontend session store. Includes organization context.
 */
export interface SessionContext {
  user: User;
  organization: Organization;
  expiresAt: string;
}

export const DEFAULT_SESSION_TTL_HOURS = 24 * 14; // 14 days
