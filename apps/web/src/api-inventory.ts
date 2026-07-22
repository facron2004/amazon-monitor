import type {
  InventoryPlanListFilter,
  InventoryPlanTaskResponse,
  InventoryReplenishmentPlan,
  InventoryReplenishmentSetting,
  UpsertInventoryReplenishmentSettingInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type InventorySettingPayload = Omit<UpsertInventoryReplenishmentSettingInput, "productId">;

export interface InventorySettingResponse {
  setting: InventoryReplenishmentSetting;
  plan: InventoryReplenishmentPlan | null;
}

export type InventoryPlanQuery = Omit<InventoryPlanListFilter, "orgId">;

export const inventoryApi = {
  listPlans: (query: InventoryPlanQuery = {}) =>
    request<InventoryReplenishmentPlan[]>(`/inventory/plans?${buildQuery(query).toString()}`),
  getPlan: (productId: number, date?: string) =>
    request<InventoryReplenishmentPlan>(`/products/${productId}/inventory-plan${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  createTask: (productId: number, date?: string) =>
    request<InventoryPlanTaskResponse>(`/products/${productId}/inventory-plan/task`, {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  upsertSetting: (productId: number, payload: InventorySettingPayload) =>
    request<InventorySettingResponse>(`/products/${productId}/inventory-setting`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function buildQuery(query: InventoryPlanQuery): URLSearchParams {
  const params = new URLSearchParams();
  setOptional(params, "date", query.date);
  setOptional(params, "productId", query.productId);
  setOptional(params, "q", query.q?.trim());
  setOptional(params, "level", query.level);
  setOptional(params, "limit", query.limit);
  setOptional(params, "offset", query.offset);
  return params;
}

function setOptional(params: URLSearchParams, key: string, value: string | number | undefined | null): void {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, String(value));
  }
}
