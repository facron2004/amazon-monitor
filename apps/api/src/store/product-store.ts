import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  CreateOwnedProductInput,
  OwnedProduct,
  OwnedProductDailyMetric,
  OwnedProductDetail,
  OwnedProductListItem,
  ProductDataFreshness,
  ProductScore,
  ProductScoreDimension,
  ProductScoreLevel,
  ProductSyncStatus,
  UpdateOwnedProductInput,
  UpsertOwnedProductDailyMetricInput
} from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, whereGte, whereLte, type WhereBuilder } from "./sql-utils.js";
import { getSpApiProductEvidence } from "./sp-api-product-evidence.js";
import type { Store } from "./types.js";

type ProductStoreMethods = Pick<
  Store,
  | "createProduct"
  | "updateProduct"
  | "getProduct"
  | "getProductBySku"
  | "getProductDetail"
  | "listProducts"
  | "upsertProductDailyMetric"
  | "listProductDailyMetrics"
  | "listOrganizationProductDailyMetrics"
  | "getProductRiskScore"
  | "getProductOpportunityScore"
>;

interface ProductRow {
  id: number;
  org_id: number;
  store_id: number | null;
  marketplace: string;
  sku: string;
  asin: string;
  brand: string | null;
  title: string;
  image_url: string | null;
  category: string | null;
  owner_id: number | null;
  status: string;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductMetricRow {
  id: number;
  product_id: number;
  metric_date: string;
  sessions: number | null;
  page_views: number | null;
  orders: number | null;
  units_sold: number | null;
  sales_amount: number | null;
  buy_box_percentage: number | null;
  conversion_rate: number | null;
  rating: number | null;
  review_count: number | null;
  bsr_rank: number | null;
  inventory_available: number | null;
  inventory_days: number | null;
  ad_spend: number | null;
  ad_sales: number | null;
  acos: number | null;
  tacos: number | null;
  gross_margin: number | null;
  keyword_rank: number | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

interface EventPressureRow {
  event_level: string;
  count: number;
  max_score: number | null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapSyncStatus(value: string): ProductSyncStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "manual") {
    return value;
  }
  return "manual";
}

function mapProduct(row: ProductRow): OwnedProduct {
  return {
    id: row.id,
    orgId: row.org_id,
    storeId: row.store_id,
    marketplace: row.marketplace,
    sku: row.sku,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    imageUrl: row.image_url,
    category: row.category,
    ownerId: row.owner_id,
    status: row.status === "paused" || row.status === "archived" ? row.status : "active",
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMetric(row: ProductMetricRow): OwnedProductDailyMetric {
  return {
    id: row.id,
    productId: row.product_id,
    date: row.metric_date,
    sessions: row.sessions,
    pageViews: row.page_views,
    orders: row.orders,
    unitsSold: row.units_sold,
    salesAmount: row.sales_amount,
    buyBoxPercentage: row.buy_box_percentage,
    conversionRate: row.conversion_rate,
    rating: row.rating,
    reviewCount: row.review_count,
    bsrRank: row.bsr_rank,
    inventoryAvailable: row.inventory_available,
    inventoryDays: row.inventory_days,
    adSpend: row.ad_spend,
    adSales: row.ad_sales,
    acos: row.acos,
    tacos: row.tacos,
    grossMargin: row.gross_margin,
    keywordRank: row.keyword_rank,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at
  };
}

function freshnessFor(product: OwnedProduct, metric: OwnedProductDailyMetric | null): ProductDataFreshness {
  if (metric) {
    return {
      dataSource: metric.dataSource,
      lastSyncedAt: metric.lastSyncedAt,
      syncStatus: metric.syncStatus,
      syncError: metric.syncError
    };
  }
  return {
    dataSource: product.dataSource,
    lastSyncedAt: product.lastSyncedAt,
    syncStatus: product.syncStatus,
    syncError: product.syncError
  };
}

function scoreLevel(score: number): ProductScoreLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function weightedScore(dimensions: ProductScoreDimension[]): number {
  return clampScore(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0));
}

function previousMetrics(metrics: OwnedProductDailyMetric[]): OwnedProductDailyMetric[] {
  return metrics.slice(1, 8);
}

function buildRiskScore(
  product: OwnedProduct,
  metrics: OwnedProductDailyMetric[],
  eventPressure: EventPressureRow[]
): ProductScore {
  const latest = metrics[0] ?? null;
  const previous = previousMetrics(metrics);
  const previousSalesAvg = average(previous.map((item) => item.salesAmount));
  const salesDrop = pctChange(latest?.salesAmount ?? null, previousSalesAvg);
  const previousKeywordRank = average(previous.map((item) => item.keywordRank));
  const keywordRankDelta = latest?.keywordRank !== null && latest?.keywordRank !== undefined && previousKeywordRank !== null
    ? latest.keywordRank - previousKeywordRank
    : null;
  const p0Count = eventPressure.find((row) => row.event_level === "P0")?.count ?? 0;
  const p1Count = eventPressure.find((row) => row.event_level === "P1")?.count ?? 0;
  const p2Count = eventPressure.find((row) => row.event_level === "P2")?.count ?? 0;

  const dimensions: ProductScoreDimension[] = [
    {
      key: "inventory",
      label: "库存风险",
      weight: 0.3,
      score: latest?.inventoryDays === null || latest?.inventoryDays === undefined
        ? 0
        : latest.inventoryDays < 14 ? 100 : latest.inventoryDays < 21 ? 80 : latest.inventoryDays < 35 ? 55 : 0,
      reason: latest?.inventoryDays === null || latest?.inventoryDays === undefined
        ? "暂无库存可售天数"
        : `库存可售 ${latest.inventoryDays} 天`
    },
    {
      key: "sales_drop",
      label: "销售下滑",
      weight: 0.2,
      score: salesDrop === null ? 0 : salesDrop <= -0.5 ? 100 : salesDrop <= -0.3 ? 75 : salesDrop <= -0.15 ? 45 : 0,
      reason: salesDrop === null ? "暂无足够销售历史" : `销售额较近 7 日均值变化 ${(salesDrop * 100).toFixed(1)}%`
    },
    {
      key: "ads",
      label: "广告异常",
      weight: 0.15,
      score: latest?.acos === null || latest?.acos === undefined
        ? 0
        : latest.acos >= 0.5 ? 100 : latest.acos >= 0.35 ? 75 : latest.acos >= 0.25 ? 45 : 0,
      reason: latest?.acos === null || latest?.acos === undefined ? "暂无 ACOS 数据" : `ACOS ${(latest.acos * 100).toFixed(1)}%`
    },
    {
      key: "keyword_rank",
      label: "核心词排名",
      weight: 0.15,
      score: keywordRankDelta === null ? 0 : keywordRankDelta >= 10 ? 100 : keywordRankDelta >= 5 ? 70 : keywordRankDelta >= 2 ? 40 : 0,
      reason: keywordRankDelta === null ? "暂无核心词排名趋势" : `核心词排名较近 7 日均值变化 ${keywordRankDelta.toFixed(1)} 位`
    },
    {
      key: "review",
      label: "评分 / Review",
      weight: 0.1,
      score: latest?.rating === null || latest?.rating === undefined
        ? 0
        : latest.rating < 3.8 ? 100 : latest.rating < 4.1 ? 75 : latest.rating < 4.3 ? 45 : 0,
      reason: latest?.rating === null || latest?.rating === undefined ? "暂无评分数据" : `当前评分 ${latest.rating.toFixed(1)}`
    },
    {
      key: "competitor_pressure",
      label: "竞品压制",
      weight: 0.1,
      score: p0Count > 0 ? 90 : p1Count > 0 ? 65 : p2Count > 0 ? 30 : 0,
      reason: p0Count + p1Count + p2Count === 0
        ? "近 14 天暂无关联高优先级事件"
        : `近 14 天关联事件 P0 ${p0Count} / P1 ${p1Count} / P2 ${p2Count}`
    }
  ];
  const score = weightedScore(dimensions);
  return {
    productId: product.id,
    sku: product.sku,
    asin: product.asin,
    date: latest?.date ?? null,
    score,
    level: scoreLevel(score),
    dimensions,
    reasons: dimensions.filter((item) => item.score > 0).map((item) => item.reason),
    freshness: freshnessFor(product, latest)
  };
}

function buildOpportunityScore(product: OwnedProduct, metrics: OwnedProductDailyMetric[]): ProductScore {
  const latest = metrics[0] ?? null;
  const previous = previousMetrics(metrics);
  const previousSalesAvg = average(previous.map((item) => item.salesAmount));
  const salesGrowth = pctChange(latest?.salesAmount ?? null, previousSalesAvg);
  const previousBsr = average(previous.map((item) => item.bsrRank));
  const bsrImprovement = latest?.bsrRank !== null && latest?.bsrRank !== undefined && previousBsr !== null && previousBsr > 0
    ? (previousBsr - latest.bsrRank) / previousBsr
    : null;
  const previousKeywordRank = average(previous.map((item) => item.keywordRank));
  const keywordImprovement = latest?.keywordRank !== null && latest?.keywordRank !== undefined && previousKeywordRank !== null
    ? previousKeywordRank - latest.keywordRank
    : null;
  const previousRating = average(previous.map((item) => item.rating));
  const ratingImprovement = latest?.rating !== null && latest?.rating !== undefined && previousRating !== null
    ? latest.rating - previousRating
    : null;

  const dimensions: ProductScoreDimension[] = [
    {
      key: "sales_growth",
      label: "销售增长",
      weight: 0.25,
      score: salesGrowth === null ? 0 : salesGrowth >= 0.5 ? 100 : salesGrowth >= 0.25 ? 75 : salesGrowth >= 0.1 ? 45 : 0,
      reason: salesGrowth === null ? "暂无足够销售历史" : `销售额较近 7 日均值变化 ${(salesGrowth * 100).toFixed(1)}%`
    },
    {
      key: "bsr_lift",
      label: "BSR 提升",
      weight: 0.2,
      score: bsrImprovement === null ? 0 : bsrImprovement >= 0.3 ? 100 : bsrImprovement >= 0.15 ? 75 : bsrImprovement >= 0.05 ? 45 : 0,
      reason: bsrImprovement === null ? "暂无 BSR 趋势" : `BSR 较近 7 日均值提升 ${(bsrImprovement * 100).toFixed(1)}%`
    },
    {
      key: "ads_efficiency",
      label: "广告效率",
      weight: 0.2,
      score: latest?.acos === null || latest?.acos === undefined
        ? 0
        : latest.acos <= 0.15 ? 90 : latest.acos <= 0.25 ? 65 : latest.acos <= 0.35 ? 30 : 0,
      reason: latest?.acos === null || latest?.acos === undefined ? "暂无 ACOS 数据" : `ACOS ${(latest.acos * 100).toFixed(1)}%`
    },
    {
      key: "keyword_lift",
      label: "核心词排名提升",
      weight: 0.15,
      score: keywordImprovement === null ? 0 : keywordImprovement >= 10 ? 100 : keywordImprovement >= 5 ? 70 : keywordImprovement >= 2 ? 40 : 0,
      reason: keywordImprovement === null ? "暂无核心词排名趋势" : `核心词排名较近 7 日均值提升 ${keywordImprovement.toFixed(1)} 位`
    },
    {
      key: "competitor_gap",
      label: "竞品缺口",
      weight: 0.1,
      score: 0,
      reason: "暂无竞品缺货 / 涨价信号"
    },
    {
      key: "review_momentum",
      label: "Review 改善",
      weight: 0.1,
      score: ratingImprovement === null ? 0 : ratingImprovement >= 0.2 ? 80 : ratingImprovement >= 0.1 ? 45 : 0,
      reason: ratingImprovement === null ? "暂无评分趋势" : `评分较近 7 日均值变化 ${ratingImprovement.toFixed(2)}`
    }
  ];
  const score = weightedScore(dimensions);
  return {
    productId: product.id,
    sku: product.sku,
    asin: product.asin,
    date: latest?.date ?? null,
    score,
    level: scoreLevel(score),
    dimensions,
    reasons: dimensions.filter((item) => item.score > 0).map((item) => item.reason),
    freshness: freshnessFor(product, latest)
  };
}

function eventPressure(db: DatabaseSync, asin: string, date: string): EventPressureRow[] {
  return db
    .prepare(
      `SELECT event_level, COUNT(*) AS count, MAX(score_total) AS max_score
       FROM insight_events
       WHERE asin = ?
        AND event_date <= ?
        AND event_date >= date(?, '-14 day')
       GROUP BY event_level`
    )
    .all(asin, date, date) as unknown as EventPressureRow[];
}

function metricRows(db: DatabaseSync, productId: number, filter: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
} = {}): OwnedProductDailyMetric[] {
  const { sql, params } = buildWhere(
    whereEq("product_id", productId),
    whereGte("metric_date", filter.startDate),
    whereLte("metric_date", filter.endDate)
  );
  const limit = clampLimit(filter.limit ?? 90);
  const offset = clampOffset(filter.offset);
  const rows = db
    .prepare(`SELECT * FROM own_product_daily_metrics ${sql} ORDER BY metric_date DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as ProductMetricRow[];
  return rows.map(mapMetric);
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(sku) LIKE ? OR LOWER(asin) LIKE ? OR LOWER(title) LIKE ? OR LOWER(COALESCE(brand, '')) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function buildListItem(db: DatabaseSync, product: OwnedProduct, date?: string): OwnedProductListItem {
  const metrics = metricRows(db, product.id, { endDate: date, limit: 30 });
  const latestDate = metrics[0]?.date ?? date ?? todayIsoDate();
  const riskScore = buildRiskScore(product, metrics, eventPressure(db, product.asin, latestDate));
  return {
    ...product,
    latestMetric: metrics[0] ?? null,
    spApiEvidence: getSpApiProductEvidence(db, product.id, date),
    riskScore,
    opportunityScore: buildOpportunityScore(product, metrics)
  };
}

export function createProductStore(db: DatabaseSync): ProductStoreMethods {
  return {
    createProduct(input) {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO own_products
           (org_id, store_id, marketplace, sku, asin, brand, title, image_url, category, owner_id,
            status, data_source, last_synced_at, sync_status, sync_error, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.orgId,
          input.storeId ?? null,
          input.marketplace,
          input.sku,
          input.asin,
          input.brand ?? null,
          input.title,
          input.imageUrl ?? null,
          input.category ?? null,
          input.ownerId ?? null,
          input.status ?? "active",
          input.dataSource ?? "manual",
          input.lastSyncedAt ?? now,
          input.syncStatus ?? "manual",
          input.syncError ?? null,
          now,
          now
        );
      const row = db.prepare("SELECT * FROM own_products WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as ProductRow;
      return mapProduct(row);
    },

    updateProduct(id, input: UpdateOwnedProductInput) {
      const current = db.prepare("SELECT * FROM own_products WHERE id = ?").get(id) as unknown as ProductRow | undefined;
      if (!current) {
        throw new Error(`Product ${id} not found`);
      }
      db.prepare(
        `UPDATE own_products SET
          store_id = ?, marketplace = ?, sku = ?, asin = ?, brand = ?, title = ?, image_url = ?, category = ?,
          owner_id = ?, status = ?, data_source = ?, last_synced_at = ?, sync_status = ?, sync_error = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.storeId !== undefined ? input.storeId : current.store_id,
        input.marketplace ?? current.marketplace,
        input.sku ?? current.sku,
        input.asin ?? current.asin,
        input.brand !== undefined ? input.brand : current.brand,
        input.title ?? current.title,
        input.imageUrl !== undefined ? input.imageUrl : current.image_url,
        input.category !== undefined ? input.category : current.category,
        input.ownerId !== undefined ? input.ownerId : current.owner_id,
        input.status ?? current.status,
        input.dataSource ?? current.data_source,
        input.lastSyncedAt !== undefined ? input.lastSyncedAt : current.last_synced_at,
        input.syncStatus ?? current.sync_status,
        input.syncError !== undefined ? input.syncError : current.sync_error,
        nowIso(),
        id
      );
      const row = db.prepare("SELECT * FROM own_products WHERE id = ?").get(id) as unknown as ProductRow;
      return mapProduct(row);
    },

