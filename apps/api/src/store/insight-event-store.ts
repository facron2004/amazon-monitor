import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  AsinWatchState,
  InsightEvent,
  InsightEventInput,
  InsightEvidence,
  InsightScoreBreakdown
} from "@amazon-monitor/shared";
import { parseJsonArray } from "./json-utils.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, whereLte, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type InsightEventStoreMethods = Pick<
  Store,
  | "listInsightEvents"
  | "getInsightEvent"
  | "upsertInsightEvent"
  | "updateInsightEventStatus"
  | "updateInsightEventNote"
  | "listReviewDueEvents"
  | "claimReviewDueEvents"
  | "releaseReviewClaim"
  | "markInsightEventReviewed"
  | "listAsinWatchStates"
  | "upsertAsinWatchState"
>;

interface InsightEventRow {
  id: string;
  event_date: string;
  asin: string | null;
  brand: string | null;
  category_id: number | null;
  keyword_id: number | null;
  event_type: InsightEvent["eventType"];
  event_level: InsightEvent["eventLevel"];
  event_title: string;
  event_summary: string;
  attribution_tags_json: string;
  evidence_json: string;
  score_total: number;
  score_level: InsightEvent["scoreLevel"];
  score_breakdown_json: string;
  suggested_action: string;
  status: InsightEvent["status"];
  review_due_date: string | null;
  review_result: InsightEvent["reviewResult"];
  user_note: string | null;
  created_at: string;
  updated_at: string;
}

