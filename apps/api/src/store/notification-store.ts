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
    createNotificationSchedule(input, orgId = 1) {
      validateNotificationInput(input);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_schedule
           (org_id, name, channel, target, send_time, timezone, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orgId,
          input.name.trim(),
          input.channel,
          input.target.trim(),
          input.sendTime,
          input.timezone || "Asia/Shanghai",
          input.status === "disabled" ? "disabled" : "enabled",
          now,
          now
        );
      return getNotificationSchedule(db, Number(result.lastInsertRowid), orgId)!;
    },

    updateNotificationSchedule(id, input, orgId) {
      const current = getNotificationSchedule(db, id, orgId);
      if (!current) {
        throw Object.assign(new Error(`Notification schedule ${id} not found`), { statusCode: 404 });
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
         WHERE id = ? AND (? IS NULL OR org_id = ?)`
      ).run(
        next.name.trim(),
        next.channel,
        next.target.trim(),
        next.sendTime,
        next.timezone || "Asia/Shanghai",
        next.status ?? "enabled",
        nowIso(),
        id,
        orgId ?? null,
        orgId ?? null
      );
      return getNotificationSchedule(db, id, orgId)!;
    },

    deleteNotificationSchedule(id, orgId) {
      db.prepare("DELETE FROM amazon_notification_schedule WHERE id = ? AND (? IS NULL OR org_id = ?)")
        .run(id, orgId ?? null, orgId ?? null);
    },

    getNotificationSchedule(id, orgId) {
      return getNotificationSchedule(db, id, orgId);
    },

    listNotificationSchedules(orgId) {
      const rows = orgId === undefined
        ? db.prepare("SELECT * FROM amazon_notification_schedule ORDER BY status DESC, send_time ASC, id DESC").all()
        : db.prepare("SELECT * FROM amazon_notification_schedule WHERE org_id = ? ORDER BY status DESC, send_time ASC, id DESC").all(orgId);
      return (rows as unknown as NotificationScheduleRow[]).map(mapNotificationSchedule);
    },

    markNotificationScheduleSent(id, input, orgId) {
      db.prepare(
        `UPDATE amazon_notification_schedule
         SET last_sent_at = ?, last_sent_date = ?, last_status = ?, last_error = ?, updated_at = ?
         WHERE id = ? AND (? IS NULL OR org_id = ?)`
      ).run(input.sentAt, input.sentDate, input.status, input.errorMessage ?? null, nowIso(), id, orgId ?? null, orgId ?? null);
    },

    insertNotificationSendLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_send_log
           (org_id, schedule_id, schedule_name, channel, target, report_date, status, message, error_message, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.orgId,
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

    listNotificationSendLogs(limit = 50, offset = 0, orgId) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      const rows = orgId === undefined
        ? db.prepare("SELECT * FROM amazon_notification_send_log ORDER BY id DESC LIMIT ? OFFSET ?").all(clamped, off)
        : db.prepare("SELECT * FROM amazon_notification_send_log WHERE org_id = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(orgId, clamped, off);
      return (rows as unknown as NotificationSendLogRow[]).map(mapNotificationSendLog);
    }
  };
}

function getNotificationSchedule(db: DatabaseSync, id: number, orgId?: number): NotificationSchedule | null {
  const row = db.prepare("SELECT * FROM amazon_notification_schedule WHERE id = ? AND (? IS NULL OR org_id = ?)")
    .get(id, orgId ?? null, orgId ?? null) as NotificationScheduleRow | undefined;
  return row ? mapNotificationSchedule(row) : null;
}
