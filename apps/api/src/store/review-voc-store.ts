import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  ProductDataFreshness,
  ProductReview,
  ProductSyncStatus,
  ReviewSentiment,
  ReviewVocListFilter,
  ReviewVocSummary,
  UpsertProductReviewInput
} from "@amazon-monitor/shared";
import {
  buildReviewVocSummary,
  inferReviewSentiment,
  normalizeReviewTopics,
  reviewVocWindowDays
} from "../services/review-voc-service.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type ReviewVocStoreMethods = Pick<
  Store,
  "upsertProductReview" | "listProductReviews" | "getReviewVocSummary" | "listReviewVocSummaries"
>;

interface ProductReviewRow {
  id: number;
  product_id: number;
  review_date: string;
  external_review_id: string;
  rating: number;
  title: string;
  body: string;
  reviewer_name: string | null;
  variant: string | null;
  verified_purchase: number;
  helpful_votes: number | null;
  sentiment: string;
  topics_json: string;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

interface ReviewProductRow {
  product_id: number;
  org_id: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  product_title: string;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
}

export function createReviewVocStore(db: DatabaseSync): ReviewVocStoreMethods {
  return {
    upsertProductReview(input) {
      const now = nowIso();
      const sentiment = input.sentiment ?? inferReviewSentiment(input.rating, input.title, input.body);
      const topics = normalizeReviewTopics(input.topics, input.title, input.body);
      db.prepare(
        `INSERT INTO own_product_reviews
         (product_id, review_date, external_review_id, rating, title, body, reviewer_name,
          variant, verified_purchase, helpful_votes, sentiment, topics_json, data_source,
          last_synced_at, sync_status, sync_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id, review_date, external_review_id, title, body) DO UPDATE SET
          rating = excluded.rating,
          reviewer_name = excluded.reviewer_name,
          variant = excluded.variant,
          verified_purchase = excluded.verified_purchase,
          helpful_votes = excluded.helpful_votes,
          sentiment = excluded.sentiment,
          topics_json = excluded.topics_json,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error`
      ).run(
        input.productId,
        input.reviewDate,
        input.externalReviewId ?? "",
        input.rating,
        input.title,
        input.body,
        input.reviewerName ?? null,
        input.variant ?? null,
        input.verifiedPurchase ? 1 : 0,
        input.helpfulVotes ?? null,
        sentiment,
        JSON.stringify(topics),
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now
      );
      const row = db.prepare(
        `SELECT * FROM own_product_reviews
         WHERE product_id = ? AND review_date = ? AND external_review_id = ? AND title = ? AND body = ?`
      ).get(input.productId, input.reviewDate, input.externalReviewId ?? "", input.title, input.body) as unknown as ProductReviewRow;
      return mapProductReview(row);
    },

    listProductReviews(filter = {}) {
      return listReviewRows(db, filter).map(mapProductReview);
    },

    getReviewVocSummary(productId, filter = {}) {
      const product = getProductRow(db, productId, filter.orgId);
      if (!product) return null;
      return summarizeProduct(db, product, filter);
    },

    listReviewVocSummaries(filter = {}) {
      const rows = listProductRows(db, filter);
      return rows.map((row) => summarizeProduct(db, row, filter));
    }
  };
}

function summarizeProduct(db: DatabaseSync, product: ReviewProductRow, filter: ReviewVocListFilter): ReviewVocSummary {
  const reviews = listReviewRows(db, {
    productId: product.product_id,
    date: filter.date,
    startDate: filter.startDate,
    endDate: filter.endDate,
    limit: 200
  }).map(mapProductReview);
  return buildReviewVocSummary({
    product: {
      productId: product.product_id,
      orgId: product.org_id,
      sku: product.sku,
      asin: product.asin,
      marketplace: product.marketplace,
      brand: product.brand,
      productTitle: product.product_title
    },
    reviews,
    date: filter.date ?? filter.endDate,
    freshness: resolveFreshness(product, reviews[0])
  });
}

function listProductRows(db: DatabaseSync, filter: ReviewVocListFilter): ReviewProductRow[] {
  const { sql, params } = buildWhere(
    whereEq("p.org_id", filter.orgId),
    whereEq("p.id", filter.productId),
    productQWhere(filter.q)
  );
  const limit = clampLimit(filter.limit ?? 100);
  const offset = clampOffset(filter.offset);
  return db.prepare(
    `SELECT p.id AS product_id, p.org_id, p.sku, p.asin, p.marketplace, p.brand,
      p.title AS product_title, p.data_source, p.last_synced_at, p.sync_status, p.sync_error
     FROM own_products p
     ${sql}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as unknown as ReviewProductRow[];
}

function getProductRow(db: DatabaseSync, productId: number, orgId: number | undefined): ReviewProductRow | null {
  const { sql, params } = buildWhere(whereEq("p.id", productId), whereEq("p.org_id", orgId));
  const row = db.prepare(
    `SELECT p.id AS product_id, p.org_id, p.sku, p.asin, p.marketplace, p.brand,
      p.title AS product_title, p.data_source, p.last_synced_at, p.sync_status, p.sync_error
     FROM own_products p
     ${sql}
     LIMIT 1`
  ).get(...params) as unknown as ReviewProductRow | undefined;
  return row ?? null;
}

function listReviewRows(db: DatabaseSync, filter: ReviewVocListFilter): ProductReviewRow[] {
  const range = reviewDateRange(filter);
  const { sql, params } = buildWhere(
    whereEq("p.org_id", filter.orgId),
    whereEq("r.product_id", filter.productId),
    range,
    reviewQWhere(filter.q)
  );
  const limit = clampLimit(filter.limit ?? 100);
  const offset = clampOffset(filter.offset);
  return db.prepare(
    `SELECT r.*
     FROM own_product_reviews r
     JOIN own_products p ON p.id = r.product_id
     ${sql}
     ORDER BY r.review_date DESC, r.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as unknown as ProductReviewRow[];
}

function reviewDateRange(filter: ReviewVocListFilter): WhereBuilder | null {
  if (filter.startDate || filter.endDate) {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.startDate) {
      clauses.push("r.review_date >= ?");
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      clauses.push("r.review_date <= ?");
      params.push(filter.endDate);
    }
    return { clause: clauses.join(" AND "), params };
  }
  if (!filter.date) return null;
  return {
    clause: "r.review_date <= ? AND r.review_date >= date(?, ?)",
    params: [filter.date, filter.date, `-${reviewVocWindowDays} days`]
  };
}

function productQWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(p.sku) LIKE ? OR LOWER(p.asin) LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.brand, '')) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function reviewQWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: `(LOWER(r.title) LIKE ? OR LOWER(r.body) LIKE ? OR LOWER(p.sku) LIKE ?
      OR LOWER(p.asin) LIKE ? OR LOWER(COALESCE(p.brand, '')) LIKE ?)`,
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function mapProductReview(row: ProductReviewRow): ProductReview {
  return {
    id: row.id,
    productId: row.product_id,
    reviewDate: row.review_date,
    externalReviewId: emptyToNull(row.external_review_id),
    rating: row.rating,
    title: row.title,
    body: row.body,
    reviewerName: row.reviewer_name,
    variant: row.variant,
    verifiedPurchase: row.verified_purchase === 1,
    helpfulVotes: row.helpful_votes,
    sentiment: mapSentiment(row.sentiment),
    topics: parseJsonArray(row.topics_json),
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at
  };
}

function resolveFreshness(product: ReviewProductRow, latestReview: ProductReview | undefined): ProductDataFreshness {
  if (latestReview) {
    return {
      dataSource: latestReview.dataSource,
      lastSyncedAt: latestReview.lastSyncedAt,
      syncStatus: latestReview.syncStatus,
      syncError: latestReview.syncError
    };
  }
  return {
    dataSource: product.data_source,
    lastSyncedAt: product.last_synced_at,
    syncStatus: mapSyncStatus(product.sync_status),
    syncError: product.sync_error
  };
}

function mapSentiment(value: string): ReviewSentiment {
  if (value === "positive" || value === "neutral" || value === "negative") return value;
  return "neutral";
}

function mapSyncStatus(value: string): ProductSyncStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "manual") {
    return value;
  }
  return "manual";
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

export type { ProductReviewRow, ReviewProductRow };
