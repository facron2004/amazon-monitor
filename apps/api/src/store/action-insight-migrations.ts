import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { buildCompetitorActionInsights } from "@amazon-monitor/shared";
import type { BsrSourceType, CompetitorActionInsight, CompetitorActivityEvent } from "@amazon-monitor/shared";
import { buildBsrRankChanges } from "./bsr-rank-changes.js";
import { hasEarlierBsrHistory, previousUsableBsrDate } from "./bsr-history-queries.js";
import { listUsableBsrRankHistoryRows } from "./bsr-history-migrations.js";
import { mapActivityEvent, type ActivityEventRow } from "./snapshot-mappers.js";
import { shouldExposeActivityEvent } from "./review-guards.js";
import { withTransaction } from "./sql-utils.js";

export function dedupeActionInsightTargets(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_competitor_action_insight
     WHERE id NOT IN (
      SELECT MIN(id)
      FROM amazon_competitor_action_insight
      GROUP BY insight_date,
       source_type,
       COALESCE(source_id, -1),
       category,
       COALESCE(asin, 'brand:' || COALESCE(brand, '')),
       insight_type
     )`
  ).run();
}

export function ensureActionInsightTargetIndex(db: DatabaseSync): void {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_action_insight_unique_target
     ON amazon_competitor_action_insight (
      insight_date,
      source_type,
      COALESCE(source_id, -1),
      category,
      COALESCE(asin, 'brand:' || COALESCE(brand, '')),
      insight_type
     )`
  );
}

export function pruneLowQualityCategoryActionInsights(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_competitor_action_insight
     WHERE source_type = 'category_bestseller'
      AND EXISTS (
        SELECT 1
        FROM amazon_bsr_snapshot_quality q
        WHERE q.snapshot_date = amazon_competitor_action_insight.insight_date
          AND q.source_type = amazon_competitor_action_insight.source_type
          AND q.source_id = amazon_competitor_action_insight.source_id
          AND q.category = amazon_competitor_action_insight.category
          AND q.quality_status <> 'ok'
      )`
  ).run();
}

export function backfillCompetitorActionInsights(db: DatabaseSync): void {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM amazon_competitor_action_insight").get() as { count: number };
  if (existing.count > 0) {
    return;
  }

  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    upsertCompetitorActionInsights(db, buildCompetitorActionInsightsForScope(db, scope));
  }
}

export function refreshCategoryActionInsightsForQualityRules(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       WHERE source_type = 'category_bestseller'
       ORDER BY snapshot_date, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    replaceCompetitorActionInsightsForScope(db, {
      sourceType: scope.source_type,
      sourceId: scope.source_id,
      date: scope.snapshot_date,
      items: buildCompetitorActionInsightsForScope(db, scope)
    });
  }
}

export function refreshActionInsightsForTraceability(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    replaceCompetitorActionInsightsForScope(db, {
      sourceType: scope.source_type,
      sourceId: scope.source_id,
      date: scope.snapshot_date,
      items: buildCompetitorActionInsightsForScope(db, scope)
    });
  }
}

export function buildCompetitorActionInsightsForScope(
  db: DatabaseSync,
  scope: { snapshot_date: string; source_type: BsrSourceType; source_id: number | null }
): CompetitorActionInsight[] {
  if (!canWriteActionInsightsForScope(db, scope.source_type, scope.source_id, scope.snapshot_date)) {
    return [];
  }
  const sourceId = scope.source_id ?? undefined;
  const today = listUsableBsrRankHistoryRows(db, {
    date: scope.snapshot_date,
    sourceType: scope.source_type,
    sourceId
  });
  if (!today.length) {
    return [];
  }
  const previousDate = previousUsableBsrDate(db, {
    beforeDate: scope.snapshot_date,
    sourceType: scope.source_type,
    sourceId
  });
  if (
    !previousDate &&
    hasEarlierBsrHistory(db, {
      beforeDate: scope.snapshot_date,
      sourceType: scope.source_type,
      sourceId
    })
  ) {
    return [];
  }
  const yesterday = previousDate
    ? listUsableBsrRankHistoryRows(db, {
        date: previousDate,
        sourceType: scope.source_type,
        sourceId
      })
    : [];
  const activityEvents =
    scope.source_type === "category_bestseller" && scope.source_id !== null
      ? listActivityEventRows(db, { date: scope.snapshot_date, categoryId: scope.source_id })
      : [];
  return buildCompetitorActionInsights({
    date: scope.snapshot_date,
    bsrChanges: buildBsrRankChanges(scope.snapshot_date, previousDate, today, yesterday),
    activityEvents
  });
}

export function replaceCompetitorActionInsightsForScope(
  db: DatabaseSync,
  input: { sourceType: BsrSourceType; sourceId: number | null; date: string; items: CompetitorActionInsight[] }
): void {
  withTransaction(db, () => {
    if (input.sourceId === null) {
      db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = ? AND source_id IS NULL AND insight_date = ?").run(
        input.sourceType,
        input.date
      );
    } else {
      db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = ? AND source_id = ? AND insight_date = ?").run(
        input.sourceType,
        input.sourceId,
        input.date
      );
    }
    if (!canWriteActionInsightsForScope(db, input.sourceType, input.sourceId, input.date)) {
      return;
    }
    upsertCompetitorActionInsights(db, input.items);
  });
}

export function canWriteActionInsightsForScope(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null, date: string): boolean {
  if (sourceType !== "category_bestseller") {
    return true;
  }
  const sourceClause = sourceId === null ? "source_id IS NULL" : "source_id = ?";
  const params: SQLInputValue[] = sourceId === null ? [date, sourceType] : [date, sourceType, sourceId];
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN quality_status = 'ok' THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN quality_status <> 'ok' THEN 1 ELSE 0 END) AS bad_count
       FROM amazon_bsr_snapshot_quality
       WHERE snapshot_date = ? AND source_type = ? AND ${sourceClause}`
    )
    .get(...params) as { ok_count: number | null; bad_count: number | null } | undefined;
  return (row?.ok_count ?? 0) > 0 && (row?.bad_count ?? 0) === 0;
}

