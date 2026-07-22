export const dataSourceTypes = [
  "amazon_sp_api",
  "amazon_ads_api",
  "public_crawler",
  "csv_import",
  "erp_wms",
  "manual"
] as const;

export type DataSourceType = (typeof dataSourceTypes)[number];

export const dataSourceStatuses = ["not_connected", "connected", "attention", "disabled"] as const;
export type DataSourceStatus = (typeof dataSourceStatuses)[number];

export const dataSourceSyncStatuses = ["pending", "success", "partial", "failed", "manual"] as const;
export type DataSourceSyncStatus = (typeof dataSourceSyncStatuses)[number];

export const dataSourceSyncOperations = [
  "product_csv_import",
  "product_excel_import",
  "ads_csv_import",
  "ads_excel_import",
  "cost_csv_import",
  "cost_excel_import",
  "inventory_csv_import",
  "inventory_excel_import"
] as const;
export type DataSourceSyncOperation = (typeof dataSourceSyncOperations)[number];

export type DataSourceImportPayload =
  | { format: "csv"; content: string }
  | { format: "xlsx"; contentBase64: string; fileName?: string };

export const dataSourceSyncRunStatuses = ["pending", "success", "partial", "failed"] as const;
export type DataSourceSyncRunStatus = (typeof dataSourceSyncRunStatuses)[number];

export const dataSourceTypeLabels: Record<DataSourceType, string> = {
  amazon_sp_api: "Amazon SP-API",
  amazon_ads_api: "Amazon Ads API",
  public_crawler: "Public Crawler",
  csv_import: "File Import",
  erp_wms: "ERP / WMS",
  manual: "Manual Entry"
};

export const dataSourceStatusLabels: Record<DataSourceStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  attention: "Needs attention",
  disabled: "Disabled"
};

export interface DataSourceConfig {
  id: number;
  orgId: number;
  name: string;
  sourceType: DataSourceType;
  marketplace: string | null;
  status: DataSourceStatus;
  syncStatus: DataSourceSyncStatus;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  syncError: string | null;
  ownerId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceListFilter {
  orgId?: number;
  sourceType?: DataSourceType;
  status?: DataSourceStatus;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface DataSourceSyncRun {
  id: number;
  orgId: number;
  dataSourceId: number;
  operation: DataSourceSyncOperation;
  status: DataSourceSyncRunStatus;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdRecords: number;
  updatedRecords: number;
  errorSummary: string | null;
  initiatedById: number | null;
  initiatedByName: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface DataSourceSyncRunListFilter {
  orgId: number;
  dataSourceId: number;
  status?: DataSourceSyncRunStatus;
  limit?: number;
  offset?: number;
}

export interface CreateDataSourceSyncRunInput {
  orgId: number;
  dataSourceId: number;
  operation: DataSourceSyncOperation;
  initiatedById?: number | null;
  startedAt?: string;
}

export interface FinishDataSourceSyncRunInput {
  status: Exclude<DataSourceSyncRunStatus, "pending">;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdRecords: number;
  updatedRecords: number;
  errorSummary?: string | null;
  finishedAt?: string;
}

export interface CreateDataSourceInput {
  orgId: number;
  name: string;
  sourceType: DataSourceType;
  marketplace?: string | null;
  status?: DataSourceStatus;
  syncStatus?: DataSourceSyncStatus;
  lastSyncedAt?: string | null;
  lastSuccessAt?: string | null;
  syncError?: string | null;
  ownerId?: number | null;
  notes?: string | null;
}

export interface UpdateDataSourceInput {
  name?: string;
  sourceType?: DataSourceType;
  marketplace?: string | null;
  status?: DataSourceStatus;
  syncStatus?: DataSourceSyncStatus;
  lastSyncedAt?: string | null;
  lastSuccessAt?: string | null;
  syncError?: string | null;
  ownerId?: number | null;
  notes?: string | null;
}

export interface DataSourceImportError {
  row: number;
  message: string;
}

export interface DataSourceProductImportResult {
  source: DataSourceConfig;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdProducts: number;
  updatedProducts: number;
  errors: DataSourceImportError[];
}

export interface DataSourceAdsImportResult {
  source: DataSourceConfig;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdMetrics: number;
  updatedMetrics: number;
  errors: DataSourceImportError[];
}

export interface DataSourceCostImportResult {
  source: DataSourceConfig;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdSettings: number;
  updatedSettings: number;
  errors: DataSourceImportError[];
}

export interface DataSourceInventoryImportResult {
  source: DataSourceConfig;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdSettings: number;
  updatedSettings: number;
  errors: DataSourceImportError[];
}
