import type {
  CommerceStore,
  CommerceStoreListFilter,
  CreateCommerceStoreInput,
  UpdateCommerceStoreInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type CreateCommerceStorePayload = Omit<CreateCommerceStoreInput, "orgId">;

function storeQuery(filter: CommerceStoreListFilter = {}): string {
  const query = new URLSearchParams();
  if (filter.marketplace) query.set("marketplace", filter.marketplace);
  if (filter.status) query.set("status", filter.status);
  if (filter.q) query.set("q", filter.q);
  if (filter.limit !== undefined) query.set("limit", String(filter.limit));
  if (filter.offset !== undefined) query.set("offset", String(filter.offset));
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const commerceStoreApi = {
  list: (filter: CommerceStoreListFilter = {}) =>
    request<CommerceStore[]>(`/stores${storeQuery(filter)}`),
  create: (payload: CreateCommerceStorePayload) =>
    request<CommerceStore>("/stores", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: UpdateCommerceStoreInput) =>
    request<CommerceStore>(`/stores/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
};
