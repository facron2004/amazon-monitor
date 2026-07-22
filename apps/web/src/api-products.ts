import type {
  CreateOwnedProductInput,
  OwnedProduct,
  OwnedProductDetail,
  OwnedProductListItem,
  OwnedProductStatus,
  UpsertOwnedProductDailyMetricInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export interface ProductListQuery {
  status?: OwnedProductStatus | "all";
  storeId?: number;
  marketplace?: string;
  brand?: string;
  q?: string;
  date?: string;
  limit?: number;
  offset?: number;
}

export type CreateProductPayload = Omit<CreateOwnedProductInput, "orgId">;
export type UpdateProductPayload = Partial<CreateProductPayload>;
export type UpsertProductMetricPayload = Omit<UpsertOwnedProductDailyMetricInput, "productId">;

function productListQuery(params: ProductListQuery = {}): string {
  const query = new URLSearchParams();
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.storeId !== undefined) query.set("storeId", String(params.storeId));
  if (params.marketplace) query.set("marketplace", params.marketplace);
  if (params.brand) query.set("brand", params.brand);
  if (params.q) query.set("q", params.q);
  if (params.date) query.set("date", params.date);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const productApi = {
  listProducts: (params: ProductListQuery = {}) =>
    request<OwnedProductListItem[]>(`/products${productListQuery(params)}`),

  createProduct: (payload: CreateProductPayload) =>
    request<OwnedProduct>("/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateProduct: (id: number, payload: UpdateProductPayload) =>
    request<OwnedProduct>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  fetchProductDetail: (id: number, date?: string) =>
    request<OwnedProductDetail>(`/products/${id}${date ? `?date=${encodeURIComponent(date)}` : ""}`),

  upsertMetric: (productId: number, payload: UpsertProductMetricPayload) =>
    request(`/products/${productId}/metrics`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
