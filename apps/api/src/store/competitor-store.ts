import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  buildCompetitorDailyKpiSnapshot,
  diffCompetitorDailyKpis,
  inferIceType,
  isoDateOffset,
} from "@amazon-monitor/shared";
import type {
  CompetitorDailyKpiSnapshot,
  CompetitorPoolItem,
  SerpSnapshot,
} from "@amazon-monitor/shared";
import {
  keywordCompetitorReasons,
  keywordCompetitorTier,
} from "./competitor-domain.js";
import {
  mapCompetitor,
  mapCompetitorFolder,
  type CompetitorFolderRow,
  type CompetitorRow,
} from "./competitor-mappers.js";
import { serpKeywordCountsByAsinMarket } from "./keyword-snapshot-store.js";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type CompetitorStoreMethods = Pick<
  Store,
  | "upsertCompetitorsFromSnapshots"
  | "createManualCompetitor"
  | "createManualCompetitors"
  | "listCompetitors"
  | "getCompetitor"
  | "listCompetitorFolders"
  | "captureCompetitorDailyKpiSnapshot"
  | "getCompetitorKpiComparison"
  | "getProductLink"
>;

export function createCompetitorStore(
  db: DatabaseSync,
): CompetitorStoreMethods {
  const manualStatement = db.prepare(
    `INSERT INTO amazon_competitor_pool
     (org_id, asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
      appear_keyword_count, best_rank, latest_rank, latest_product_url, source_type, first_seen_source,
      competitor_tier, competitor_reasons_json, is_key_competitor, status, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '手动添加', ?, ?, 0, NULL, NULL, ?, 'manual', 'manual', 'watch', '["手动添加"]', 0, 1, ?)
     ON CONFLICT(org_id, asin, marketplace) DO UPDATE SET
       title = excluded.title,
       brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
       latest_product_url = COALESCE(amazon_competitor_pool.latest_product_url, excluded.latest_product_url),
       competitor_reasons_json = CASE
         WHEN amazon_competitor_pool.source_type = 'manual' THEN excluded.competitor_reasons_json
         ELSE amazon_competitor_pool.competitor_reasons_json
       END,
       status = 1,
       updated_at = excluded.updated_at`,
  );

  function upsertManual(
    input: Parameters<Store["createManualCompetitor"]>[0],
    orgId: number,
  ): CompetitorPoolItem {
    const now = nowIso();
    manualStatement.run(
      orgId,
      input.asin,
      input.marketplace,
      input.title,
      input.brand ?? null,
      now.slice(0, 10),
      now.slice(0, 10),
      `https://${input.marketplace}/dp/${input.asin}`,
      now,
    );
    const row = db
      .prepare(
        "SELECT * FROM amazon_competitor_pool WHERE org_id = ? AND asin = ? AND marketplace = ?",
      )
      .get(orgId, input.asin, input.marketplace) as unknown as CompetitorRow;
    return mapCompetitor(row);
  }

  function listCompetitors(
    filter: Parameters<Store["listCompetitors"]>[0] = {},
  ): CompetitorPoolItem[] {
    const joins: string[] = [];
    const clauses = ["cp.status = 1"];
    const joinParams: SQLInputValue[] = [];
    const whereParams: SQLInputValue[] = [];
    if (filter.orgId !== undefined) {
      clauses.push("cp.org_id = ?");
      whereParams.push(filter.orgId);
    }
    if (filter.keywordId) {
      joins.push(`INNER JOIN (
        SELECT DISTINCT s.asin, s.marketplace FROM amazon_keyword_serp_snapshot s
        INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
        WHERE s.keyword_id = ? AND (? IS NULL OR m.org_id = ?)
      ) k1 ON k1.asin = cp.asin AND k1.marketplace = cp.marketplace`);
      joinParams.push(
        filter.keywordId,
        filter.orgId ?? null,
        filter.orgId ?? null,
      );
    }
    if (filter.keyword) {
      joins.push(`INNER JOIN (
        SELECT DISTINCT s.asin, s.marketplace FROM amazon_keyword_serp_snapshot s
        INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
        WHERE s.keyword = ? AND (? IS NULL OR m.org_id = ?)
      ) k2 ON k2.asin = cp.asin AND k2.marketplace = cp.marketplace`);
      joinParams.push(
        filter.keyword,
        filter.orgId ?? null,
        filter.orgId ?? null,
      );
    }
    if (filter.sourceType) {
      clauses.push("cp.source_type = ?");
      whereParams.push(filter.sourceType);
    }
    if (filter.tier) {
      clauses.push("cp.competitor_tier = ?");
      whereParams.push(filter.tier);
    }
    const rows = db
      .prepare(
        `SELECT cp.* FROM amazon_competitor_pool cp
       ${joins.join(" ")}
       WHERE ${clauses.join(" AND ")}
       ORDER BY cp.is_key_competitor DESC,
        CASE cp.competitor_tier WHEN 'core' THEN 1 WHEN 'rising' THEN 2 WHEN 'activity' THEN 3 ELSE 4 END,
        COALESCE(cp.latest_category_rank, cp.latest_bsr_rank, cp.latest_rank, 999999), cp.asin`,
      )
      .all(...joinParams, ...whereParams) as unknown as CompetitorRow[];
    return rows.map(mapCompetitor);
  }

  function readDailyKpiSnapshot(
    orgId: number,
    date: string,
  ): CompetitorDailyKpiSnapshot | null {
    const row = db
      .prepare(
        `SELECT snapshot_date, total_count, core_count, new_count, price_active_count, key_count
       FROM amazon_competitor_daily_kpi_snapshot
       WHERE org_id = ? AND snapshot_date = ?`,
      )
      .get(orgId, date) as
      | {
          snapshot_date: string;
          total_count: number;
          core_count: number;
          new_count: number;
          price_active_count: number;
          key_count: number;
        }
      | undefined;
    return row
      ? {
          date: row.snapshot_date,
          total: row.total_count,
          core: row.core_count,
          new: row.new_count,
          priceActive: row.price_active_count,
          key: row.key_count,
        }
      : null;
  }

  return {
    upsertCompetitorsFromSnapshots(items, orgId = 1) {
      const unique = new Map<string, SerpSnapshot>();
      for (const item of items)
        unique.set(`${item.marketplace}:${item.asin}`, item);
      const keywordCounts = serpKeywordCountsByAsinMarket(
        db,
        Array.from(unique.values()),
        orgId,
      );
      const statement = keywordCompetitorUpsertStatement(db);
      withTransaction(db, () => {
        for (const item of unique.values()) {
          statement.run(
            orgId,
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            item.keyword,
            item.snapshotDate,
            item.snapshotDate,
            keywordCounts.get(`${item.marketplace}:${item.asin}`) ?? 0,
            item.absoluteRank,
            item.absoluteRank,
            item.currentPrice,
            item.currentPrice,
            item.reviewCount,
            item.productUrl,
            item.couponText,
            item.dealBadge,
            item.bsrRank,
            item.bsrCategory,
            item.bsrText,
            JSON.stringify(item.bestsellerRanks ?? []),
            `keyword:${item.keyword}`,
            item.iceType ?? inferIceType(item.title),
            keywordCompetitorTier(item),
            JSON.stringify(keywordCompetitorReasons(item)),
            nowIso(),
          );
        }
      });
    },

    createManualCompetitor(input, orgId = 1) {
      return upsertManual(input, orgId);
    },

    createManualCompetitors(inputs, orgId = 1) {
      const items: CompetitorPoolItem[] = [];
      withTransaction(db, () => {
        for (const input of inputs) items.push(upsertManual(input, orgId));
      });
      return items;
    },

    listCompetitors,

    captureCompetitorDailyKpiSnapshot(orgId, date) {
      const watchStates = db
        .prepare(
          "SELECT asin, watch_level FROM asin_watch_states WHERE org_id = ?",
        )
        .all(orgId) as Array<{
        asin: string;
        watch_level: "NORMAL" | "POTENTIAL" | "CORE";
      }>;
      const snapshot = buildCompetitorDailyKpiSnapshot(
        date,
        listCompetitors({ orgId }),
        watchStates.map((state) => ({
          asin: state.asin,
          watchLevel: state.watch_level,
        })),
      );
      db.prepare(
        `INSERT INTO amazon_competitor_daily_kpi_snapshot
         (org_id, snapshot_date, total_count, core_count, new_count, price_active_count, key_count, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, snapshot_date) DO UPDATE SET
           total_count = excluded.total_count,
           core_count = excluded.core_count,
           new_count = excluded.new_count,
           price_active_count = excluded.price_active_count,
           key_count = excluded.key_count,
           captured_at = excluded.captured_at`,
      ).run(
        orgId,
        date,
        snapshot.total,
        snapshot.core,
        snapshot.new,
        snapshot.priceActive,
        snapshot.key,
        nowIso(),
      );
      return snapshot;
    },

    getCompetitorKpiComparison(orgId, date) {
      const current = readDailyKpiSnapshot(orgId, date);
      if (!current) {
        throw new Error(`Competitor KPI snapshot ${date} is not captured`);
      }
      const previous = readDailyKpiSnapshot(orgId, isoDateOffset(date, -1));
      return {
        current,
        previous,
        delta: diffCompetitorDailyKpis(current, previous),
      };
    },

    getCompetitor(id, orgId) {
      const row = db
        .prepare(
          "SELECT * FROM amazon_competitor_pool WHERE id = ? AND status = 1 AND (? IS NULL OR org_id = ?)",
        )
        .get(id, orgId ?? null, orgId ?? null) as unknown as
        CompetitorRow | undefined;
      return row ? mapCompetitor(row) : null;
    },

    listCompetitorFolders(orgId) {
      const rows = db
        .prepare(
          `SELECT k.id AS keyword_id, k.keyword, k.marketplace,
          COUNT(DISTINCT s.asin) AS competitor_count, MAX(s.snapshot_date) AS latest_snapshot_date
         FROM amazon_keyword_monitor k
         LEFT JOIN amazon_keyword_serp_snapshot s ON s.keyword_id = k.id
         WHERE (? IS NULL OR k.org_id = ?)
         GROUP BY k.id, k.keyword, k.marketplace
         ORDER BY k.id`,
        )
        .all(orgId ?? null, orgId ?? null) as unknown as CompetitorFolderRow[];
      return rows.map(mapCompetitorFolder);
    },

    getProductLink(asin, keywordId, orgId) {
      const params: SQLInputValue[] = [asin, orgId ?? null, orgId ?? null];
      const keywordClause = keywordId ? "AND s.keyword_id = ?" : "";
      if (keywordId) params.push(keywordId);
      const snapshot = db
        .prepare(
          `SELECT s.asin, s.marketplace, s.product_url FROM amazon_keyword_serp_snapshot s
         INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
         WHERE s.asin = ? AND (? IS NULL OR m.org_id = ?) ${keywordClause}
         ORDER BY s.snapshot_date DESC, s.absolute_rank ASC LIMIT 1`,
        )
        .get(...params) as
        | { asin: string; marketplace: string; product_url: string | null }
        | undefined;
      if (snapshot?.product_url) {
        return {
          asin: snapshot.asin,
          marketplace: snapshot.marketplace,
          url: snapshot.product_url,
        };
      }
      const competitor = db
        .prepare(
          "SELECT asin, marketplace, latest_product_url FROM amazon_competitor_pool WHERE asin = ? AND (? IS NULL OR org_id = ?) LIMIT 1",
        )
        .get(asin, orgId ?? null, orgId ?? null) as
        | {
            asin: string;
            marketplace: string;
            latest_product_url: string | null;
          }
        | undefined;
      return competitor?.latest_product_url
        ? {
            asin: competitor.asin,
            marketplace: competitor.marketplace,
            url: competitor.latest_product_url,
          }
        : null;
    },
  };
}