    getProduct(id) {
      const row = db.prepare("SELECT * FROM own_products WHERE id = ?").get(id) as unknown as ProductRow | undefined;
      return row ? mapProduct(row) : null;
    },

    getProductBySku(orgId, marketplace, sku) {
      const row = db.prepare(
        "SELECT * FROM own_products WHERE org_id = ? AND marketplace = ? AND sku = ?"
      ).get(orgId, marketplace, sku) as unknown as ProductRow | undefined;
      return row ? mapProduct(row) : null;
    },

    getProductDetail(id, date) {
      const product = this.getProduct(id);
      if (!product) return null;
      const metrics = metricRows(db, id, { endDate: date, limit: 90 });
      const latestDate = metrics[0]?.date ?? date ?? todayIsoDate();
      const riskScore = buildRiskScore(product, metrics, eventPressure(db, product.asin, latestDate));
      return {
        ...product,
        latestMetric: metrics[0] ?? null,
        spApiEvidence: getSpApiProductEvidence(db, id, date),
        riskScore,
        opportunityScore: buildOpportunityScore(product, metrics),
        metrics
      } satisfies OwnedProductDetail;
    },

    listProducts(filter = {}) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("store_id", filter.storeId),
        whereEq("status", filter.status),
        whereEq("marketplace", filter.marketplace),
        whereEq("brand", filter.brand),
        qWhere(filter.q)
      );
      const limit = clampLimit(filter.limit ?? 200);
      const offset = clampOffset(filter.offset);
      const rows = db
        .prepare(`SELECT * FROM own_products ${sql} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as ProductRow[];
      return rows.map((row) => buildListItem(db, mapProduct(row), filter.date));
    },

    upsertProductDailyMetric(input: UpsertOwnedProductDailyMetricInput) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO own_product_daily_metrics
         (product_id, metric_date, sessions, page_views, orders, units_sold, sales_amount,
          buy_box_percentage, conversion_rate, rating, review_count, bsr_rank,
          inventory_available, inventory_days, ad_spend, ad_sales, acos, tacos,
          gross_margin, keyword_rank, data_source, last_synced_at, sync_status, sync_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id, metric_date) DO UPDATE SET
          sessions = excluded.sessions,
          page_views = excluded.page_views,
          orders = excluded.orders,
          units_sold = excluded.units_sold,
          sales_amount = excluded.sales_amount,
          buy_box_percentage = excluded.buy_box_percentage,
          conversion_rate = excluded.conversion_rate,
          rating = excluded.rating,
          review_count = excluded.review_count,
          bsr_rank = excluded.bsr_rank,
          inventory_available = excluded.inventory_available,
          inventory_days = excluded.inventory_days,
          ad_spend = excluded.ad_spend,
          ad_sales = excluded.ad_sales,
          acos = excluded.acos,
          tacos = excluded.tacos,
          gross_margin = excluded.gross_margin,
          keyword_rank = excluded.keyword_rank,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error`
      ).run(
        input.productId,
        input.date,
        input.sessions ?? null,
        input.pageViews ?? null,
        input.orders ?? null,
        input.unitsSold ?? null,
        input.salesAmount ?? null,
        input.buyBoxPercentage ?? null,
        input.conversionRate ?? null,
        input.rating ?? null,
        input.reviewCount ?? null,
        input.bsrRank ?? null,
        input.inventoryAvailable ?? null,
        input.inventoryDays ?? null,
        input.adSpend ?? null,
        input.adSales ?? null,
        input.acos ?? null,
        input.tacos ?? null,
        input.grossMargin ?? null,
        input.keywordRank ?? null,
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now
      );
      const row = db
        .prepare("SELECT * FROM own_product_daily_metrics WHERE product_id = ? AND metric_date = ?")
        .get(input.productId, input.date) as unknown as ProductMetricRow;
      return mapMetric(row);
    },

    listProductDailyMetrics(productId, filter = {}) {
      return metricRows(db, productId, filter);
    },

    listOrganizationProductDailyMetrics(orgId, filter = {}) {
      const { sql, params } = buildWhere(
        whereEq("p.org_id", orgId),
        whereEq("p.status", "active"),
        whereGte("m.metric_date", filter.startDate),
        whereLte("m.metric_date", filter.endDate)
      );
      const limit = clampLimit(filter.limit ?? 1000);
      const offset = clampOffset(filter.offset);
      return (
        db.prepare(
          `SELECT m.*
           FROM own_product_daily_metrics m
           JOIN own_products p ON p.id = m.product_id
           ${sql}
           ORDER BY m.metric_date DESC, m.product_id ASC
           LIMIT ? OFFSET ?`
        ).all(...params, limit, offset) as unknown as ProductMetricRow[]
      ).map(mapMetric);
    },

    getProductRiskScore(id, date) {
      return this.getProductDetail(id, date)?.riskScore ?? null;
    },

    getProductOpportunityScore(id, date) {
      return this.getProductDetail(id, date)?.opportunityScore ?? null;
    }
  };
}

export type { ProductRow, ProductMetricRow };
