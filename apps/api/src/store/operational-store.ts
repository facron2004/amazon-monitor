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
  | "insertDailyChanges"
  | "listDailyChanges"
  | "insertAlerts"
  | "listAlerts"
  | "updateAlertStatus"
  | "insertTaskLog"
  | "listTaskLogs"
  | "saveDailyReport"
  | "getDailyReport"
>;

export function createOperationalStore(db: DatabaseSync): OperationalStoreMethods {
  return {
    insertDailyChanges(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_daily_change
         (asin, keyword, marketplace, snapshot_date, yesterday_rank, today_rank, rank_change, yesterday_price,
          today_price, price_change, price_change_rate, yesterday_sponsored, today_sponsored, change_type, title, brand)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
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
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("keyword", filter.keyword));
      return (
        db.prepare(`SELECT * FROM amazon_competitor_daily_change ${where} ORDER BY created_at DESC, id DESC`).all(...params) as unknown as ChangeRow[]
      ).map(mapChange);
    },

    insertAlerts(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_alert_log
         (alert_date, alert_type, alert_level, keyword, asin, title, brand, alert_content, old_value, new_value, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
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
      const { sql: where, params } = buildWhere(whereEq("alert_date", filter.date), whereEq("status", filter.status), whereEq("keyword", filter.keyword));
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (db.prepare(`SELECT * FROM amazon_alert_log ${where} ORDER BY created_at DESC, id DESC ${pagination}`).all(...params) as unknown as AlertRow[]).map(
        mapAlert
      );
    },

    updateAlertStatus(id, status) {
      db.prepare("UPDATE amazon_alert_log SET status = ? WHERE id = ?").run(status, id);
      const row = db.prepare("SELECT * FROM amazon_alert_log WHERE id = ?").get(id) as AlertRow | undefined;
      return row ? mapAlert(row) : null;
    },

    insertTaskLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_collect_task_log
           (task_type, keyword_id, keyword, marketplace, status, start_time, end_time, page_count, success_count, fail_count, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
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

    listTaskLogs(limit = 50, offset = 0) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      return (db.prepare("SELECT * FROM amazon_collect_task_log ORDER BY id DESC LIMIT ? OFFSET ?").all(clamped, off) as unknown as TaskLogRow[]).map(mapTaskLog);
    },

    saveDailyReport(date, keyword, markdown) {
      db.prepare(
        `INSERT INTO amazon_daily_report (report_date, keyword, markdown, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(report_date, keyword) DO UPDATE SET markdown = excluded.markdown, updated_at = excluded.updated_at`
      ).run(date, keyword, markdown, nowIso());
    },

    getDailyReport(date, keyword) {
      if (keyword) {
        const row = db
          .prepare("SELECT markdown FROM amazon_daily_report WHERE report_date = ? AND keyword = ?")
          .get(date, keyword) as { markdown: string } | undefined;
        return row?.markdown ?? "";
      }
      const rows = db.prepare("SELECT markdown FROM amazon_daily_report WHERE report_date = ? ORDER BY keyword").all(date) as {
        markdown: string;
      }[];
      return rows.map((row) => row.markdown).join("\n\n---\n\n");
    }
  };
}
