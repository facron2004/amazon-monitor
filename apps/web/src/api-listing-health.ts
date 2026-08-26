import type {
  ProductListingHealthItem,
  ProductListingSnapshot,
  UpsertProductListingSnapshotInput
} from "@amazon-monitor/shared";
import { request, setOptional } from "./api-base";

export interface ListingHealthQuery {
  date?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export type ListingSnapshotPayload = Omit<UpsertProductListingSnapshotInput, "productId">;

export interface ListingSnapshotResponse {
  snapshot: ProductListingSnapshot;
  health: ProductListingHealthItem | null;
}

export const listingHealthApi = {
  list: (query: ListingHealthQuery = {}) =>
    request<ProductListingHealthItem[]>(`/listing-health?${buildQuery(query).toString()}`),
  upsertSnapshot: (productId: number, payload: ListingSnapshotPayload) =>
    request<ListingSnapshotResponse>(`/products/${productId}/listing-snapshots`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function buildQuery(query: ListingHealthQuery): URLSearchParams {
  const params = new URLSearchParams();
  setOptional(params, "date", query.date);
  setOptional(params, "q", query.q?.trim());
  setOptional(params, "limit", query.limit);
  setOptional(params, "offset", query.offset);
  return params;
}
