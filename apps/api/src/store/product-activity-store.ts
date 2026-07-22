import type { DatabaseSync } from "node:sqlite";
import { buildProductActivityDay, buildProductActivitySummary, resolveProductIdentity } from "./activity-calendar.js";
import { mapBsrRankHistory, type BsrRankHistoryRow } from "./bsr-mappers.js";
import { mapActionInsight, type ActionInsightRow } from "./competitor-mappers.js";
import { isoDateOffset } from "./date-utils.js";
import { mapChange, type ChangeRow } from "./operational-mappers.js";
import { sanitizeBestsellerSnapshotRows, sanitizeProductPriceHistory, shouldExposeActivityEvent } from "./review-guards.js";
import { mapSnapshot, type SnapshotRow } from "./serp-mappers.js";
import {
  mapActivityEvent,
  mapBestsellerSnapshot,
  mapCategorySignal,
  mapProductPriceHistory,
  type ActivityEventRow,
  type BestsellerSnapshotRow,
  type CategorySignalRow,
  type ProductPriceHistoryRow
} from "./snapshot-mappers.js";
import { buildCalendarFilterClauses, buildWhere, whereEq, whereGte, whereLte, whereMarketplace } from "./sql-utils.js";
import type { Store } from "./types.js";

type ProductActivityStoreMethods = Pick<Store, "getProductActivityCalendar">;

