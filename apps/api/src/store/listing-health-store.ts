import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  ListingHealthListFilter,
  ProductDataFreshness,
  ProductListingHealthItem,
  ProductListingSnapshot,
  ProductSyncStatus
} from "@amazon-monitor/shared";
import { scoreListingHealth } from "../services/listing-health-service.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type ListingHealthStoreMethods = Pick<
  Store,
  "upsertProductListingSnapshot" | "getProductListingHealth" | "listProductListingHealth"
>;

interface ListingSnapshotRow {
  id: number;
  product_id: number;
  snapshot_date: string;
  title: string;
  bullet_points_json: string;
  description: string | null;
  image_urls_json: string;
  core_keywords_json: string;
  review_highlights_json: string;
  qa_gaps_json: string;
  raw_json: string | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

interface ListingHealthRow {
  product_id: number;
  org_id: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  product_title: string;
  product_data_source: string;
  product_last_synced_at: string | null;
  product_sync_status: string;
  product_sync_error: string | null;
  snapshot_id: number | null;
  snapshot_date: string | null;
  listing_title: string | null;
  bullet_points_json: string | null;
  description: string | null;
  image_urls_json: string | null;
  core_keywords_json: string | null;
  review_highlights_json: string | null;
  qa_gaps_json: string | null;
  data_source: string | null;
  last_synced_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
}

export function createListingHealthStore(db: DatabaseSync): ListingHealthStoreMethods {
  return {
    upsertProductListingSnapshot(input) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO own_product_listing_snapshots
         (product_id, snapshot_date, title, bullet_points_json, description, image_urls_json,
          core_keywords_json, review_highlights_json, qa_gaps_json, raw_json, data_source,
          last_synced_at, sync_status, sync_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id, snapshot_date) DO UPDATE SET
          title = excluded.title,
          bullet_points_json = excluded.bullet_points_json,
          description = excluded.description,
          image_urls_json = excluded.image_urls_json,
          core_keywords_json = excluded.core_keywords_json,
          review_highlights_json = excluded.review_highlights_json,
          qa_gaps_json = excluded.qa_gaps_json,
          raw_json = excluded.raw_json,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error`
      ).run(
        input.productId,
        input.date,
        input.title,
        JSON.stringify(input.bulletPoints ?? []),
        input.description ?? null,
        JSON.stringify(input.imageUrls ?? []),
        JSON.stringify(input.coreKeywords ?? []),
        JSON.stringify(input.reviewHighlights ?? []),
        JSON.stringify(input.qaGaps ?? []),
        input.rawJson ?? null,
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now
      );
      const row = db
        .prepare("SELECT * FROM own_product_listing_snapshots WHERE product_id = ? AND snapshot_date = ?")
        .get(input.productId, input.date) as unknown as ListingSnapshotRow;
      return mapListingSnapshot(row);
    },

    getProductListingHealth(productId, date) {
      return this.listProductListingHealth({ productId, date, limit: 1 })[0] ?? null;
    },

    listProductListingHealth(filter: ListingHealthListFilter = {}) {
      const { sql, params } = buildWhere(
        whereEq("p.org_id", filter.orgId),
        whereEq("p.id", filter.productId),
        qWhere(filter.q)
      );
      const limit = clampLimit(filter.limit ?? 100);
      const offset = clampOffset(filter.offset);
      const snapshotDateCondition = filter.date ? "AND s2.snapshot_date <= ?" : "";
      const snapshotDateParams: SQLInputValue[] = filter.date ? [filter.date] : [];
      const rows = db
        .prepare(
          `SELECT
            p.id AS product_id,
            p.org_id,
            p.sku,
            p.asin,
            p.marketplace,
            p.brand,
            p.title AS product_title,
            p.data_source AS product_data_source,
            p.last_synced_at AS product_last_synced_at,
            p.sync_status AS product_sync_status,
            p.sync_error AS product_sync_error,
            s.id AS snapshot_id,
            s.snapshot_date,
            s.title AS listing_title,
            s.bullet_points_json,
            s.description,
            s.image_urls_json,
            s.core_keywords_json,
            s.review_highlights_json,
            s.qa_gaps_json,
            s.data_source,
            s.last_synced_at,
            s.sync_status,
            s.sync_error
           FROM own_products p
           LEFT JOIN own_product_listing_snapshots s
            ON s.product_id = p.id
            AND s.snapshot_date = (
              SELECT MAX(s2.snapshot_date)
              FROM own_product_listing_snapshots s2
              WHERE s2.product_id = p.id ${snapshotDateCondition}
            )
           ${sql}
           ORDER BY COALESCE(s.snapshot_date, '') DESC, p.updated_at DESC, p.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...snapshotDateParams, ...params, limit, offset) as unknown as ListingHealthRow[];
      return rows.map(mapListingHealthItem);
    }
  };
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(p.sku) LIKE ? OR LOWER(p.asin) LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.brand, '')) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function mapListingSnapshot(row: ListingSnapshotRow): ProductListingSnapshot {
  return {
    id: row.id,
    productId: row.product_id,
    date: row.snapshot_date,
    title: row.title,
    bulletPoints: parseJsonArray(row.bullet_points_json),
    description: row.description,
    imageUrls: parseJsonArray(row.image_urls_json),
    coreKeywords: parseJsonArray(row.core_keywords_json),
    reviewHighlights: parseJsonArray(row.review_highlights_json),
    qaGaps: parseJsonArray(row.qa_gaps_json),
    rawJson: row.raw_json,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at
  };
}

function mapListingHealthItem(row: ListingHealthRow): ProductListingHealthItem {
  const bulletPoints = parseJsonArray(row.bullet_points_json);
  const imageUrls = parseJsonArray(row.image_urls_json);
  const coreKeywords = parseJsonArray(row.core_keywords_json);
  const reviewHighlights = parseJsonArray(row.review_highlights_json);
  const qaGaps = parseJsonArray(row.qa_gaps_json);
  const listingTitle = row.listing_title ?? row.product_title;
  return {
    productId: row.product_id,
    orgId: row.org_id,
    sku: row.sku,
    asin: row.asin,
    marketplace: row.marketplace,
    brand: row.brand,
    productTitle: row.product_title,
    snapshotId: row.snapshot_id,
    snapshotDate: row.snapshot_date,
    listingTitle,
    bulletPoints,
    description: row.description,
    imageUrls,
    coreKeywords,
    reviewHighlights,
    qaGaps,
    freshness: mapFreshness(row),
    health: scoreListingHealth({
      title: listingTitle,
      bulletPoints,
      imageUrls,
      coreKeywords,
      reviewHighlights,
      qaGaps
    })
  };
}

function mapFreshness(row: ListingHealthRow): ProductDataFreshness {
  if (row.snapshot_id !== null) {
    return {
      dataSource: row.data_source ?? "manual",
      lastSyncedAt: row.last_synced_at,
      syncStatus: mapSyncStatus(row.sync_status ?? "manual"),
      syncError: row.sync_error
    };
  }
  return {
    dataSource: row.product_data_source,
    lastSyncedAt: row.product_last_synced_at,
    syncStatus: mapSyncStatus(row.product_sync_status),
    syncError: row.product_sync_error
  };
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

export type { ListingSnapshotRow, ListingHealthRow };
