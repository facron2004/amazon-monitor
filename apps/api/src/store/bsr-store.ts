import type { DatabaseSync } from "node:sqlite";
import { mapBsrRankHistory, mapBsrSnapshotQuality, type BsrRankHistoryRow, type BsrSnapshotQualityRow } from "./bsr-mappers.js";
import { batchPreviousUsableBsrDates, batchScopesWithEarlierHistory } from "./bsr-history-queries.js";
import { buildBsrRankChanges, compareBsrRankChanges, groupBsrHistoryByScope } from "./bsr-rank-changes.js";
import { mapActionInsight, type ActionInsightRow } from "./competitor-mappers.js";
import {
  batchListUsableBsrRankHistoryByDates,
  listUsableBsrRankHistoryRows,
  replaceCompetitorActionInsightsForScope,
  upsertBsrSnapshotQuality,
  upsertBsrSnapshotQualityForScope
} from "./migrations.js";
import { buildWhere, clampLimit, clampOffset, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type BsrStoreMethods = Pick<
  Store,
  | "replaceBsrRankHistoryForDate"
  | "listBsrRankHistory"
  | "listBsrRankChanges"
  | "listBsrSnapshotQuality"
  | "recordBsrSnapshotQuality"
  | "replaceCompetitorActionInsights"
  | "listCompetitorActionInsights"
>;

export function createBsrStore(db: DatabaseSync): BsrStoreMethods {
  return {
    replaceBsrRankHistoryForDate(input) {
      const stmt = db.prepare(
        `INSERT INTO amazon_bsr_rank_history
         (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
          rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(snapshot_date, source_type, source_id, asin, category) DO UPDATE SET
          source_name = excluded.source_name,
          marketplace = excluded.marketplace,
          title = excluded.title,
          brand = excluded.brand,
          rank_no = excluded.rank_no,
          rank_url = excluded.rank_url,
          product_url = excluded.product_url,
          current_price = excluded.current_price,
          parent_rank = excluded.parent_rank,
          is_specific_rank = excluded.is_specific_rank`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_bsr_rank_history WHERE source_type = ? AND source_id = ? AND snapshot_date = ?").run(
          input.sourceType,
          input.sourceId,
          input.date
        );
        for (const item of input.items) {
          stmt.run(
            item.snapshotDate,
            item.sourceType,
            item.sourceId,
            item.sourceName,
            item.marketplace,
            item.asin,
            item.title,
            item.brand,
            item.category,
            item.rank,
            item.rankUrl,
            item.productUrl,
            item.currentPrice,
            item.parentRank,
            item.isSpecificRank ? 1 : 0
          );
        }
        upsertBsrSnapshotQualityForScope(db, input.sourceType, input.sourceId, input.date);
      });
    },

    listBsrRankHistory(filter = {}) {
      const { sql: where, params } = buildWhere(
        sourceOwnershipClause("h", filter.orgId),
        whereEq("h.snapshot_date", filter.date),
        whereEq("h.source_type", filter.sourceType),
        whereEq("h.source_id", filter.sourceId),
        whereEq("h.category", filter.category),
        whereEq("h.asin", filter.asin)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT h.* FROM amazon_bsr_rank_history h ${where}
             ORDER BY h.snapshot_date DESC, h.source_type, h.source_id, h.category, h.rank_no
             ${pagination}`
          )
          .all(...params) as unknown as BsrRankHistoryRow[]
      ).map(mapBsrRankHistory);
    },

    listBsrRankChanges(filter) {
      const today = listUsableBsrRankHistoryRows(db, {
        date: filter.date,
        sourceType: filter.sourceType,
        sourceId: filter.sourceId,
        category: filter.category
      }).filter((item) => sourceBelongsToOrganization(db, item.sourceType, item.sourceId, filter.orgId));
      if (today.length === 0) {
        return [];
      }

      // Batch: find the previous usable date for ALL scopes in one query
      const previousDateMap = batchPreviousUsableBsrDates(db, filter.date);

      // Batch: for scopes without a previous date, check if any earlier history exists
      const todayGroups = groupBsrHistoryByScope(today);
      const scopesMissingPrevious = new Set<string>();
      for (const scopeKey of todayGroups.keys()) {
        if (!previousDateMap.has(scopeKey)) {
          scopesMissingPrevious.add(scopeKey);
        }
      }
      const scopesWithEarlierHistory = scopesMissingPrevious.size > 0
        ? batchScopesWithEarlierHistory(db, filter.date)
        : new Set<string>();

      // Batch: collect unique previous dates and load all previous-day rows in one query
      const uniquePreviousDates = [...new Set(previousDateMap.values())];
      const allPreviousRows = batchListUsableBsrRankHistoryByDates(db, uniquePreviousDates);
      const previousRowsByScope = groupBsrHistoryByScope(allPreviousRows);

      const includeUnchanged = filter.includeUnchanged !== false;
      const changes = Array.from(todayGroups.values()).flatMap((currentScopeItems) => {
        const scope = currentScopeItems[0];
        const scopeKey = [scope.sourceType, scope.sourceId ?? "", scope.category].join("|");

        // If no previous usable date but earlier history exists, the data is not usable
        if (!previousDateMap.has(scopeKey) && scopesWithEarlierHistory.has(scopeKey)) {
          return [];
        }

        const previousDate = previousDateMap.get(scopeKey) ?? null;
        const previousScopeRows = previousDate
          ? (previousRowsByScope.get(scopeKey) ?? []).filter((row) => row.snapshotDate === previousDate)
          : [];

        return buildBsrRankChanges(filter.date, previousDate, currentScopeItems, previousScopeRows, includeUnchanged);
      });
      changes.sort(compareBsrRankChanges);
      const offset = clampOffset(filter.offset);
      return filter.limit ? changes.slice(offset, offset + clampLimit(filter.limit)) : changes;
    },

    listBsrSnapshotQuality(filter = {}) {
      const { sql: where, params } = buildWhere(
        sourceOwnershipClause("q", filter.orgId),
        whereEq("q.snapshot_date", filter.date),
        whereEq("q.source_type", filter.sourceType),
        whereEq("q.source_id", filter.sourceId),
        whereEq("q.category", filter.category),
        whereEq("q.quality_status", filter.qualityStatus)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      const orderBy = filter.qualityStatus
        ? "ORDER BY snapshot_date DESC, source_type, source_id, category"
        : `ORDER BY snapshot_date DESC,
              CASE quality_status WHEN 'partial' THEN 1 WHEN 'empty' THEN 2 ELSE 3 END,
              source_type,
              source_id,
              category`;
      return (
        db
          .prepare(
            `SELECT q.* FROM amazon_bsr_snapshot_quality q ${where}
             ${orderBy}
             ${pagination}`
          )
          .all(...params) as unknown as BsrSnapshotQualityRow[]
      ).map(mapBsrSnapshotQuality);
    },

    recordBsrSnapshotQuality(input) {
      upsertBsrSnapshotQuality(db, input, { preserveExistingOk: true });
    },

    replaceCompetitorActionInsights(input) {
      replaceCompetitorActionInsightsForScope(db, input);
    },

    listCompetitorActionInsights(filter = {}) {
      const { sql: where, params } = buildWhere(
        sourceOwnershipClause("i", filter.orgId),
        whereEq("i.insight_date", filter.date),
        whereEq("i.source_type", filter.sourceType),
        whereEq("i.source_id", filter.sourceId),
        whereEq("i.category", filter.category),
        whereEq("i.asin", filter.asin),
        whereEq("i.brand", filter.brand),
        whereEq("i.insight_type", filter.insightType)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT i.* FROM amazon_competitor_action_insight i ${where}
             ORDER BY insight_date DESC,
              CASE confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(current_rank, previous_rank, 999999) ASC,
              insight_type,
              COALESCE(asin, brand, '')
             ${pagination}`
          )
          .all(...params) as unknown as ActionInsightRow[]
      ).map(mapActionInsight);
    }
  };
}

function sourceOwnershipClause(alias: string, orgId?: number) {
  if (orgId === undefined) return undefined;
  return {
    clause: `(( ${alias}.source_type = 'keyword_detail' AND EXISTS (
      SELECT 1 FROM amazon_keyword_monitor km WHERE km.id = ${alias}.source_id AND km.org_id = ?
    )) OR ( ${alias}.source_type = 'category_bestseller' AND EXISTS (
      SELECT 1 FROM amazon_bestseller_category_monitor cm WHERE cm.id = ${alias}.source_id AND cm.org_id = ?
    )))`,
    params: [orgId, orgId]
  };
}

function sourceBelongsToOrganization(
  db: DatabaseSync,
  sourceType: "keyword_detail" | "category_bestseller",
  sourceId: number | null,
  orgId?: number
): boolean {
  if (orgId === undefined) return true;
  if (sourceId === null) return false;
  const table = sourceType === "keyword_detail" ? "amazon_keyword_monitor" : "amazon_bestseller_category_monitor";
  return db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND org_id = ?`).get(sourceId, orgId) !== undefined;
}
