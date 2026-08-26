import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 1000;

export function resolveIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || randomUUID();
}

export function requireCreated<T>(value: T | undefined, entity: string): T {
  if (value === undefined) {
    throw new Error(`Failed to read created ${entity}`);
  }
  return value;
}

type OrganizationReferenceTable =
  | "agent_os_goals"
  | "agent_os_workflow_runs"
  | "agent_os_action_proposals";

export function assertOrganizationReference(
  db: DatabaseSync,
  table: OrganizationReferenceTable,
  id: number | null | undefined,
  organizationId: number,
  field: string,
): void {
  if (id === undefined || id === null) return;
  const row = db.prepare(
    `SELECT organization_id FROM ${table} WHERE id = ?`,
  ).get(id) as { organization_id?: number } | undefined;
  if (!row || row.organization_id !== organizationId) {
    throw Object.assign(new Error(`${field} must belong to the current organization`), { statusCode: 400 });
  }
}