interface AsinWatchStateRow {
  asin: string;
  watch_level: AsinWatchState["watchLevel"];
  watch_reason: string | null;
  first_watch_date: string;
  last_event_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const emptyBreakdown: InsightScoreBreakdown = {
  rankingScore: 0,
  productScore: 0,
  promoScore: 0,
  brandScore: 0,
  riskScore: 0,
  reasons: []
};

export function createInsightEventStore(db: DatabaseSync): InsightEventStoreMethods {
  return {
    listInsightEvents(params = {}) {
      const { sql: where, params: queryParams } = buildWhere(
        whereEq("event_date", params.date),
        whereEq("status", params.status),
        whereEq("event_level", params.level),
        whereEq("event_type", params.eventType),
        whereEq("category_id", params.categoryId),
        whereEq("keyword_id", params.keywordId),
        whereEq("brand", params.brand),
        whereEq("asin", params.asin)
      );
      const limit = clampLimit(params.limit ?? 50);
      const offset = clampOffset(params.offset);
      const pagination = limit > 0
        ? (offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT * FROM insight_events ${where}
             ORDER BY event_date DESC,
              CASE event_level WHEN 'P0' THEN 3 WHEN 'P1' THEN 2 ELSE 1 END DESC,
              score_total DESC,
              updated_at DESC,
              id ASC
             ${pagination}`
          )
          .all(...queryParams) as unknown as InsightEventRow[]
      ).map(mapInsightEvent);
    },

    getInsightEvent(id) {
      const row = db.prepare("SELECT * FROM insight_events WHERE id = ?").get(id) as InsightEventRow | undefined;
      return row ? mapInsightEvent(row) : null;
    },

    upsertInsightEvent(event) {
      const now = nowIso();
      const createdAt = event.createdAt ?? now;
      const updatedAt = event.updatedAt ?? now;
      db.prepare(
        `INSERT INTO insight_events
         (id, event_date, asin, brand, category_id, keyword_id, event_type, event_level, event_title,
          event_summary, attribution_tags_json, evidence_json, score_total, score_level, score_breakdown_json,
          suggested_action, status, review_due_date, review_result, user_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          event_date = excluded.event_date,
          asin = excluded.asin,
          brand = excluded.brand,
          category_id = excluded.category_id,
          keyword_id = excluded.keyword_id,
          event_type = excluded.event_type,
          event_level = excluded.event_level,
          event_title = excluded.event_title,
          event_summary = excluded.event_summary,
          attribution_tags_json = excluded.attribution_tags_json,
          evidence_json = excluded.evidence_json,
          score_total = excluded.score_total,
          score_level = excluded.score_level,
          score_breakdown_json = excluded.score_breakdown_json,
          suggested_action = excluded.suggested_action,
          review_due_date = COALESCE(insight_events.review_due_date, excluded.review_due_date),
          updated_at = excluded.updated_at`
      ).run(
        event.id,
        event.eventDate,
        event.asin,
        event.brand,
        event.categoryId,
        event.keywordId,
        event.eventType,
        event.eventLevel,
        event.eventTitle,
        event.eventSummary,
        JSON.stringify(event.attributionTags),
        JSON.stringify(event.evidence),
        event.scoreTotal,
        event.scoreLevel,
        JSON.stringify(event.scoreBreakdown),
        event.suggestedAction,
        event.status,
        event.reviewDueDate,
        event.reviewResult,
        event.userNote,
        createdAt,
        updatedAt
      );
      return this.getInsightEvent(event.id)!;
    },

    updateInsightEventStatus(id, status, reviewDueDate) {
      if (reviewDueDate !== undefined) {
        db.prepare("UPDATE insight_events SET status = ?, review_due_date = ?, updated_at = ? WHERE id = ?").run(status, reviewDueDate, nowIso(), id);
      } else {
        db.prepare("UPDATE insight_events SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
      }
      return this.getInsightEvent(id);
    },

    updateInsightEventNote(id, note) {
      const now = nowIso();
      withTransaction(db, () => {
        db.prepare("UPDATE insight_events SET user_note = ?, updated_at = ? WHERE id = ?").run(note, now, id);
        db.prepare("INSERT INTO insight_event_notes (id, event_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
          randomUUID(),
          id,
          note,
          now,
          now
        );
      });
      return this.getInsightEvent(id);
    },

    listReviewDueEvents(date) {
      const { sql: where, params } = buildWhere(whereLte("review_due_date", date), { clause: "review_due_date IS NOT NULL" }, {
        clause: "status != 'REVIEWED'"
      });
      return (
        db
          .prepare(
            `SELECT * FROM insight_events ${where}
             ORDER BY review_due_date ASC,
              CASE event_level WHEN 'P0' THEN 3 WHEN 'P1' THEN 2 ELSE 1 END DESC,
              score_total DESC`
          )
          .all(...params) as unknown as InsightEventRow[]
      ).map(mapInsightEvent);
    },

    /**
     * 原子认领一批 due events 用于复盘:在单个事务内 INSERT INTO insight_review_claims,
     * 避免两个 evaluator / 一次 worker 重启重复评同一批。已存在的 claim 行不重复插入
     * (INSERT OR IGNORE),所以同一 due event 不会被两个 claim_id 同时拿到。
     *
     * 在执行 claim 之前会清理 claimed_at 超过 1 小时的 stale claims(防止 evaluator 中途
     * 崩溃把事件永久卡在 in-flight 状态)。
     */
    claimReviewDueEvents(date, claimId, options = {}) {
      const limit = clampLimit(options.limit ?? 200);
      const claimed: InsightEvent[] = [];
      withTransaction(db, () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        db.prepare("DELETE FROM insight_review_claims WHERE claimed_at < ?").run(oneHourAgo);
        const { sql: where, params: whereParams } = buildWhere(
          whereLte("review_due_date", date),
          { clause: "review_due_date IS NOT NULL" },
          { clause: "status != 'REVIEWED'" },
          options.categoryId !== undefined ? whereEq("category_id", options.categoryId) : null,
          { clause: "NOT EXISTS (SELECT 1 FROM insight_review_claims c WHERE c.event_id = insight_events.id)" }
        );
        // SQLite INSERT ... SELECT ... ON CONFLICT IGNORE — atomic per-row claim
        db.prepare(
          `INSERT OR IGNORE INTO insight_review_claims (event_id, claimed_at, claim_id)
           SELECT id, ?, ? FROM insight_events ${where} ${limit > 0 ? `LIMIT ${limit}` : ""}`
        ).run(nowIso(), claimId, ...whereParams);
        const rows = db
          .prepare(
            `SELECT ie.* FROM insight_events ie
             INNER JOIN insight_review_claims c ON c.event_id = ie.id
             WHERE c.claim_id = ?
             ORDER BY ie.review_due_date ASC,
              CASE ie.event_level WHEN 'P0' THEN 3 WHEN 'P1' THEN 2 ELSE 1 END DESC,
              ie.score_total DESC`
          )
          .all(claimId) as unknown as InsightEventRow[];
        for (const row of rows) {
          claimed.push(mapInsightEvent(row));
        }
      });
      return claimed;
    },

    releaseReviewClaim(claimId) {
      db.prepare("DELETE FROM insight_review_claims WHERE claim_id = ?").run(claimId);
    },

    markInsightEventReviewed(id, result, note, nextReviewDueDate = null) {
      const now = nowIso();
      const nextStatus: InsightEvent["status"] = nextReviewDueDate ? "REVIEW_PENDING" : "REVIEWED";
      withTransaction(db, () => {
        db.prepare("UPDATE insight_events SET status = ?, review_result = ?, review_due_date = COALESCE(?, review_due_date), user_note = COALESCE(?, user_note), updated_at = ? WHERE id = ?").run(
          nextStatus,
          result,
          nextReviewDueDate,
          note ?? null,
          now,
          id
        );
        if (note) {
          db.prepare("INSERT INTO insight_event_notes (id, event_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
            randomUUID(),
            id,
            note,
            now,
            now
          );
        }
      });
      return this.getInsightEvent(id);
    },

    listAsinWatchStates() {
      return (
        db
          .prepare(
            `SELECT * FROM asin_watch_states
             ORDER BY CASE watch_level WHEN 'CORE' THEN 1 WHEN 'POTENTIAL' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
              COALESCE(last_event_date, first_watch_date) DESC,
              asin`
          )
          .all() as unknown as AsinWatchStateRow[]
      ).map(mapAsinWatchState);
    },

    upsertAsinWatchState(state) {
      const now = nowIso();
      const createdAt = state.createdAt ?? now;
      const updatedAt = state.updatedAt ?? now;
      db.prepare(
        `INSERT INTO asin_watch_states
         (asin, watch_level, watch_reason, first_watch_date, last_event_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asin) DO UPDATE SET
          watch_level = excluded.watch_level,
          watch_reason = excluded.watch_reason,
          last_event_date = excluded.last_event_date,
          note = COALESCE(excluded.note, asin_watch_states.note),
          updated_at = excluded.updated_at`
      ).run(
        state.asin,
        state.watchLevel,
        state.watchReason,
        state.firstWatchDate,
        state.lastEventDate,
        state.note,
        createdAt,
        updatedAt
      );
      const row = db.prepare("SELECT * FROM asin_watch_states WHERE asin = ?").get(state.asin) as AsinWatchStateRow | undefined;
      if (!row) {
        throw new Error(`ASIN watch state ${state.asin} not found after upsert`);
      }
      return mapAsinWatchState(row);
    }
  };
}

function mapInsightEvent(row: InsightEventRow): InsightEvent {
  return {
    id: row.id,
    eventDate: row.event_date,
    asin: row.asin,
    brand: row.brand,
    categoryId: row.category_id,
    keywordId: row.keyword_id,
    eventType: row.event_type,
    eventLevel: row.event_level,
    eventTitle: row.event_title,
    eventSummary: row.event_summary,
    attributionTags: parseJsonArray<InsightEvent["attributionTags"][number]>(row.attribution_tags_json),
    evidence: parseJsonObject<InsightEvidence>(row.evidence_json, { marketplace: "", evidenceItems: [] }),
    scoreTotal: row.score_total,
    scoreLevel: row.score_level,
    scoreBreakdown: parseJsonObject<InsightScoreBreakdown>(row.score_breakdown_json, emptyBreakdown),
    suggestedAction: row.suggested_action,
    status: row.status,
    reviewDueDate: row.review_due_date,
    reviewResult: row.review_result,
    userNote: row.user_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAsinWatchState(row: AsinWatchStateRow): AsinWatchState {
  return {
    asin: row.asin,
    watchLevel: row.watch_level,
    watchReason: row.watch_reason,
    firstWatchDate: row.first_watch_date,
    lastEventDate: row.last_event_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
