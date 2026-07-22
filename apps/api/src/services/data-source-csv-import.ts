import type { DataSourceConfig, DataSourceImportError } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

export function finalizeDataSourceImport(
  store: Store,
  source: DataSourceConfig,
  syncedAt: string,
  importedRows: number,
  errors: DataSourceImportError[]
): DataSourceConfig {
  const syncStatus = errors.length > 0 ? (importedRows > 0 ? "partial" : "failed") : "success";
  const updated = store.updateDataSource(source.id, {
    status: syncStatus === "success" ? "connected" : "attention",
    syncStatus,
    lastSyncedAt: syncedAt,
    lastSuccessAt: importedRows > 0 ? syncedAt : source.lastSuccessAt,
    syncError: errors.length > 0 ? summarizeImportErrors(errors) : null
  });
  if (!updated) throw new Error(`Data source ${source.id} not found`);
  return updated;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function summarizeImportErrors(errors: DataSourceImportError[]): string {
  const first = errors.slice(0, 3).map((error) => `row ${error.row}: ${error.message}`).join("; ");
  return `${errors.length} row(s) failed. ${first}`;
}
