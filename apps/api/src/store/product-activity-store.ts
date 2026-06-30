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
import { buildCalendarFilterClauses, buildWhere, whereEq, whereGte, whereLte } from "./sql-utils.js";
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
        whereEq("marketplace", filter.marketplace),
        whereLte("event_date", filter.date),
        whereGte("event_date", fromDate)
      );
      const { sql: actionWhere, params: actionParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("insight_date", filter.date),
        whereGte("insight_date", fromDate)
      );
      const { sql: signalWhere, params: signalParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("signal_date", filter.date),
        whereGte("signal_date", fromDate)
      );
      const { sql: bsrWhere, params: bsrParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );
      const { sql: changeWhere, params: changeParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );

      const categoryRows = db
        .prepare(
          `SELECT * FROM amazon_bestseller_rank_snapshot
           ${commonWhere}
           ORDER BY snapshot_date DESC, rank_no ASC`
        )
        .all(...commonParams) as unknown as BestsellerSnapshotRow[];

      const keywordRows = db
        .prepare(
          `SELECT * FROM amazon_keyword_serp_snapshot
           ${commonWhere}
           ORDER BY snapshot_date DESC, absolute_rank ASC`
        )
        .all(...commonParams) as unknown as SnapshotRow[];

      const eventRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_activity_event
           ${eventWhere}
           ORDER BY event_date DESC, id DESC`
        )
        .all(...eventParams) as unknown as ActivityEventRow[];

      const actionRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_action_insight
           ${actionWhere}
           ORDER BY insight_date DESC,
            CASE confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
            id DESC`
        )
        .all(...actionParams) as unknown as ActionInsightRow[];

      const signalRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_signal_log
           ${signalWhere}
           ORDER BY signal_date DESC, id DESC`
        )
        .all(...signalParams) as unknown as CategorySignalRow[];

      const bsrRows = db
        .prepare(
          `SELECT * FROM amazon_bsr_rank_history
           ${bsrWhere}
           ORDER BY snapshot_date DESC, rank_no ASC`
        )
        .all(...bsrParams) as unknown as BsrRankHistoryRow[];

      const priceRows = db
        .prepare(
          `SELECT * FROM amazon_product_price_history
           ${commonWhere}
           ORDER BY snapshot_date DESC`
        )
        .all(...commonParams) as unknown as ProductPriceHistoryRow[];

      const changeRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_daily_change
           ${changeWhere}
           ORDER BY snapshot_date DESC`
        )
        .all(...changeParams) as unknown as ChangeRow[];

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
        days
      };
    }
  };
}