export function createProductActivityStore(db: DatabaseSync): ProductActivityStoreMethods {
  return {
    getProductActivityCalendar(asin, filter = {}) {
      const limitDays = Math.max(1, Math.min(180, filter.limitDays ?? 90));
      const fromDate = filter.date ? isoDateOffset(filter.date, -(limitDays - 1)) : undefined;
      const { sql: commonWhere, params: commonParams } = buildCalendarFilterClauses(asin, filter.marketplace, filter.date, fromDate);
      const { sql: eventWhere, params: eventParams } = buildWhere(
        whereEq("asin", asin),
        whereMarketplace("marketplace", filter.marketplace),
        whereLte("event_date", filter.date),
        whereGte("event_date", fromDate)
      );
      const { sql: actionWhere, params: actionParams } = buildWhere(
        whereEq("asin", asin),
        whereMarketplace("marketplace", filter.marketplace),
        whereLte("insight_date", filter.date),
        whereGte("insight_date", fromDate)
      );
      const { sql: signalWhere, params: signalParams } = buildWhere(
        whereEq("asin", asin),
        whereMarketplace("marketplace", filter.marketplace),
        whereLte("signal_date", filter.date),
        whereGte("signal_date", fromDate)
      );
      const { sql: bsrWhere, params: bsrParams } = buildWhere(
        whereEq("asin", asin),
        whereMarketplace("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );
      const { sql: changeWhere, params: changeParams } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("asin", asin),
        whereMarketplace("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );

      const scope = filter.orgId ?? null;
      const categoryRows = db.prepare(
        `SELECT * FROM amazon_bestseller_rank_snapshot
         ${commonWhere}
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM amazon_bestseller_category_monitor m
           WHERE m.id = amazon_bestseller_rank_snapshot.category_id AND m.org_id = ?
         ))
         ORDER BY snapshot_date DESC, rank_no ASC`
      ).all(...commonParams, scope, scope) as unknown as BestsellerSnapshotRow[];

      const keywordRows = db.prepare(
        `SELECT * FROM amazon_keyword_serp_snapshot
         ${commonWhere}
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM amazon_keyword_monitor m
           WHERE m.id = amazon_keyword_serp_snapshot.keyword_id AND m.org_id = ?
         ))
         ORDER BY snapshot_date DESC, absolute_rank ASC`
      ).all(...commonParams, scope, scope) as unknown as SnapshotRow[];

      const eventRows = db.prepare(
        `SELECT * FROM amazon_competitor_activity_event
         ${eventWhere}
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM amazon_bestseller_category_monitor m
           WHERE m.id = amazon_competitor_activity_event.category_id AND m.org_id = ?
         ))
         ORDER BY event_date DESC, id DESC`
      ).all(...eventParams, scope, scope) as unknown as ActivityEventRow[];

      const actionRows = db.prepare(
        `SELECT * FROM amazon_competitor_action_insight
         ${actionWhere}
         AND (? IS NULL OR (
           (source_type = 'keyword_detail' AND EXISTS (
             SELECT 1 FROM amazon_keyword_monitor m
             WHERE m.id = amazon_competitor_action_insight.source_id AND m.org_id = ?
           )) OR
           (source_type = 'category_bestseller' AND EXISTS (
             SELECT 1 FROM amazon_bestseller_category_monitor m
             WHERE m.id = amazon_competitor_action_insight.source_id AND m.org_id = ?
           ))
         ))
         ORDER BY insight_date DESC,
          CASE confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
          id DESC`
      ).all(...actionParams, scope, scope, scope) as unknown as ActionInsightRow[];

      const signalRows = db.prepare(
        `SELECT * FROM amazon_competitor_signal_log
         ${signalWhere}
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM amazon_bestseller_category_monitor m
           WHERE m.id = amazon_competitor_signal_log.category_id AND m.org_id = ?
         ))
         ORDER BY signal_date DESC, id DESC`
      ).all(...signalParams, scope, scope) as unknown as CategorySignalRow[];

      const bsrRows = db.prepare(
        `SELECT * FROM amazon_bsr_rank_history
         ${bsrWhere}
         AND (? IS NULL OR (
           (source_type = 'keyword_detail' AND EXISTS (
             SELECT 1 FROM amazon_keyword_monitor m
             WHERE m.id = amazon_bsr_rank_history.source_id AND m.org_id = ?
           )) OR
           (source_type = 'category_bestseller' AND EXISTS (
             SELECT 1 FROM amazon_bestseller_category_monitor m
             WHERE m.id = amazon_bsr_rank_history.source_id AND m.org_id = ?
           ))
         ))
         ORDER BY snapshot_date DESC, rank_no ASC`
      ).all(...bsrParams, scope, scope, scope) as unknown as BsrRankHistoryRow[];

      const priceRows = db.prepare(
        `SELECT * FROM amazon_product_price_history
         ${commonWhere}
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM amazon_bestseller_category_monitor m
           WHERE m.id = amazon_product_price_history.category_id AND m.org_id = ?
         ))
         ORDER BY snapshot_date DESC`
      ).all(...commonParams, scope, scope) as unknown as ProductPriceHistoryRow[];

      const changeRows = db.prepare(
        `SELECT * FROM amazon_competitor_daily_change
         ${changeWhere}
         ORDER BY snapshot_date DESC`
      ).all(...changeParams) as unknown as ChangeRow[];

      const categorySnapshots = sanitizeBestsellerSnapshotRows(db, categoryRows).map(mapBestsellerSnapshot);
      const keywordSnapshots = keywordRows.map(mapSnapshot);
      const events = eventRows.map(mapActivityEvent).filter(shouldExposeActivityEvent);
      const actionInsights = actionRows.map(mapActionInsight);
      const signals = signalRows.map(mapCategorySignal);
      const bsrRanks = bsrRows.map(mapBsrRankHistory);
      const priceHistory = priceRows.map((row) => sanitizeProductPriceHistory(mapProductPriceHistory(row)));
      const keywordChanges = changeRows.map(mapChange);
      const dates = Array.from(
        new Set([
          ...categorySnapshots.map((item) => item.snapshotDate),
          ...keywordSnapshots.map((item) => item.snapshotDate),
          ...events.map((item) => item.eventDate),
          ...signals.map((item) => item.signalDate),
          ...bsrRanks.map((item) => item.snapshotDate),
          ...priceHistory.map((item) => item.snapshotDate),
          ...keywordChanges.map((item) => item.snapshotDate)
        ])
      ).sort((a, b) => b.localeCompare(a));
      const days = dates.slice(0, limitDays).map((date) =>
        buildProductActivityDay({
          asin,
          date,
          categorySnapshots,
          keywordSnapshots,
          events,
          actionInsights,
          signals,
          bsrRanks,
          priceHistory,
          keywordChanges
        })
      );
      const identity = resolveProductIdentity(asin, categorySnapshots, keywordSnapshots, priceHistory, events);
      if (!identity && days.length === 0) {
        return null;
      }
      return {
        asin,
        marketplace: identity?.marketplace ?? filter.marketplace ?? "amazon.com",
        title: identity?.title ?? null,
        brand: identity?.brand ?? null,
        imageUrl: identity?.imageUrl ?? null,
        productUrl: identity?.productUrl ?? null,
        summary: buildProductActivitySummary(days),
        days,
        insightEvents: []
      };
    }
  };
}
