import { DatabaseSync } from "node:sqlite";
import type { AlertLog, NotificationSchedule } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { sendDueNotificationSchedules, type NotificationSender } from "../notifier.js";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import { readZipText } from "../test-support/xlsx.js";

interface RecordedAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

class RecordingSender implements NotificationSender {
  sent: Array<{ schedule: NotificationSchedule; content: string; htmlContent?: string; attachments?: RecordedAttachment[] }> = [];

  async send(
    schedule: NotificationSchedule,
    _date: string,
    content: string,
    htmlContent?: string,
    attachments?: RecordedAttachment[]
  ): Promise<{ message: string }> {
    this.sent.push({ schedule, content, htmlContent, attachments });
    return { message: `sent ${schedule.name}` };
  }
}

describe("notification organization scope", () => {
  it("isolates schedule management, delivery content, attachments, due scans, and send logs", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstOrg = store.createOrganization({ name: "First notification team" });
    const secondOrg = store.createOrganization({ name: "Second notification team" });
    store.createUser({ orgId: firstOrg.id, username: "first-notify", password: "password-1234", role: "operator" });
    store.createUser({ orgId: secondOrg.id, username: "second-notify", password: "password-1234", role: "operator" });
    store.createUser({ orgId: firstOrg.id, username: "notify-viewer", password: "password-1234", role: "viewer" });
    store.insertAlerts([alert("FIRST-NOTIFY-ASIN", "First organization alert")], firstOrg.id);
    store.insertAlerts([alert("SECOND-NOTIFY-ASIN", "Second organization alert")], secondOrg.id);

    const sender = new RecordingSender();
    const app = createApiApp(store, { notificationSender: sender });
    const firstApi = request.agent(app);
    const secondApi = request.agent(app);
    const viewerApi = request.agent(app);
    await firstApi.post("/api/auth/login").send({ username: "first-notify", password: "password-1234" }).expect(200);
    await secondApi.post("/api/auth/login").send({ username: "second-notify", password: "password-1234" }).expect(200);
    await viewerApi.post("/api/auth/login").send({ username: "notify-viewer", password: "password-1234" }).expect(200);

    const firstSchedule = await createSchedule(firstApi, "first daily", "first@example.com");
    const secondSchedule = await createSchedule(secondApi, "second daily", "second@example.com");
    expect(firstSchedule.body.orgId).toBe(firstOrg.id);
    expect(secondSchedule.body.orgId).toBe(secondOrg.id);
    expect((await firstApi.get("/api/notifications/schedules").expect(200)).body.map((item: NotificationSchedule) => item.name)).toEqual(["first daily"]);
    expect((await secondApi.get("/api/notifications/schedules").expect(200)).body.map((item: NotificationSchedule) => item.name)).toEqual(["second daily"]);

    await firstApi.patch(`/api/notifications/schedules/${secondSchedule.body.id}`).send({ name: "cross-org" }).expect(404);
    await firstApi.delete(`/api/notifications/schedules/${secondSchedule.body.id}`).expect(404);
    await firstApi.post(`/api/notifications/schedules/${secondSchedule.body.id}/send`).send({ date: "2026-07-18" }).expect(404);
    await viewerApi.post("/api/notifications/schedules").send(scheduleInput("viewer daily", "viewer@example.com")).expect(403);

    await firstApi.post(`/api/notifications/schedules/${firstSchedule.body.id}/send`).send({ date: "2026-07-18" }).expect(200);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].content).toContain("FIRST-NOTIFY-ASIN");
    expect(sender.sent[0].content).not.toContain("SECOND-NOTIFY-ASIN");
    expect(sender.sent[0].htmlContent).toContain("FIRST-NOTIFY-ASIN");
    expect(sender.sent[0].htmlContent).not.toContain("SECOND-NOTIFY-ASIN");
    const alertSheet = readZipText(sender.sent[0].attachments?.[0]?.content ?? Buffer.alloc(0), "xl/worksheets/sheet15.xml");
    expect(alertSheet).toContain("FIRST-NOTIFY-ASIN");
    expect(alertSheet).not.toContain("SECOND-NOTIFY-ASIN");

    expect((await firstApi.get("/api/notifications/logs").expect(200)).body).toEqual([
      expect.objectContaining({ orgId: firstOrg.id, scheduleId: firstSchedule.body.id, status: "success" })
    ]);
    expect((await secondApi.get("/api/notifications/logs").expect(200)).body).toEqual([]);

    const dueLogs = await sendDueNotificationSchedules(store, new Date("2026-07-18T01:31:00.000Z"), sender);
    expect(dueLogs).toEqual([expect.objectContaining({ orgId: secondOrg.id, scheduleId: secondSchedule.body.id })]);
    expect(sender.sent[1].schedule.orgId).toBe(secondOrg.id);
    expect(sender.sent[1].content).toContain("SECOND-NOTIFY-ASIN");
    expect(sender.sent[1].content).not.toContain("FIRST-NOTIFY-ASIN");
  });
});

function createSchedule(api: request.SuperAgentTest, name: string, target: string) {
  return api.post("/api/notifications/schedules").send(scheduleInput(name, target)).expect(201);
}

function scheduleInput(name: string, target: string) {
  return { name, channel: "email", target, sendTime: "09:30", timezone: "Asia/Shanghai", status: "enabled" };
}

function alert(asin: string, content: string): AlertLog {
  return {
    alertDate: "2026-07-18", alertType: "price_drop", alertLevel: "high", keyword: "ice maker",
    asin, title: `${asin} title`, brand: "Acme", alertContent: content,
    oldValue: "$100", newValue: "$80", status: "pending"
  };
}
