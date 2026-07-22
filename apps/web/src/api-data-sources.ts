import type {
  CreateDataSourceInput,
  DataSourceAdsImportResult,
  DataSourceConfig,
  DataSourceCostImportResult,
  DataSourceImportPayload,
  DataSourceInventoryImportResult,
  DataSourceProductImportResult,
  DataSourceListFilter,
  DataSourceSyncRun,
  DataSourceSyncRunListFilter,
  UpdateDataSourceInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type CreateDataSourcePayload = Omit<CreateDataSourceInput, "orgId">;
export type UpdateDataSourcePayload = UpdateDataSourceInput;
export type DataSourceSyncRunQuery = Omit<DataSourceSyncRunListFilter, "orgId" | "dataSourceId">;

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
