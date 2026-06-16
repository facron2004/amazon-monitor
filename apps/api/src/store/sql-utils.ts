import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export type WhereBuilder = { clause: string; param?: SQLInputValue };

export function withTransaction(db: DatabaseSync, work: () => void): void {
  db.exec("SAVEPOINT _sp");
  try {
    work();
    db.exec("RELEASE _sp");
  } catch (error) {
    db.exec("ROLLBACK TO _sp");
    db.exec("RELEASE _sp");
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildWhere(...conditions: Array<WhereBuilder | WhereBuilder[] | null | undefined>): { sql: string; params: SQLInputValue[] } {
  const flat: WhereBuilder[] = [];
  for (const cond of conditions) {
    if (!cond) continue;
    if (Array.isArray(cond)) {
      for (const item of cond) {
        if (item) flat.push(item);
      }
    } else {
      flat.push(cond);
    }
  }
  const sql = flat.length ? `WHERE ${flat.map((c) => c.clause).join(" AND ")}` : "";
  const params: SQLInputValue[] = [];
  for (const c of flat) {
    if (c.param !== undefined) {
      params.push(c.param);
    }
  }
  return { sql, params };
}

export function whereEq(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} = ?`, param: value as SQLInputValue };
}

export function whereLte(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} <= ?`, param: value as SQLInputValue };
}

export function whereGte(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} >= ?`, param: value as SQLInputValue };
}

export function buildCalendarFilterClauses(
  asin: string,
  marketplace?: string,
  toDate?: string,
  fromDate?: string
): { sql: string; params: SQLInputValue[] } {
  return buildWhere(whereEq("asin", asin), whereEq("marketplace", marketplace), whereLte("snapshot_date", toDate), whereGte("snapshot_date", fromDate));
}

export function clampLimit(limit: number | undefined | null, max = 1000): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(Math.floor(Number(limit)), max);
}

export function clampOffset(offset: number | undefined | null): number {
  if (offset == null || offset < 0) return 0;
  return Math.floor(Number(offset));
}
