import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { NotificationSchedule } from "@amazon-monitor/shared";
import { createApiApp } from "./server.js";
import { createStore, initSchema } from "./store.js";
import { buildReportExcelDownloadUrl, resolveSmtpConfig, sendDueNotificationSchedules, sendNotificationSchedule, type NotificationSender } from "./notifier.js";
import { DAILY_REPORT_SHEET_NAMES, getWorkbookSheetNames, readZipText } from "./test-support/xlsx.js";

interface RecordedAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

class RecordingNotificationSender implements NotificationSender {
  sent: Array<{ schedule: NotificationSchedule; date: string; content: string; htmlContent?: string; attachments?: RecordedAttachment[] }> = [];

  async send(
    schedule: NotificationSchedule,
    date: string,
    content: string,
    htmlContent?: string,
    attachments?: RecordedAttachment[]
  ): Promise<{ message: string }> {
    this.sent.push({ schedule, date, content, htmlContent, attachments });
    return { message: `sent ${schedule.channel} ${date}` };
  }
}

describe("notification schedules", () => {
  it("resolves Gmail SMTP through the local HTTP proxy when available", () => {
    const config = resolveSmtpConfig({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "sender@gmail.com",
      SMTP_PASS: "secret",
      HTTPS_PROXY: "http://127.0.0.1:7890"
    } as NodeJS.ProcessEnv);

    expect(config.secure).toBe(true);
    expect(config.requireTLS).toBe(false);
    expect(config.proxy).toBe("http://127.0.0.1:7890");
    expect(config.transport.proxy).toBe("http://127.0.0.1:7890");
  });

  it("uses STARTTLS defaults for port 587 without forcing unrelated SMTP hosts through proxy", () => {
    const config = resolveSmtpConfig({
      SMTP_HOST: "smtp.qq.com",
      SMTP_PORT: "587",
      SMTP_USER: "sender@qq.com",
      SMTP_PASS: "secret",
      HTTP_PROXY: "http://127.0.0.1:7890"
    } as NodeJS.ProcessEnv);

    expect(config.secure).toBe(false);
    expect(config.requireTLS).toBe(true);
    expect(config.proxy).toBeUndefined();
  });

  it("builds a public Excel download URL for Feishu messages when PUBLIC_BASE_URL is configured", () => {
    expect(buildReportExcelDownloadUrl("2026-05-19", { PUBLIC_BASE_URL: "https://monitor.example.com/" } as NodeJS.ProcessEnv)).toBe(
      "https://monitor.example.com/api/reports/daily.xlsx?date=2026-05-19"
    );
    expect(buildReportExcelDownloadUrl("2026-05-19", {} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("creates a daily notification schedule, sends it manually, and stores send logs", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    store.saveDailyReport("2026-05-19", "cordless leaf blower", "# Report");
    const sender = new RecordingNotificationSender();
    const app = createApiApp(store, { notificationSender: sender });

    const created = await request(app)
      .post("/api/notifications/schedules")
      .send({
        name: "daily email",
        channel: "email",
        target: "ops@example.com",
        sendTime: "09:30",
        status: "enabled"
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: "daily email",
      channel: "email",
      target: "ops@example.com",
      sendTime: "09:30",
      status: "enabled"
    });

    const send = await request(app).post(`/api/notifications/schedules/${created.body.id}/send`).send({ date: "2026-05-19" }).expect(200);
    expect(send.body.status).toBe("success");
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].htmlContent).toContain("Excel");
    const attachment = sender.sent[0].attachments?.[0];
    expect(attachment?.filename).toBe("amazon-monitor-2026-05-19.xlsx");
    expect(attachment?.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(attachment?.content.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(getWorkbookSheetNames(attachment?.content ?? Buffer.alloc(0))).toEqual(DAILY_REPORT_SHEET_NAMES);
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet1.xml")).toContain("报告日期");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet11.xml")).toContain("唯一排名");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet13.xml")).toContain("对比日期");

    const schedules = await request(app).get("/api/notifications/schedules").expect(200);
    expect(schedules.body[0]).toMatchObject({ lastStatus: "success", lastSentDate: "2026-05-19" });

    const logs = await request(app).get("/api/notifications/logs").expect(200);
    expect(logs.body[0]).toMatchObject({
      scheduleId: created.body.id,
      channel: "email",
      target: "ops@example.com",
      reportDate: "2026-05-19",
      status: "success"
    });
  });

  it("sends due schedules after the configured minute and never repeats the same local day", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const sender = new RecordingNotificationSender();
    store.createNotificationSchedule({
      name: "daily catchup",
      channel: "email",
      target: "ops@example.com",
      sendTime: "09:30",
      timezone: "Asia/Shanghai",
      status: "enabled"
    });

    const beforeDue = await sendDueNotificationSchedules(store, new Date("2026-05-19T01:29:00.000Z"), sender);
    expect(beforeDue).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);

    const afterDue = await sendDueNotificationSchedules(store, new Date("2026-05-19T01:31:00.000Z"), sender);
    expect(afterDue).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ date: "2026-05-19" });
    expect(sender.sent[0].attachments?.[0]?.filename).toBe("amazon-monitor-2026-05-19.xlsx");

    const sameDayRepeat = await sendDueNotificationSchedules(store, new Date("2026-05-19T02:00:00.000Z"), sender);
    expect(sameDayRepeat).toHaveLength(0);
    expect(sender.sent).toHaveLength(1);
  });

  it("includes the Excel download link in Feishu notifications without pretending to attach a file", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const sender = new RecordingNotificationSender();
    const schedule = store.createNotificationSchedule({
      name: "daily feishu",
      channel: "feishu",
      target: "https://open.feishu.cn/open-apis/bot/v2/hook/test",
      sendTime: "09:30",
      timezone: "Asia/Shanghai",
      status: "enabled"
    });
    const originalBaseUrl = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://monitor.example.com";
    try {
      const result = await sendNotificationSchedule(store, schedule, "2026-05-19", sender);
      expect(result.status).toBe("success");
      expect(sender.sent[0].content).toContain("https://monitor.example.com/api/reports/daily.xlsx?date=2026-05-19");
      expect(sender.sent[0].attachments).toBeUndefined();
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.PUBLIC_BASE_URL;
      } else {
        process.env.PUBLIC_BASE_URL = originalBaseUrl;
      }
    }
  });
});
