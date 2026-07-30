import type {
  CreateDataSourceInput,
  DataSourceAdsImportResult,
  DataSourceConfig,
  DataSourceCostImportResult,
  DataSourceImportPayload,
  DataSourceInventoryImportResult,
  DataSourceProductImportResult,
  DataSourceListFilter,
  DataSourceMappingIssue,
  DataSourceSyncRun,
  DataSourceSyncRunListFilter,
  SpApiConnectionHealth,
  SpApiRegion,
  SpApiSyncDomain,
  UpdateDataSourceInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type CreateDataSourcePayload = Omit<CreateDataSourceInput, "orgId">;
export type UpdateDataSourcePayload = UpdateDataSourceInput;
export type DataSourceSyncRunQuery = Omit<DataSourceSyncRunListFilter, "orgId" | "dataSourceId">;

export interface SaveSpApiCredentialsPayload {
  region: SpApiRegion;
  commerceStoreIds: number[];
  lwaClientId: string;
  lwaClientSecret: string;
  lwaRefreshToken: string;
}

export interface SpApiSyncPayload {
  domains: SpApiSyncDomain[];
  mode: "incremental" | "full" | "backfill";
  marketplaces?: string[];
  fromDate?: string;
  toDate?: string;
}

function buildQuery(params: DataSourceListFilter = {}): string {
  const query = new URLSearchParams();
  if (params.sourceType) query.set("sourceType", params.sourceType);
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const text = query.toString();
  return text ? `?${text}` : "";
}

function buildSyncRunQuery(params: DataSourceSyncRunQuery = {}): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const dataSourceApi = {
  listDataSources: (params: DataSourceListFilter = {}) =>
    request<DataSourceConfig[]>(`/data-sources${buildQuery(params)}`),

  createDataSource: (payload: CreateDataSourcePayload) =>
    request<DataSourceConfig>("/data-sources", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateDataSource: (id: number, payload: UpdateDataSourcePayload) =>
    request<DataSourceConfig>(`/data-sources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  listSyncRuns: (id: number, params: DataSourceSyncRunQuery = {}) =>
    request<DataSourceSyncRun[]>(`/data-sources/${id}/runs${buildSyncRunQuery(params)}`),

  saveSpApiCredentials: (id: number, payload: SaveSpApiCredentialsPayload) =>
    request<void>(`/data-sources/${id}/sp-api/credentials`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  testSpApiConnection: (id: number) =>
    request<{ runId: number; status: DataSourceSyncRun["status"] }>(`/data-sources/${id}/test-connection`, {
      method: "POST"
    }),

  syncSpApi: (id: number, payload: SpApiSyncPayload) =>
    request<{ runs: DataSourceSyncRun[] }>(`/data-sources/${id}/sync`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  getSpApiHealth: (id: number) => request<SpApiConnectionHealth>(`/data-sources/${id}/health`),

  listSpApiMappingIssues: (id: number) => request<DataSourceMappingIssue[]>(`/data-sources/${id}/mapping-issues?status=open&limit=50`),

  importProductsFile: (id: number, payload: DataSourceImportPayload) =>
    request<DataSourceProductImportResult>(`/data-sources/${id}/import/products`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  importAdsFile: (id: number, payload: DataSourceImportPayload) =>
    request<DataSourceAdsImportResult>(`/data-sources/${id}/import/ads`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  importCostsFile: (id: number, payload: DataSourceImportPayload) =>
    request<DataSourceCostImportResult>(`/data-sources/${id}/import/costs`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  importInventoryFile: (id: number, payload: DataSourceImportPayload) =>
    request<DataSourceInventoryImportResult>(`/data-sources/${id}/import/inventory`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
