import type { DatabaseSync } from "node:sqlite";
import type {
  DataSourceDomainHealth,
  DataSourceDomainHealthStatus,
  SpApiSyncDomain
} from "@amazon-monitor/shared";
import { nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";

type DataSourceHealthStoreMethods = Pick<
  Store,
  "upsertDataSourceDomainHealth" | "listDataSourceDomainHealth"
>;

interface DataSourceDomainHealthRow {
  org_id: number;
  data_source_id: number;
  commerce_store_id: number;
  marketplace: string;
  domain: string;
  status: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  source_time: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
}

export function createDataSourceHealthStore(db: DatabaseSync): DataSourceHealthStoreMethods {
  return {
    upsertDataSourceDomainHealth(input) {
      assertSourceAndStoreOwnership(db, input.dataSourceId, input.commerceStoreId, input.orgId);
      const now = nowIso();
      db.prepare(`
        INSERT INTO data_source_domain_health (
          org_id, data_source_id, commerce_store_id, marketplace, domain, status,
          last_attempt_at, last_success_at, source_time, error_code, error_message, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(data_source_id, commerce_store_id, marketplace, domain) DO UPDATE SET
          status = excluded.status,
          last_attempt_at = COALESCE(excluded.last_attempt_at, data_source_domain_health.last_attempt_at),
          last_success_at = COALESCE(excluded.last_success_at, data_source_domain_health.last_success_at),
          source_time = COALESCE(excluded.source_time, data_source_domain_health.source_time),
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
      `).run(
        input.orgId,
        input.dataSourceId,
        input.commerceStoreId,
        input.marketplace,
        input.domain,
        input.status,
        input.lastAttemptAt ?? null,
        input.lastSuccessAt ?? null,
        input.sourceTime ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        now
      );
      const row = db.prepare(`
        SELECT * FROM data_source_domain_health
        WHERE data_source_id = ? AND commerce_store_id = ? AND marketplace = ? AND domain = ?
      `).get(input.dataSourceId, input.commerceStoreId, input.marketplace, input.domain) as unknown as DataSourceDomainHealthRow | undefined;
      if (!row) throw new Error("Failed to save data source domain health");
      return mapDataSourceDomainHealth(row);
    },

    listDataSourceDomainHealth(dataSourceId, orgId) {
      const rows = db.prepare(`
        SELECT * FROM data_source_domain_health
        WHERE data_source_id = ? AND org_id = ?
        ORDER BY marketplace ASC, domain ASC, commerce_store_id ASC
      `).all(dataSourceId, orgId) as unknown as DataSourceDomainHealthRow[];
      return rows.map(mapDataSourceDomainHealth);
    }
  };
}

function assertSourceAndStoreOwnership(
  db: DatabaseSync,
  dataSourceId: number,
  commerceStoreId: number,
  orgId: number
): void {
  const owned = db.prepare(`
    SELECT 1
    FROM data_source_configs source
    JOIN commerce_stores commerce_store ON commerce_store.id = ? AND commerce_store.org_id = ?
    WHERE source.id = ? AND source.org_id = ?
  `).get(commerceStoreId, orgId, dataSourceId, orgId);
  if (!owned) {
    throw new Error("Data source and commerce store must belong to the same organization");
  }
}

function mapDataSourceDomainHealth(row: DataSourceDomainHealthRow): DataSourceDomainHealth {
  return {
    orgId: row.org_id,
    dataSourceId: row.data_source_id,
    commerceStoreId: row.commerce_store_id,
    marketplace: row.marketplace,
    domain: mapDomain(row.domain),
    status: mapStatus(row.status),
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    sourceTime: row.source_time,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at
  };
}

function mapDomain(value: string): SpApiSyncDomain {
  if (value === "sales_traffic" || value === "fba_inventory") return value;
  throw new Error(`Unknown SP-API sync domain: ${value}`);
}

function mapStatus(value: string): DataSourceDomainHealthStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "stale") {
    return value;
  }
  throw new Error(`Unknown data source domain health status: ${value}`);
}
