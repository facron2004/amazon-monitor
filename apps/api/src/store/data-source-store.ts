import type { DatabaseSync } from "node:sqlite";
import {
  dataSourceSyncOperations,
  type CreateDataSourceInput,
  type DataSourceConfig,
  type DataSourceListFilter,
  type DataSourceStatus,
  type DataSourceSyncStatus,
  type DataSourceSyncOperation,
  type DataSourceSyncRun,
  type DataSourceSyncRunStatus,
  type DataSourceType,
  type UpdateDataSourceInput
} from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type DataSourceStoreMethods = Pick<
  Store,
  | "createDataSource"
  | "updateDataSource"
  | "getDataSource"
  | "listDataSources"
  | "createDataSourceSyncRun"
  | "finishDataSourceSyncRun"
  | "listDataSourceSyncRuns"
>;

interface DataSourceRow {
  id: number;
  org_id: number;
  name: string;
  source_type: string;
  marketplace: string | null;
  status: string;
  sync_status: string;
  last_synced_at: string | null;
  last_success_at: string | null;
  sync_error: string | null;
  owner_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DataSourceSyncRunRow {
  id: number;
  org_id: number;
  data_source_id: number;
  operation: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  created_records: number;
  updated_records: number;
  error_summary: string | null;
  initiated_by_id: number | null;
  initiated_by_name: string | null;
  started_at: string;
  finished_at: string | null;
}

export function createDataSourceStore(db: DatabaseSync): DataSourceStoreMethods {
  return {
    createDataSource(input) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO data_source_configs
         (org_id, name, source_type, marketplace, status, sync_status, last_synced_at,
          last_success_at, sync_error, owner_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.orgId,
        input.name,
        input.sourceType,
        input.marketplace ?? null,
        input.status ?? "not_connected",
        input.syncStatus ?? "manual",
        input.lastSyncedAt ?? null,
        input.lastSuccessAt ?? null,
        input.syncError ?? null,
        input.ownerId ?? null,
        input.notes ?? null,
        now,
        now
      );
      const row = db.prepare("SELECT * FROM data_source_configs WHERE id = last_insert_rowid()").get() as unknown as DataSourceRow;
      return mapDataSource(row);
    },

    updateDataSource(id, input) {
      const existing = this.getDataSource(id);
      if (!existing) return null;
      const now = nowIso();
      db.prepare(
        `UPDATE data_source_configs SET
          name = ?,
          source_type = ?,
          marketplace = ?,
          status = ?,
          sync_status = ?,
          last_synced_at = ?,
          last_success_at = ?,
          sync_error = ?,
          owner_id = ?,
          notes = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(
        input.name ?? existing.name,
        input.sourceType ?? existing.sourceType,
        input.marketplace !== undefined ? input.marketplace : existing.marketplace,
        input.status ?? existing.status,
        input.syncStatus ?? existing.syncStatus,
        input.lastSyncedAt !== undefined ? input.lastSyncedAt : existing.lastSyncedAt,
        input.lastSuccessAt !== undefined ? input.lastSuccessAt : existing.lastSuccessAt,
        input.syncError !== undefined ? input.syncError : existing.syncError,
        input.ownerId !== undefined ? input.ownerId : existing.ownerId,
        input.notes !== undefined ? input.notes : existing.notes,
        now,
        id
      );
      return this.getDataSource(id);
    },

    getDataSource(id) {
      const row = db.prepare("SELECT * FROM data_source_configs WHERE id = ?").get(id) as unknown as DataSourceRow | undefined;
      return row ? mapDataSource(row) : null;
    },

    listDataSources(filter = {}) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("source_type", filter.sourceType),
        whereEq("status", filter.status),
        qWhere(filter.q)
      );
      const limit = clampLimit(filter.limit ?? 100);
      const offset = clampOffset(filter.offset);
      return db.prepare(
        `SELECT * FROM data_source_configs
         ${sql}
         ORDER BY
          CASE status
            WHEN 'attention' THEN 0
            WHEN 'not_connected' THEN 1
            WHEN 'connected' THEN 2
            ELSE 3
          END,
          updated_at DESC,
          id DESC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset).map((row) => mapDataSource(row as unknown as DataSourceRow));
    },

    createDataSourceSyncRun(input) {
      const startedAt = input.startedAt ?? nowIso();
      const result = db.prepare(
        `INSERT INTO data_source_sync_runs
         (org_id, data_source_id, operation, status, initiated_by_id, started_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`
      ).run(
        input.orgId,
        input.dataSourceId,
        input.operation,
        input.initiatedById ?? null,
        startedAt
      );
      const run = getDataSourceSyncRun(db, Number(result.lastInsertRowid));
      if (!run) throw new Error("Failed to create data source sync run");
      return run;
    },

    finishDataSourceSyncRun(id, input) {
      db.prepare(
        `UPDATE data_source_sync_runs SET
          status = ?, total_rows = ?, imported_rows = ?, failed_rows = ?,
          created_records = ?, updated_records = ?, error_summary = ?, finished_at = ?
         WHERE id = ?`
      ).run(
        input.status,
        input.totalRows,
        input.importedRows,
        input.failedRows,
        input.createdRecords,
        input.updatedRecords,
        input.errorSummary ?? null,
        input.finishedAt ?? nowIso(),
        id
      );
      return getDataSourceSyncRun(db, id);
    },

    listDataSourceSyncRuns(filter) {
      const { sql, params } = buildWhere(
        whereEq("r.org_id", filter.orgId),
        whereEq("r.data_source_id", filter.dataSourceId),
        whereEq("r.status", filter.status)
      );
      const limit = clampLimit(filter.limit ?? 20, 100);
      const offset = clampOffset(filter.offset);
      return db.prepare(
        `${syncRunSelectSql}
         ${sql}
         ORDER BY r.started_at DESC, r.id DESC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset).map((row) => mapSyncRun(row as unknown as DataSourceSyncRunRow));
    }
  };
}

const syncRunSelectSql = `SELECT r.*, COALESCE(u.display_name, u.username) AS initiated_by_name
  FROM data_source_sync_runs r
  LEFT JOIN users u ON u.id = r.initiated_by_id`;

function getDataSourceSyncRun(db: DatabaseSync, id: number): DataSourceSyncRun | null {
  const row = db.prepare(`${syncRunSelectSql} WHERE r.id = ?`).get(id) as unknown as DataSourceSyncRunRow | undefined;
  return row ? mapSyncRun(row) : null;
}

function mapSyncRun(row: DataSourceSyncRunRow): DataSourceSyncRun {
  return {
    id: row.id,
    orgId: row.org_id,
    dataSourceId: row.data_source_id,
    operation: mapSyncOperation(row.operation),
    status: mapSyncRunStatus(row.status),
    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    failedRows: row.failed_rows,
    createdRecords: row.created_records,
    updatedRecords: row.updated_records,
    errorSummary: row.error_summary,
    initiatedById: row.initiated_by_id,
    initiatedByName: row.initiated_by_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(name) LIKE ? OR LOWER(source_type) LIKE ? OR LOWER(COALESCE(marketplace, '')) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function mapDataSource(row: DataSourceRow): DataSourceConfig {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    sourceType: mapSourceType(row.source_type),
    marketplace: row.marketplace,
    status: mapStatus(row.status),
    syncStatus: mapSyncStatus(row.sync_status),
    lastSyncedAt: row.last_synced_at,
    lastSuccessAt: row.last_success_at,
    syncError: row.sync_error,
    ownerId: row.owner_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSourceType(value: string): DataSourceType {
  if (
    value === "amazon_sp_api" ||
    value === "amazon_ads_api" ||
    value === "public_crawler" ||
    value === "csv_import" ||
    value === "erp_wms" ||
    value === "manual"
  ) {
    return value;
  }
  return "manual";
}

function mapStatus(value: string): DataSourceStatus {
  if (value === "not_connected" || value === "connected" || value === "attention" || value === "disabled") {
    return value;
  }
  return "not_connected";
}

function mapSyncStatus(value: string): DataSourceSyncStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "manual") {
    return value;
  }
  return "manual";
}

function mapSyncOperation(value: string): DataSourceSyncOperation {
  return dataSourceSyncOperations.includes(value as DataSourceSyncOperation)
    ? value as DataSourceSyncOperation
    : "product_csv_import";
}

function mapSyncRunStatus(value: string): DataSourceSyncRunStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed") return value;
  return "failed";
}

export type { DataSourceRow, DataSourceSyncRunRow };
