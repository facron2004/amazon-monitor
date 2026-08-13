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
  "inventory_excel_import",
  "sp_api_connection_test",
  "sp_api_sales_traffic_daily_sync",
  "sp_api_sales_traffic_backfill",
  "sp_api_fba_inventory_incremental_sync",
  "sp_api_fba_inventory_full_reconcile"
] as const;
export type DataSourceSyncOperation = (typeof dataSourceSyncOperations)[number];

export type DataSourceImportPayload =
  | { format: "csv"; content: string; policy?: DataSourceImportPolicy }
  | { format: "xlsx"; contentBase64: string; fileName?: string; policy?: DataSourceImportPolicy };

export interface DataSourceImportPolicy {
  /** Allows a product file to replace same-day SP-API sales fields after an audit. */
  allowSpApiOverride?: boolean;
  overrideReason?: string;
  /** When enabled, a newer successful SP-API fact regains field authority at read time. */
  restoreOnSpApiSuccess?: boolean;
}

export const dataSourceSyncRunStatuses = ["pending", "success", "partial", "failed"] as const;
export type DataSourceSyncRunStatus = (typeof dataSourceSyncRunStatuses)[number];

/** Stable machine-readable failure categories shared by sync runs, health, and UI. */
export const dataSourceSyncErrorCodes = [
  "connector_disabled",
  "credentials_invalid",
  "credentials_revoked",
  "permission_missing",
  "marketplace_mismatch",
  "rate_limited",
  "amazon_5xx",
  "network_timeout",
  "report_cancelled",
  "report_fatal",
  "document_download_failed",
  "schema_invalid",
  "mapping_blocked",
  "lease_lost",
  "database_failed",
  "unknown"
] as const;
export type DataSourceSyncErrorCode = (typeof dataSourceSyncErrorCodes)[number];

export const spApiSyncDomains = ["sales_traffic", "fba_inventory"] as const;
export type SpApiSyncDomain = (typeof spApiSyncDomains)[number];

export const spApiRegions = ["NA", "EU", "FE"] as const;
export type SpApiRegion = (typeof spApiRegions)[number];

export const spApiConnectionHealthStatuses = ["not_configured", "testing", "healthy", "degraded", "attention", "revoked", "disabled"] as const;
export type SpApiConnectionHealthStatus = (typeof spApiConnectionHealthStatuses)[number];

/** Non-sensitive SP-API connection metadata. Credentials are server-only. */
export interface SpApiConnectionConfig {
  dataSourceId: number;
  orgId: number;
  region: SpApiRegion;
  credentialVersion: number;
  credentialsConfigured: boolean;
  linkedStoreIds: number[];
  lastTestedAt: string | null;
  updatedAt: string;
}

export const spApiSyncTriggers = ["manual", "scheduled", "retry"] as const;
export type SpApiSyncTrigger = (typeof spApiSyncTriggers)[number];

export const spApiSyncModes = ["incremental", "full", "backfill"] as const;
export type SpApiSyncMode = (typeof spApiSyncModes)[number];

export const dataSourceDomainHealthStatuses = ["pending", "success", "partial", "failed", "stale"] as const;
export type DataSourceDomainHealthStatus = (typeof dataSourceDomainHealthStatuses)[number];

export const dataSourceMappingIssueTypes = ["unknown_sku", "unknown_asin", "asin_conflict", "ambiguous_asin"] as const;
export type DataSourceMappingIssueType = (typeof dataSourceMappingIssueTypes)[number];

export const dataSourceMappingIssueStatuses = ["open", "resolved", "ignored"] as const;
export type DataSourceMappingIssueStatus = (typeof dataSourceMappingIssueStatuses)[number];

export const spApiSalesTrafficScopes = ["store_daily", "sku_daily"] as const;
export type SpApiSalesTrafficScope = (typeof spApiSalesTrafficScopes)[number];

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
  domain: SpApiSyncDomain | null;
  trigger: SpApiSyncTrigger | null;
  mode: SpApiSyncMode | null;
  idempotencyKey: string | null;
  credentialVersion: number | null;
  marketplaces: string[];
  requestedFromDate: string | null;
  requestedToDate: string | null;
  checkpointSummary: string | null;
  externalRequestId: string | null;
  retryCount: number;
  status: DataSourceSyncRunStatus;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdRecords: number;
  updatedRecords: number;
  errorCode: DataSourceSyncErrorCode | null;
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
  domain?: SpApiSyncDomain | null;
  trigger?: SpApiSyncTrigger | null;
  mode?: SpApiSyncMode | null;
  idempotencyKey?: string | null;
  credentialVersion?: number | null;
  marketplaces?: string[];
  requestedFromDate?: string | null;
  requestedToDate?: string | null;
  checkpointSummary?: string | null;
  externalRequestId?: string | null;
  retryCount?: number;
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
  errorCode?: DataSourceSyncErrorCode | null;
  errorSummary?: string | null;
  checkpointSummary?: string | null;
  externalRequestId?: string | null;
  retryCount?: number;
  finishedAt?: string;
}

