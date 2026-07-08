import type {
  ProductProfitPlan,
  ProductProfitPlanFilter,
  ProductProfitSetting,
  UpsertProductProfitSettingInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type ProfitSettingPayload = Omit<UpsertProductProfitSettingInput, "productId">;

export interface ProfitSettingResponse {
  setting: ProductProfitSetting;
  plan: ProductProfitPlan | null;
}

export type ProfitPlanQuery = Omit<ProductProfitPlanFilter, "orgId">;

export const profitApi = {
  listPlans: (query: ProfitPlanQuery = {}) =>
    request<ProductProfitPlan[]>(`/profit/plans?${buildQuery(query).toString()}`),
  getPlan: (productId: number, date?: string) =>
    request<ProductProfitPlan>(`/products/${productId}/profit-plan${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  upsertSetting: (productId: number, payload: ProfitSettingPayload) =>
    request<ProfitSettingResponse>(`/products/${productId}/profit-setting`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function buildQuery(query: ProfitPlanQuery): URLSearchParams {
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
