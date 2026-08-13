import type {
  DataSourceAdsImportResult,
  DataSourceConfig,
  DataSourceCostImportResult,
  DataSourceInventoryImportResult,
  DataSourceProductImportResult,
  DataSourceSyncOperation
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";

type FileImportResult =
  | DataSourceProductImportResult
  | DataSourceAdsImportResult
  | DataSourceCostImportResult
  | DataSourceInventoryImportResult;

export async function runDataSourceFileImport<T extends FileImportResult>(
  store: Store,
  source: DataSourceConfig,
  initiatedById: number,
  operation: DataSourceSyncOperation,
  execute: (context: { syncRunId: number; initiatedById: number }) => Promise<T>
): Promise<T> {
  const run = store.createDataSourceSyncRun({
    orgId: source.orgId,
    dataSourceId: source.id,
    operation,
    initiatedById
  });
  try {
    const result = await execute({ syncRunId: run.id, initiatedById });
    const counts = importRecordCounts(result);
    store.finishDataSourceSyncRun(run.id, {
      status: completedRunStatus(result.source.syncStatus),
      totalRows: result.totalRows,
      importedRows: result.importedRows,
      failedRows: result.failedRows,
      createdRecords: counts.created,
      updatedRecords: counts.updated,
      errorSummary: result.source.syncError
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "File import failed";
    recordFailedImport(store, source.id, error);
    store.finishDataSourceSyncRun(run.id, {
      status: "failed",
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdRecords: 0,
      updatedRecords: 0,
      errorSummary: message
    });
    throw error;
  }
}

function importRecordCounts(result: FileImportResult): { created: number; updated: number } {
  if ("createdProducts" in result) {
    return { created: result.createdProducts, updated: result.updatedProducts };
  }
  if ("createdMetrics" in result) {
    return { created: result.createdMetrics, updated: result.updatedMetrics };
  }
  return { created: result.createdSettings, updated: result.updatedSettings };
}

function completedRunStatus(status: DataSourceConfig["syncStatus"]): "success" | "partial" | "failed" {
  if (status === "success" || status === "partial" || status === "failed") return status;
  return "failed";
}

function recordFailedImport(store: Store, id: number, error: unknown): void {
  store.updateDataSource(id, {
    status: "attention",
    syncStatus: "failed",
    lastSyncedAt: new Date().toISOString(),
    syncError: error instanceof Error ? error.message : "File import failed"
  });
}
