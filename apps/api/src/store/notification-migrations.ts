import type { DatabaseSync } from "node:sqlite";
import { ensureColumn } from "./migration-utils.js";

export function migrateNotificationOrganizationScope(db: DatabaseSync): void {
  ensureColumn(db, "amazon_notification_schedule", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_notification_send_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  db.exec(`
    DROP INDEX IF EXISTS idx_notification_schedule_due;
    DROP INDEX IF EXISTS idx_notification_send_log_schedule;
    DROP INDEX IF EXISTS idx_notification_send_log_org_date;
    CREATE INDEX idx_notification_schedule_due
      ON amazon_notification_schedule(org_id, status, send_time);
    CREATE INDEX idx_notification_send_log_schedule
      ON amazon_notification_send_log(org_id, schedule_id, report_date);
    CREATE INDEX idx_notification_send_log_org_date
      ON amazon_notification_send_log(org_id, report_date, id DESC);
  `);
}
