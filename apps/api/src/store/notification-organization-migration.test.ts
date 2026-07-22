import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("notification organization migration", () => {
  it("backfills legacy schedules and logs to organization 1 and permits independent organization data", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE amazon_notification_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, channel TEXT NOT NULL,
        target TEXT NOT NULL, send_time TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        status TEXT NOT NULL DEFAULT 'enabled', last_sent_at TEXT, last_sent_date TEXT,
        last_status TEXT, last_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE amazon_notification_send_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, schedule_name TEXT NOT NULL,
        channel TEXT NOT NULL, target TEXT NOT NULL, report_date TEXT NOT NULL, status TEXT NOT NULL,
        message TEXT, error_message TEXT, sent_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO amazon_notification_schedule
        (id, name, channel, target, send_time, status)
      VALUES (8, 'Legacy schedule', 'email', 'legacy@example.com', '09:30', 'enabled');
      INSERT INTO amazon_notification_send_log
        (id, schedule_id, schedule_name, channel, target, report_date, status, message, sent_at)
      VALUES (9, 8, 'Legacy schedule', 'email', 'legacy@example.com', '2026-07-18', 'success', 'sent', '2026-07-18T01:30:00.000Z');
    `);

    initSchema(db);
    const store = createStore(db);
    expect(store.listNotificationSchedules(1)).toEqual([
      expect.objectContaining({ id: 8, orgId: 1, name: "Legacy schedule" })
    ]);
    expect(store.listNotificationSendLogs(50, 0, 1)).toEqual([
      expect.objectContaining({ id: 9, orgId: 1, scheduleId: 8 })
    ]);

    const secondOrg = store.createOrganization({ name: "Second notification organization" });
    const schedule = store.createNotificationSchedule({
      name: "Independent schedule",
      channel: "email",
      target: "second@example.com",
      sendTime: "09:30",
      status: "enabled"
    }, secondOrg.id);
    store.insertNotificationSendLog({
      orgId: secondOrg.id,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      channel: schedule.channel,
      target: schedule.target,
      reportDate: "2026-07-18",
      status: "success",
      message: "sent independently",
      errorMessage: null,
      sentAt: "2026-07-18T01:31:00.000Z"
    });
    expect(store.listNotificationSchedules(secondOrg.id)).toEqual([
      expect.objectContaining({ orgId: secondOrg.id, name: "Independent schedule" })
    ]);
    expect(store.listNotificationSendLogs(50, 0, secondOrg.id)).toEqual([
      expect.objectContaining({ orgId: secondOrg.id, message: "sent independently" })
    ]);
  });
});
