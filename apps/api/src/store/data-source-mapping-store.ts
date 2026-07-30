import type { DatabaseSync } from "node:sqlite";
import type {
  DataSourceMappingIssue,
  DataSourceMappingIssueListFilter,
  DataSourceMappingIssueStatus,
  DataSourceMappingIssueType,
  SpApiSyncDomain,
  UpdateDataSourceMappingIssueInput,
  UpsertDataSourceMappingIssueInput
} from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq } from "./sql-utils.js";
import type { Store } from "./types.js";

interface MappingIssueRow {
  id: number;
  org_id: number;
  data_source_id: number;
  commerce_store_id: number;
  marketplace: string;
  domain: string;
  issue_type: string;
  seller_sku: string;
  source_asin: string;
  candidate_product_ids_json: string;
  status: string;
  first_seen_run_id: number | null;
  last_seen_run_id: number | null;
  occurrence_count: number;
  resolution_note: string | null;
  resolved_product_id: number | null;
  resolved_by_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

type DataSourceMappingStoreMethods = Pick<
  Store,
  "upsertDataSourceMappingIssue" | "getDataSourceMappingIssue" | "listDataSourceMappingIssues" |
  "updateDataSourceMappingIssue" | "countOpenDataSourceMappingIssues"
>;

export function createDataSourceMappingStore(db: DatabaseSync): DataSourceMappingStoreMethods {
  return {
    upsertDataSourceMappingIssue(input) {
      ensureSourceAndStoreInOrg(db, input);
      const now = nowIso();
      const sellerSku = input.sellerSku?.trim() ?? "";
      const sourceAsin = input.sourceAsin?.trim() ?? "";
      const candidateProductIds = normalizeProductIds(input.candidateProductIds ?? []);
      db.prepare(
        `INSERT INTO data_source_mapping_issues
         (org_id, data_source_id, commerce_store_id, marketplace, domain, issue_type, seller_sku, source_asin,
          candidate_product_ids_json, status, first_seen_run_id, last_seen_run_id, occurrence_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 1, ?, ?)
         ON CONFLICT(data_source_id, commerce_store_id, marketplace, domain, issue_type, seller_sku, source_asin)
         DO UPDATE SET
           candidate_product_ids_json = excluded.candidate_product_ids_json,
           last_seen_run_id = excluded.last_seen_run_id,
           occurrence_count = data_source_mapping_issues.occurrence_count + 1,
           updated_at = excluded.updated_at`
      ).run(
        input.orgId,
        input.dataSourceId,
        input.commerceStoreId,
        input.marketplace,
        input.domain,
        input.issueType,
        sellerSku,
        sourceAsin,
        JSON.stringify(candidateProductIds),
        input.runId ?? null,
        input.runId ?? null,
        now,
        now
      );
      const issue = getByNaturalKey(db, input.dataSourceId, input.commerceStoreId, input.marketplace, input.domain, input.issueType, sellerSku, sourceAsin);
      if (!issue) throw new Error("Failed to save data source mapping issue");
      return issue;
    },

    getDataSourceMappingIssue(id, orgId, dataSourceId) {
      const row = db.prepare(
        `SELECT * FROM data_source_mapping_issues
         WHERE id = ? AND org_id = ? AND data_source_id = ?`
      ).get(id, orgId, dataSourceId) as unknown as MappingIssueRow | undefined;
      return row ? mapIssue(row) : null;
    },

    listDataSourceMappingIssues(filter) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("data_source_id", filter.dataSourceId),
        whereEq("status", filter.status),
        whereEq("domain", filter.domain),
        whereEq("marketplace", filter.marketplace),
        whereEq("issue_type", filter.issueType)
      );
      const limit = clampLimit(filter.limit ?? 50, 1_000);
      const offset = clampOffset(filter.offset);
      const rows = db.prepare(
        `SELECT * FROM data_source_mapping_issues ${sql}
         ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END, updated_at DESC, id DESC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset) as unknown as MappingIssueRow[];
      return rows.map(mapIssue);
    },

    updateDataSourceMappingIssue(id, orgId, dataSourceId, input) {
      const existing = this.getDataSourceMappingIssue(id, orgId, dataSourceId);
      if (!existing) return null;
      const isResolved = input.status === "resolved";
      const resolutionNote = input.resolutionNote === undefined ? existing.resolutionNote : input.resolutionNote;
      const resolvedProductId = isResolved
        ? input.resolvedProductId === undefined ? existing.resolvedProductId : input.resolvedProductId
        : null;
      const resolvedById = isResolved
        ? input.resolvedById === undefined ? existing.resolvedById : input.resolvedById
        : null;
      db.prepare(
        `UPDATE data_source_mapping_issues SET
           status = ?, resolution_note = ?, resolved_product_id = ?, resolved_by_id = ?, resolved_at = ?, updated_at = ?
         WHERE id = ? AND org_id = ? AND data_source_id = ?`
      ).run(
        input.status,
        resolutionNote,
        resolvedProductId,
        resolvedById,
        isResolved ? nowIso() : null,
        nowIso(),
        id,
        orgId,
        dataSourceId
      );
      return this.getDataSourceMappingIssue(id, orgId, dataSourceId);
    },

    countOpenDataSourceMappingIssues(dataSourceId, orgId) {
      const row = db.prepare(
        `SELECT COUNT(*) AS count FROM data_source_mapping_issues
         WHERE data_source_id = ? AND org_id = ? AND status = 'open'`
      ).get(dataSourceId, orgId) as { count: number };
      return row.count;
    }
  };
}

function ensureSourceAndStoreInOrg(db: DatabaseSync, input: UpsertDataSourceMappingIssueInput): void {
  const source = db.prepare(
    "SELECT id FROM data_source_configs WHERE id = ? AND org_id = ?"
  ).get(input.dataSourceId, input.orgId);
  const store = db.prepare(
    "SELECT id FROM commerce_stores WHERE id = ? AND org_id = ?"
  ).get(input.commerceStoreId, input.orgId);
  if (!source || !store) {
    throw Object.assign(new Error("Data source or commerce store not found"), { statusCode: 404 });
  }
}

function getByNaturalKey(
  db: DatabaseSync,
  dataSourceId: number,
  commerceStoreId: number,
  marketplace: string,
  domain: SpApiSyncDomain,
  issueType: DataSourceMappingIssueType,
  sellerSku: string,
  sourceAsin: string
): DataSourceMappingIssue | null {
  const row = db.prepare(
    `SELECT * FROM data_source_mapping_issues
     WHERE data_source_id = ? AND commerce_store_id = ? AND marketplace = ? AND domain = ? AND issue_type = ?
       AND seller_sku = ? AND source_asin = ?`
  ).get(dataSourceId, commerceStoreId, marketplace, domain, issueType, sellerSku, sourceAsin) as unknown as MappingIssueRow | undefined;
  return row ? mapIssue(row) : null;
}

function mapIssue(row: MappingIssueRow): DataSourceMappingIssue {
  return {
    id: row.id,
    orgId: row.org_id,
    dataSourceId: row.data_source_id,
    commerceStoreId: row.commerce_store_id,
    marketplace: row.marketplace,
    domain: mapDomain(row.domain),
    issueType: mapIssueType(row.issue_type),
    sellerSku: row.seller_sku || null,
    sourceAsin: row.source_asin || null,
    candidateProductIds: parseProductIds(row.candidate_product_ids_json),
    status: mapIssueStatus(row.status),
    firstSeenRunId: row.first_seen_run_id,
    lastSeenRunId: row.last_seen_run_id,
    occurrenceCount: row.occurrence_count,
    resolutionNote: row.resolution_note,
    resolvedProductId: row.resolved_product_id,
    resolvedById: row.resolved_by_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseProductIds(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeProductIds(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeProductIds(values: unknown[]): number[] {
  return [...new Set(values.filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item > 0))].sort((a, b) => a - b);
}

function mapDomain(value: string): SpApiSyncDomain {
  return value === "fba_inventory" ? value : "sales_traffic";
}

function mapIssueType(value: string): DataSourceMappingIssueType {
  if (value === "unknown_asin" || value === "asin_conflict" || value === "ambiguous_asin") return value;
  return "unknown_sku";
}

function mapIssueStatus(value: string): DataSourceMappingIssueStatus {
  if (value === "resolved" || value === "ignored") return value;
  return "open";
}
