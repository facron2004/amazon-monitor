import type { DatabaseSync } from "node:sqlite";
import {
  dataSourceOverrideDomains,
  dataSourceOverrideFields,
  type CreateDataSourceOverrideAuditInput,
  type DataSourceOverrideAudit,
  type DataSourceOverrideDomain,
  type DataSourceOverrideField
} from "@amazon-monitor/shared";
import { clampLimit, clampOffset, nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";

type DataSourceOverrideStoreMethods = Pick<
  Store,
  "createDataSourceOverrideAudit" | "listDataSourceOverrideAudits"
>;

interface OverrideAuditRow {
  id: number;
  org_id: number;
  data_source_id: number;
  data_source_name: string;
  sync_run_id: number;
  product_id: number;
  domain: string;
  effective_date: string;
  field_name: string;
  previous_data_source_id: number;
  previous_data_source_name: string;
  previous_sync_run_id: number;
  previous_value: number | null;
  new_value: number | null;
  overridden_by_id: number;
  overridden_by_name: string;
  reason: string;
  restore_on_sp_api_success: number;
  created_at: string;
}

const overrideAuditSelect = `
  SELECT a.id, a.org_id, a.data_source_id, source.name AS data_source_name,
         a.sync_run_id, a.product_id, a.domain, a.effective_date, a.field_name,
         a.previous_data_source_id, previous_source.name AS previous_data_source_name,
         a.previous_sync_run_id, a.previous_value, a.new_value,
         a.overridden_by_id, COALESCE(u.display_name, u.username) AS overridden_by_name,
         a.reason, a.restore_on_sp_api_success, a.created_at
  FROM data_source_override_audits a
  JOIN data_source_configs source ON source.id = a.data_source_id AND source.org_id = a.org_id
  JOIN data_source_configs previous_source
    ON previous_source.id = a.previous_data_source_id AND previous_source.org_id = a.org_id
  JOIN users u ON u.id = a.overridden_by_id AND u.org_id = a.org_id
`;

export function createDataSourceOverrideStore(db: DatabaseSync): DataSourceOverrideStoreMethods {
  return {
    createDataSourceOverrideAudit(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error("Override reason is required");
      assertOverrideContext(db, input);
      const result = db.prepare(
        `INSERT INTO data_source_override_audits
         (org_id, data_source_id, sync_run_id, product_id, domain, effective_date, field_name,
          previous_data_source_id, previous_sync_run_id, previous_value, new_value,
          overridden_by_id, reason, restore_on_sp_api_success, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.orgId,
        input.dataSourceId,
        input.syncRunId,
        input.productId,
        input.domain,
        input.effectiveDate,
        input.fieldName,
        input.previousDataSourceId,
        input.previousSyncRunId,
        input.previousValue,
        input.newValue,
        input.overriddenById,
        reason,
        input.restoreOnSpApiSuccess === true ? 1 : 0,
        nowIso()
      );
      const row = db.prepare(`${overrideAuditSelect} WHERE a.id = ?`).get(Number(result.lastInsertRowid)) as OverrideAuditRow | undefined;
      if (!row) throw new Error("Failed to create data source override audit");
      return mapOverrideAudit(row);
    },

    listDataSourceOverrideAudits(filter) {
      const conditions = ["a.org_id = ?", "a.data_source_id = ?"];
      const params: Array<number> = [filter.orgId, filter.dataSourceId];
      if (filter.productId !== undefined) {
        conditions.push("a.product_id = ?");
        params.push(filter.productId);
      }
      const limit = clampLimit(filter.limit ?? 50, 1000);
      const offset = clampOffset(filter.offset);
      return db.prepare(
        `${overrideAuditSelect}
         WHERE ${conditions.join(" AND ")}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`
      ).all(...params, limit, offset).map((row) => mapOverrideAudit(row as unknown as OverrideAuditRow));
    }
  };
}

function assertOverrideContext(db: DatabaseSync, input: CreateDataSourceOverrideAuditInput): void {
  const row = db.prepare(`
    SELECT 1
    FROM data_source_configs source
    JOIN data_source_sync_runs run
      ON run.id = ? AND run.data_source_id = source.id AND run.org_id = source.org_id
    JOIN own_products product ON product.id = ? AND product.org_id = source.org_id
    JOIN users operator ON operator.id = ? AND operator.org_id = source.org_id
    JOIN data_source_sync_runs previous_run
      ON previous_run.id = ? AND previous_run.org_id = source.org_id
    JOIN data_source_configs previous_source
      ON previous_source.id = ? AND previous_source.org_id = source.org_id
    WHERE source.id = ? AND source.org_id = ?
      AND run.operation IN ('product_csv_import', 'product_excel_import')
      AND previous_run.domain = 'sales_traffic'
  `).get(
    input.syncRunId,
    input.productId,
    input.overriddenById,
    input.previousSyncRunId,
    input.previousDataSourceId,
    input.dataSourceId,
    input.orgId
  );
  if (!row) {
    throw Object.assign(new Error("Override audit context was not found"), { statusCode: 404 });
  }
  if (!dataSourceOverrideDomains.includes(input.domain)) {
    throw new Error(`Unsupported override domain: ${input.domain}`);
  }
  if (!dataSourceOverrideFields.includes(input.fieldName)) {
    throw new Error(`Unsupported override field: ${input.fieldName}`);
  }
}

function mapOverrideAudit(row: OverrideAuditRow): DataSourceOverrideAudit {
  return {
    id: row.id,
    orgId: row.org_id,
    dataSourceId: row.data_source_id,
    dataSourceName: row.data_source_name,
    syncRunId: row.sync_run_id,
    productId: row.product_id,
    domain: mapDomain(row.domain),
    effectiveDate: row.effective_date,
    fieldName: mapField(row.field_name),
    previousDataSourceId: row.previous_data_source_id,
    previousDataSourceName: row.previous_data_source_name,
    previousSyncRunId: row.previous_sync_run_id,
    previousValue: row.previous_value,
    newValue: row.new_value,
    overriddenById: row.overridden_by_id,
    overriddenByName: row.overridden_by_name,
    reason: row.reason,
    restoreOnSpApiSuccess: row.restore_on_sp_api_success === 1,
    createdAt: row.created_at
  };
}

function mapDomain(value: string): DataSourceOverrideDomain {
  return dataSourceOverrideDomains.includes(value as DataSourceOverrideDomain)
    ? value as DataSourceOverrideDomain
    : "sales_traffic";
}

function mapField(value: string): DataSourceOverrideField {
  return dataSourceOverrideFields.includes(value as DataSourceOverrideField)
    ? value as DataSourceOverrideField
    : "salesAmount";
}
