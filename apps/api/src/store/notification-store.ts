import type { DatabaseSync } from "node:sqlite";
import type { NotificationSchedule, NotificationScheduleInput } from "@amazon-monitor/shared";
import {
  mapNotificationSchedule,
  mapNotificationSendLog,
  type NotificationScheduleRow,
  type NotificationSendLogRow
} from "./operational-mappers.js";
import { clampLimit, clampOffset, nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";
import { validateNotificationInput } from "./validation.js";

type NotificationStoreMethods = Pick<
  Store,
  | "createNotificationSchedule"
  | "updateNotificationSchedule"
  | "deleteNotificationSchedule"
  | "getNotificationSchedule"
  | "listNotificationSchedules"
  | "markNotificationScheduleSent"
  | "insertNotificationSendLog"
  | "listNotificationSendLogs"
>;

export function createNotificationStore(db: DatabaseSync): NotificationStoreMethods {
  return {
    createNotificationSchedule(input) {
      validateNotificationInput(input);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_schedule
           (name, channel, target, send_time, timezone, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name.trim(),
          input.channel,
          input.target.trim(),
          input.sendTime,
          input.timezone || "Asia/Shanghai",
          input.status === "disabled" ? "disabled" : "enabled",
          now,
          now
        );
      return getNotificationSchedule(db, Number(result.lastInsertRowid))!;
    },

    updateNotificationSchedule(id, input) {
      const current = getNotificationSchedule(db, id);
      if (!current) {
        throw new Error(`Notification schedule ${id} not found`);
      }
      const next: NotificationScheduleInput = {
        name: input.name ?? current.name,
        channel: input.channel ?? current.channel,
        target: input.target ?? current.target,
        sendTime: input.sendTime ?? current.sendTime,
        timezone: input.timezone ?? current.timezone,
        status: input.status ?? current.status
      };
      validateNotificationInput(next);
      db.prepare(
        `UPDATE amazon_notification_schedule
         SET name = ?, channel = ?, target = ?, send_time = ?, timezone = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.name.trim(),
        next.channel,
        next.target.trim(),
        next.sendTime,
        next.timezone || "Asia/Shanghai",
        next.status ?? "enabled",
        nowIso(),
        id
      );
      return getNotificationSchedule(db, id)!;
    },

    deleteNotificationSchedule(id) {
      db.prepare("DELETE FROM amazon_notification_schedule WHERE id = ?").run(id);
    },

    getNotificationSchedule(id) {
      return getNotificationSchedule(db, id);
    },

    listNotificationSchedules() {
      return (
        db.prepare("SELECT * FROM amazon_notification_schedule ORDER BY status DESC, send_time ASC, id DESC").all() as unknown as NotificationScheduleRow[]
      ).map(mapNotificationSchedule);
    },

    markNotificationScheduleSent(id, input) {
      db.prepare(
        `UPDATE amazon_notification_schedule
         SET last_sent_at = ?, last_sent_date = ?, last_status = ?, last_error = ?, updated_at = ?
         WHERE id = ?`
      ).run(input.sentAt, input.sentDate, input.status, input.errorMessage ?? null, nowIso(), id);
    },

    insertNotificationSendLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_send_log
           (schedule_id, schedule_name, channel, target, report_date, status, message, error_message, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.scheduleId,
          input.scheduleName,
          input.channel,
          input.target,
          input.reportDate,
          input.status,
          input.message,
          input.errorMessage,
          input.sentAt
        );
      return mapNotificationSendLog(
        db.prepare("SELECT * FROM amazon_notification_send_log WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as NotificationSendLogRow
      );
    },

    listNotificationSendLogs(limit = 50, offset = 0) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      return (
        db.prepare("SELECT * FROM amazon_notification_send_log ORDER BY id DESC LIMIT ? OFFSET ?").all(clamped, off) as unknown as NotificationSendLogRow[]
      ).map(mapNotificationSendLog);
    }
  };
}

function getNotificationSchedule(db: DatabaseSync, id: number): NotificationSchedule | null {
  const row = db.prepare("SELECT * FROM amazon_notification_schedule WHERE id = ?").get(id) as NotificationScheduleRow | undefined;
  return row ? mapNotificationSchedule(row) : null;
}
