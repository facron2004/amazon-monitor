import type {
  ProductReview,
  ReviewVocListFilter,
  ReviewVocSummary,
  UpsertProductReviewInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type ProductReviewPayload = Omit<UpsertProductReviewInput, "productId">;

export interface ProductReviewResponse {
  review: ProductReview;
  summary: ReviewVocSummary | null;
}

export type ReviewVocQuery = Omit<ReviewVocListFilter, "orgId" | "productId">;

export const reviewVocApi = {
  listSummaries: (query: ReviewVocQuery = {}) =>
    request<ReviewVocSummary[]>(`/review-voc?${buildQuery(query).toString()}`),
  getSummary: (productId: number, query: ReviewVocQuery = {}) =>
    request<ReviewVocSummary>(`/products/${productId}/review-voc?${buildQuery(query).toString()}`),
  listReviews: (productId: number, query: ReviewVocQuery = {}) =>
    request<ProductReview[]>(`/products/${productId}/reviews?${buildQuery(query).toString()}`),
  upsertReview: (productId: number, payload: ProductReviewPayload) =>
    request<ProductReviewResponse>(`/products/${productId}/reviews`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function buildQuery(query: ReviewVocQuery): URLSearchParams {
  const params = new URLSearchParams();
  setOptional(params, "date", query.date);
  setOptional(params, "startDate", query.startDate);
  setOptional(params, "endDate", query.endDate);
  setOptional(params, "q", query.q?.trim());
  setOptional(params, "limit", query.limit);
  setOptional(params, "offset", query.offset);
  return params;
}

function setOptional(params: URLSearchParams, key: string, value: string | number | undefined | null): void {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, String(value));
  }
}
