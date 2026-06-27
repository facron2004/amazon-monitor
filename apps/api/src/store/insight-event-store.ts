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
  | "listTopInsights"
  | "getInsightEvent"
  | "upsertInsightEvent"
  | "updateInsightEventStatus"
  | "updateInsightEventNote"
  | "updateInsightEventAssignee"
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
  assignee: string | null;
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

    /**
     * Dashboard "今日必须关注 N 件事" feed: returns the highest-priority
     * actionable events for a given date, deduping to one entry per ASIN
     * (the highest-scoring event wins when one ASIN has multiple triggers).
     *
     * Sorting precedence:
     *   1. event_level weight (P0 > P1 > P2)
     *   2. isCoreCompetitor events get a +1 tier boost
     *   3. absolute rankChange (large movers first)
     *   4. eventType priority (COUPON_ADDED, PRICE_DROP, RANK_SURGE,
     *      NEW_PRODUCT_BREAKOUT, LOW_REVIEW_HIGH_RANK, CORE_COMPETITOR_RISK)
     *   5. score_total as final tiebreaker
     */
    listTopInsights(date, limit = 5) {
      const cap = clampLimit(limit);
      const rows = db
        .prepare(
          `SELECT * FROM insight_events
           WHERE event_date = ?
            AND status IN ('TODO','WATCHING','REVIEW_PENDING','REVIEWED')
            AND asin IS NOT NULL
           ORDER BY
            CASE event_level WHEN 'P0' THEN 3 WHEN 'P1' THEN 2 ELSE 1 END DESC,
            score_total DESC,
            updated_at DESC,
            id ASC
           ${cap > 0 ? `LIMIT ${cap * 4}` : ""}`
        )
        .all(date) as unknown as InsightEventRow[];
      const mapped = rows.map(mapInsightEvent);

      const TYPE_PRIORITY: Partial<Record<InsightEvent["eventType"], number>> = {
        CORE_COMPETITOR_RISK: 7,
        LOW_REVIEW_HIGH_RANK: 6,
        NEW_PRODUCT_BREAKOUT: 5,
        COUPON_ADDED: 4,
        PRICE_DROP: 4,
        RANK_SURGE: 3
      };
      const LEVEL_WEIGHT: Record<InsightEvent["eventLevel"], number> = { P0: 3, P1: 2, P2: 1 };

      type Scored = { event: InsightEvent; score: number };
      const scored: Scored[] = mapped.map((event) => {
        const rankBoost = Math.abs(event.evidence.rankChange ?? 0) / 50;
        const typeBoost = TYPE_PRIORITY[event.eventType] ?? 0;
        const coreBoost = event.evidence.isCoreCompetitor ? 1 : 0;
        // Composite score: level weight (3) * 10 + type priority + rank boost + core flag.
        // 30 / 30 / 10 / 1 are the maximum contributions.
        const score = LEVEL_WEIGHT[event.eventLevel] * 10 + typeBoost + rankBoost + coreBoost;
        return { event, score };
      });
      scored.sort((left, right) => {
        const primary = right.score - left.score;
        if (primary !== 0) return primary;
        return right.event.scoreTotal - left.event.scoreTotal;
      });

      // Dedup by ASIN — keep the first (highest-scored) entry per ASIN.
      const seen = new Set<string>();
      const result: InsightEvent[] = [];
      for (const entry of scored) {
        const asin = entry.event.asin;
        if (asin === null || seen.has(asin)) continue;
        seen.add(asin);
        result.push(entry.event);
        if (result.length >= cap) break;
      }
      return result;
    },

    upsertInsightEvent(event) {
      const now = nowIso();
      const createdAt = event.createdAt ?? now;
      const updatedAt = event.updatedAt ?? now;
      db.prepare(
        `INSERT INTO insight_events
         (id, event_date, asin, brand, category_id, keyword_id, event_type, event_level, event_title,
          event_summary, attribution_tags_json, evidence_json, score_total, score_level, score_breakdown_json,
          suggested_action, status, assignee, review_due_date, review_result, user_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          assignee = COALESCE(excluded.assignee, insight_events.assignee),
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
        normalizeAssignee(event.assignee ?? null),
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

    updateInsightEventAssignee(id, assignee) {
      db.prepare("UPDATE insight_events SET assignee = ?, updated_at = ? WHERE id = ?").run(normalizeAssignee(assignee), nowIso(), id);
      return this.getInsightEvent(id);
    },

    updateInsightEventNote(id, note) {
      const now = nowIso();
      // 同样把空字符串 / 纯空白归一为 null。但 null 在这里是"未提供"语义,
      // 不应覆盖已有的 user_note——否则前端清空输入框会把历史备注一并刷掉。
      // 只有真的提供了非空内容才执行 UPDATE + 写 history。
      const normalizedNote = note && note.trim().length > 0 ? note : null;
      if (normalizedNote === null) {
        return this.getInsightEvent(id);
      }
      withTransaction(db, () => {
        db.prepare("UPDATE insight_events SET user_note = ?, updated_at = ? WHERE id = ?").run(normalizedNote, now, id);
        db.prepare("INSERT INTO insight_event_notes (id, event_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
          randomUUID(),
          id,
          normalizedNote,
          now,
          now
        );
      });
      return this.getInsightEvent(id);
    },

    listReviewDueEvents(date) {
      // 状态白名单:只把系统仍然"需要自动复盘"的事件拉出来。
      // 之前 `status != 'REVIEWED'` 把 WATCHING / FOLLOWED / IGNORED 一并捞回,
      // 然后 markInsightEventReviewed 会把用户手动设的状态强制刷成 REVIEW_PENDING/REVIEWED,
      // 用户的"已忽略"决定被悄悄覆盖。
      const { sql: where, params } = buildWhere(
        whereLte("review_due_date", date),
        { clause: "review_due_date IS NOT NULL" },
        { clause: "status IN ('TODO','REVIEW_PENDING')" }
      );
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
          { clause: "status IN ('TODO','REVIEW_PENDING')" },
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
      // 把空字符串 / 纯空白归一为 null,避免 COALESCE 把现有 user_note 错刷成 ""。
      // (route 接收的 body.note 是 nullable 但用户可能传空字符串。)
      const normalizedNote = note && note.trim().length > 0 ? note : null;
      // 守卫用户手动设的状态:如果用户已经把事件标成 WATCHING / FOLLOWED / IGNORED,
      // 自动复盘不应覆盖他们的决定——但允许在原状态上记录 review_result / review_due_date。
      const current = this.getInsightEvent(id);
      if (!current) {
        return null;
      }
      const userStatus = new Set<InsightEvent["status"]>(["WATCHING", "FOLLOWED", "IGNORED"]);
      const shouldFlipStatus = !userStatus.has(current.status);
      const nextStatus: InsightEvent["status"] = shouldFlipStatus
        ? nextReviewDueDate ? "REVIEW_PENDING" : "REVIEWED"
        : current.status;
      withTransaction(db, () => {
        db.prepare(
          `UPDATE insight_events
           SET status = ?,
               review_result = ?,
               review_due_date = COALESCE(?, review_due_date),
               user_note = COALESCE(?, user_note),
               updated_at = ?
           WHERE id = ?`
        ).run(nextStatus, result, nextReviewDueDate, normalizedNote, now, id);
        if (normalizedNote) {
          db.prepare("INSERT INTO insight_event_notes (id, event_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
            randomUUID(),
            id,
            normalizedNote,
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
    assignee: row.assignee,
    reviewDueDate: row.review_due_date,
    reviewResult: row.review_result,
    userNote: row.user_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeAssignee(assignee: string | null): string | null {
  const trimmed = assignee?.trim();
  return trimmed ? trimmed : null;
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
