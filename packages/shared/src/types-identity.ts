/**
 * Identity types (Stage 0)
 *
 * Multi-tenant roles follow the PRD permission matrix. `developer` remains as
 * a read-only compatibility role for existing accounts.
 */

export const USER_ROLES = [
  "admin",
  "manager",
  "operator",
  "ads_operator",
  "product_researcher",
  "viewer",
  "developer"
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const businessCapabilities = [
  "manage_users",
  "manage_workflow",
  "assign_tasks",
  "manage_competitors",
  "view_ads",
  "view_ads_details",
  "manage_ads",
  "view_profit",
  "view_profit_details",
  "manage_profit",
  "manage_collection",
  "manage_rules",
  "manage_data_sources",
  "manage_reports"
] as const;

export type BusinessCapability = (typeof businessCapabilities)[number];

const roleCapabilities: Record<UserRole, readonly BusinessCapability[]> = {
  admin: businessCapabilities,
  manager: ["manage_workflow", "assign_tasks", "manage_competitors", "view_ads", "view_ads_details", "manage_ads", "view_profit", "view_profit_details", "manage_profit", "manage_collection", "manage_rules", "manage_reports"],
  operator: ["manage_workflow", "manage_competitors", "view_ads", "view_profit", "manage_collection", "manage_reports"],
  ads_operator: ["manage_workflow", "view_ads", "view_ads_details", "manage_ads", "manage_reports"],
  product_researcher: ["manage_workflow", "manage_competitors", "view_profit", "manage_reports"],
  viewer: [],
  developer: []
};

export function hasBusinessCapability(role: UserRole, capability: BusinessCapability): boolean {
  return roleCapabilities[role].includes(capability);
}

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