export interface DataSourceDomainHealth {
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  domain: SpApiSyncDomain;
  status: DataSourceDomainHealthStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  sourceTime: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface SpApiConnectionHealth {
  dataSourceId: number;
  region: SpApiRegion | null;
  connectorEnabled: boolean;
  credentialsConfigured: boolean;
  status: SpApiConnectionHealthStatus;
  linkedStoreIds: number[];
  lastTestedAt: string | null;
  mappingIssueCount: number;
  domains: DataSourceDomainHealth[];
}

export interface UpsertDataSourceDomainHealthInput {
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  domain: SpApiSyncDomain;
  status: DataSourceDomainHealthStatus;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  sourceTime?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface DataSourceMappingIssue {
  id: number;
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  domain: SpApiSyncDomain;
  issueType: DataSourceMappingIssueType;
  sellerSku: string | null;
  sourceAsin: string | null;
  candidateProductIds: number[];
  status: DataSourceMappingIssueStatus;
  firstSeenRunId: number | null;
  lastSeenRunId: number | null;
  occurrenceCount: number;
  resolutionNote: string | null;
  resolvedProductId: number | null;
  resolvedById: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceMappingIssueListFilter {
  orgId: number;
  dataSourceId: number;
  status?: DataSourceMappingIssueStatus;
  domain?: SpApiSyncDomain;
  marketplace?: string;
  issueType?: DataSourceMappingIssueType;
  limit?: number;
  offset?: number;
}

export interface UpsertDataSourceMappingIssueInput {
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  domain: SpApiSyncDomain;
  issueType: DataSourceMappingIssueType;
  sellerSku?: string | null;
  sourceAsin?: string | null;
  candidateProductIds?: number[];
  runId?: number | null;
}

export interface UpdateDataSourceMappingIssueInput {
  status: DataSourceMappingIssueStatus;
  resolutionNote?: string | null;
  resolvedProductId?: number | null;
  resolvedById?: number | null;
}

export interface SpApiSalesTrafficFactInput {
  orgId: number;
  dataSourceId: number;
  syncRunId: number;
  commerceStoreId: number;
  marketplace: string;
  businessDate: string;
  scope: SpApiSalesTrafficScope;
  sellerSku?: string | null;
  productId?: number | null;
  sourceAsin?: string | null;
  sessions?: number | null;
  pageViews?: number | null;
  orders?: number | null;
  unitsSold?: number | null;
  salesAmount?: number | null;
  buyBoxPercentage?: number | null;
  conversionRate?: number | null;
  currency: string;
  sourceTime?: string | null;
  sourceDocumentId?: string | null;
  contentHash?: string | null;
}

export interface SpApiInventoryFactInput {
  orgId: number;
  dataSourceId: number;
  syncRunId: number;
  commerceStoreId: number;
  marketplace: string;
  sellerSku: string;
  productId?: number | null;
  sourceAsin?: string | null;
  fulfillableQuantity?: number | null;
  reservedQuantity?: number | null;
  inboundWorkingQuantity?: number | null;
  inboundShippedQuantity?: number | null;
  inboundReceivingQuantity?: number | null;
  inboundQuantity?: number | null;
  unfulfillableQuantity?: number | null;
  totalQuantity?: number | null;
  sourceTime?: string | null;
  sourceDocumentId?: string | null;
  contentHash?: string | null;
}

export interface SpApiFactPromotionResult {
  importedRows: number;
  createdRecords: number;
  updatedRecords: number;
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

export const dataSourceOverrideDomains = ["sales_traffic"] as const;
export type DataSourceOverrideDomain = (typeof dataSourceOverrideDomains)[number];

export const dataSourceOverrideFields = [
  "sessions",
  "pageViews",
  "orders",
  "unitsSold",
  "salesAmount",
  "buyBoxPercentage",
  "conversionRate"
] as const;
export type DataSourceOverrideField = (typeof dataSourceOverrideFields)[number];

export interface DataSourceOverrideAudit {
  id: number;
  orgId: number;
  dataSourceId: number;
  dataSourceName: string;
  syncRunId: number;
  productId: number;
  domain: DataSourceOverrideDomain;
  effectiveDate: string;
  fieldName: DataSourceOverrideField;
  previousDataSourceId: number;
  previousDataSourceName: string;
  previousSyncRunId: number;
  previousValue: number | null;
  newValue: number | null;
  overriddenById: number;
  overriddenByName: string;
  reason: string;
  restoreOnSpApiSuccess: boolean;
  createdAt: string;
}

export interface CreateDataSourceOverrideAuditInput {
  orgId: number;
  dataSourceId: number;
  syncRunId: number;
  productId: number;
  domain: DataSourceOverrideDomain;
  effectiveDate: string;
  fieldName: DataSourceOverrideField;
  previousDataSourceId: number;
  previousSyncRunId: number;
  previousValue: number | null;
  newValue: number | null;
  overriddenById: number;
  reason: string;
  restoreOnSpApiSuccess?: boolean;
}

export interface DataSourceOverrideAuditListFilter {
  orgId: number;
  dataSourceId: number;
  productId?: number;
  limit?: number;
  offset?: number;
}

export interface DataSourceProductImportResult {
  source: DataSourceConfig;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  createdProducts: number;
  updatedProducts: number;
  errors: DataSourceImportError[];
  warnings: DataSourceImportError[];
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