export function upsertCompetitorActionInsights(db: DatabaseSync, items: CompetitorActionInsight[]): void {
  if (!items.length) {
    return;
  }
  const stmt = db.prepare(
    `INSERT INTO amazon_competitor_action_insight
     (insight_date, previous_date, source_type, source_id, source_name, marketplace, category, asin, brand, title,
      insight_type, confidence, current_rank, previous_rank, rank_change, price, product_url, evidence, inferred_action, suggested_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO UPDATE SET
      previous_date = excluded.previous_date,
      source_name = excluded.source_name,
      marketplace = excluded.marketplace,
      brand = excluded.brand,
      title = excluded.title,
      confidence = excluded.confidence,
      current_rank = excluded.current_rank,
      previous_rank = excluded.previous_rank,
      rank_change = excluded.rank_change,
      price = excluded.price,
      product_url = excluded.product_url,
      evidence = excluded.evidence,
      inferred_action = excluded.inferred_action,
      suggested_response = excluded.suggested_response`
  );
  for (const item of items) {
    stmt.run(
      item.insightDate,
      item.previousDate ?? null,
      item.sourceType,
      item.sourceId,
      item.sourceName,
      item.marketplace,
      item.category,
      item.asin,
      item.brand,
      item.title,
      item.insightType,
      item.confidence,
      item.currentRank,
      item.previousRank,
      item.rankChange,
      item.price,
      item.productUrl,
      item.evidence,
      item.inferredAction,
      item.suggestedResponse
    );
  }
}

export function listActivityEventRows(db: DatabaseSync, filter: { date: string; categoryId: number }): CompetitorActivityEvent[] {
  return (
    db
      .prepare(
        `SELECT * FROM amazon_competitor_activity_event
         WHERE event_date = ? AND category_id = ?
         ORDER BY event_date DESC, id DESC`
      )
      .all(filter.date, filter.categoryId) as unknown as ActivityEventRow[]
  ).map(mapActivityEvent).filter(shouldExposeActivityEvent);
}