function keywordCompetitorUpsertStatement(db: DatabaseSync) {
  return db.prepare(
    `INSERT INTO amazon_competitor_pool
     (org_id, asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
      appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price, latest_review_count, latest_product_url,
      coupon_text, deal_badge, latest_bsr_rank, latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json,
      source_type, first_seen_source, latest_category_name, latest_category_rank, ice_type, competitor_tier,
      competitor_reasons_json, is_key_competitor, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'keyword', ?, NULL, NULL, ?, ?, ?, 0, 1, ?)
     ON CONFLICT(org_id, asin, marketplace) DO UPDATE SET
      title = excluded.title, brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
      image_url = excluded.image_url, last_seen_date = excluded.last_seen_date,
      appear_keyword_count = excluded.appear_keyword_count,
      best_rank = MIN(amazon_competitor_pool.best_rank, excluded.best_rank), latest_rank = excluded.latest_rank,
      lowest_price = CASE WHEN amazon_competitor_pool.lowest_price IS NULL THEN excluded.lowest_price
        WHEN excluded.lowest_price IS NULL THEN amazon_competitor_pool.lowest_price
        ELSE MIN(amazon_competitor_pool.lowest_price, excluded.lowest_price) END,
      latest_price = excluded.latest_price, latest_review_count = excluded.latest_review_count,
      latest_product_url = excluded.latest_product_url, coupon_text = excluded.coupon_text,
      deal_badge = excluded.deal_badge, latest_bsr_rank = excluded.latest_bsr_rank,
      latest_bsr_category = excluded.latest_bsr_category, latest_bsr_text = excluded.latest_bsr_text,
      latest_bestseller_ranks_json = excluded.latest_bestseller_ranks_json,
      source_type = CASE WHEN amazon_competitor_pool.source_type IN ('category', 'hybrid') THEN 'hybrid' ELSE 'keyword' END,
      first_seen_source = COALESCE(amazon_competitor_pool.first_seen_source, excluded.first_seen_source),
      ice_type = excluded.ice_type,
      competitor_tier = CASE WHEN amazon_competitor_pool.competitor_tier = 'core' THEN 'core' ELSE excluded.competitor_tier END,
      competitor_reasons_json = excluded.competitor_reasons_json, updated_at = excluded.updated_at`,
  );
}
