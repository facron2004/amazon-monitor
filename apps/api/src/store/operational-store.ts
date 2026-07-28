import type { DatabaseSync } from "node:sqlite";
import {
  mapAlert,
  mapChange,
  mapTaskLog,
  type AlertRow,
  type ChangeRow,
  type TaskLogRow
} from "./operational-mappers.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type OperationalStoreMethods = Pick<
  Store,
  | "deleteDailyChangesForKeywordDate"
  | "insertDailyChanges"
  | "listDailyChanges"
  | "deleteAlertsForKeywordDate"
  | "insertAlerts"
  | "listAlerts"
  | "updateAlertStatus"
  | "insertTaskLog"
  | "listTaskLogs"
  | "countTaskLogs"
  | "saveDailyReport"
  | "getDailyReport"
>;

export function createOperationalStore(db: DatabaseSync): OperationalStoreMethods {
  return {
    deleteDailyChangesForKeywordDate(keyword, date, orgId) {
      db.prepare(
        "DELETE FROM amazon_competitor_daily_change WHERE keyword = ? AND snapshot_date = ? AND (? IS NULL OR org_id = ?)"
      ).run(keyword, date, orgId ?? null, orgId ?? null);
    },

    insertDailyChanges(items, orgId = 1) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_daily_change
         (org_id, asin, keyword, marketplace, snapshot_date, yesterday_rank, today_rank, rank_change, yesterday_price,
          today_price, price_change, price_change_rate, yesterday_sponsored, today_sponsored, change_type, title, brand)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            orgId,
            item.asin,
            item.keyword,
            item.marketplace,
            item.snapshotDate,
            item.yesterdayRank,
            item.todayRank,
            item.rankChange,
            item.yesterdayPrice,
            item.todayPrice,
            item.priceChange,
            item.priceChangeRate,
            item.yesterdaySponsored === null ? null : item.yesterdaySponsored ? 1 : 0,
            item.todaySponsored === null ? null : item.todaySponsored ? 1 : 0,
            item.changeType,
            item.title,
            item.brand
          );
        }
      });
    },

    listDailyChanges(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("snapshot_date", filter.date),
        whereEq("keyword", filter.keyword)
      );
      return (
        db.prepare(`SELECT * FROM amazon_competitor_daily_change ${where} ORDER BY created_at DESC, id DESC`).all(...params) as unknown as ChangeRow[]
      ).map(mapChange);
    },

    deleteAlertsForKeywordDate(keyword, date, orgId) {
      db.prepare(
        "DELETE FROM amazon_alert_log WHERE keyword = ? AND alert_date = ? AND (? IS NULL OR org_id = ?)"
      ).run(keyword, date, orgId ?? null, orgId ?? null);
    },

    insertAlerts(items, orgId = 1) {
      const stmt = db.prepare(
        `INSERT INTO amazon_alert_log
         (org_id, alert_date, alert_type, alert_level, keyword, asin, title, brand, alert_content, old_value, new_value, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            orgId,
            item.alertDate,
            item.alertType,
            item.alertLevel,
            item.keyword,
            item.asin,
            item.title,
            item.brand,
            item.alertContent,
            item.oldValue,
            item.newValue,
            item.status
          );
        }
      });
    },

    listAlerts(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("alert_date", filter.date),
        whereEq("status", filter.status),
        whereEq("keyword", filter.keyword)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (db.prepare(`SELECT * FROM amazon_alert_log ${where} ORDER BY created_at DESC, id DESC ${pagination}`).all(...params) as unknown as AlertRow[]).map(
        mapAlert
      );
    },

    updateAlertStatus(id, status, orgId) {
      db.prepare("UPDATE amazon_alert_log SET status = ? WHERE id = ? AND (? IS NULL OR org_id = ?)")
        .run(status, id, orgId ?? null, orgId ?? null);
      const row = db.prepare("SELECT * FROM amazon_alert_log WHERE id = ? AND (? IS NULL OR org_id = ?)")
        .get(id, orgId ?? null, orgId ?? null) as AlertRow | undefined;
      return row ? mapAlert(row) : null;
    },

    insertTaskLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_collect_task_log
           (org_id, task_type, keyword_id, keyword, marketplace, status, start_time, end_time, page_count, success_count, fail_count, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.orgId ?? 1,
          input.taskType,
          input.keywordId,
          input.keyword,
          input.marketplace,
          input.status,
          input.startTime,
          input.endTime,
          input.pageCount,
          input.successCount,
          input.failCount,
          input.errorMessage,
          input.retryCount
        );
      return mapTaskLog(
        db.prepare("SELECT * FROM amazon_collect_task_log WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as TaskLogRow
      );
    },

    listTaskLogs(limit = 50, offset = 0, orgId) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      const rows = orgId === undefined
        ? db.prepare("SELECT * FROM amazon_collect_task_log ORDER BY id DESC LIMIT ? OFFSET ?").all(clamped, off)
        : db.prepare("SELECT * FROM amazon_collect_task_log WHERE org_id = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(orgId, clamped, off);
      return (rows as unknown as TaskLogRow[]).map(mapTaskLog);
    },

    countTaskLogs(orgId) {
      const row = orgId === undefined
        ? db.prepare("SELECT COUNT(*) AS total FROM amazon_collect_task_log").get()
        : db.prepare("SELECT COUNT(*) AS total FROM amazon_collect_task_log WHERE org_id = ?").get(orgId);
      return (row as { total: number } | undefined)?.total ?? 0;
    },

    saveDailyReport(date, keyword, markdown, orgId = 1) {
      db.prepare(
        `INSERT INTO amazon_daily_report (org_id, report_date, keyword, markdown, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(org_id, report_date, keyword) DO UPDATE SET markdown = excluded.markdown, updated_at = excluded.updated_at`
      ).run(orgId, date, keyword, markdown, nowIso());
    },

    getDailyReport(date, keyword, orgId) {
      if (keyword) {
        const row = db
          .prepare("SELECT markdown FROM amazon_daily_report WHERE report_date = ? AND keyword = ? AND (? IS NULL OR org_id = ?)")
          .get(date, keyword, orgId ?? null, orgId ?? null) as { markdown: string } | undefined;
        return row?.markdown ?? "";
      }
      const rows = db.prepare(
        "SELECT markdown FROM amazon_daily_report WHERE report_date = ? AND (? IS NULL OR org_id = ?) ORDER BY keyword"
      ).all(date, orgId ?? null, orgId ?? null) as {
        markdown: string;
      }[];
      return rows.map((row) => row.markdown).join("\n\n---\n\n");
    }
  };
}
