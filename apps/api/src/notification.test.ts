import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { decorateBestsellerSnapshots, type InsightEventInput, type NotificationSchedule } from "@amazon-monitor/shared";
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
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 100,
      status: "enabled"
    });
    store.insertCategorySnapshots(
      decorateBestsellerSnapshots({
        categoryId: category.id,
        categoryName: category.name,
        marketplace: category.marketplace,
        snapshotDate: "2026-05-19",
        products: [
          {
            rank: 1,
            asin: "B0IMGTEST1",
            title: "Acme Nugget Countertop Ice Maker",
            brand: "Acme",
            imageUrl: "https://example.com/B0IMGTEST1.jpg",
            productUrl: "https://www.amazon.com/dp/B0IMGTEST1",
            currentPrice: 99.99,
            originalPrice: null,
            couponText: "Save $5 with coupon",
            currency: "$",
            rating: 4.7,
            reviewCount: 1234,
            isPrime: true,
            dealBadge: "Limited Time Deal"
          }
        ]
      })
    );
    store.upsertInsightEvent(sampleNotificationInsight(category.id));
    store.upsertInsightEvent(sampleReviewedNotificationInsight(category.id));
    store.upsertInsightEvent(sampleDueNotificationInsight(category.id));
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
    expect(sender.sent[0].content).toContain("BSR Coupon / Deal");
    expect(sender.sent[0].content).toContain("Action Center 概览");
    expect(sender.sent[0].content).toContain("今日必须看");
    expect(sender.sent[0].content).toContain("负责人 Alice");
    expect(sender.sent[0].content).toContain("复盘 05-22");
    expect(sender.sent[0].content).toContain("证据：BSR #30 -> #12");
    expect(sender.sent[0].content).toContain("昨日判断复盘结果");
    expect(sender.sent[0].content).toContain("判断成立");
    expect(sender.sent[0].content).toContain("B0IMGTEST1");
    expect(sender.sent[0].content).toContain("Save $5 with coupon / Limited Time Deal");
    expect(sender.sent[0].htmlContent).toContain("Excel");
    expect(sender.sent[0].htmlContent).toContain("Action Center 概览");
    expect(sender.sent[0].htmlContent).toContain("今日必须看");
    expect(sender.sent[0].htmlContent).toContain("负责人 Alice");
    expect(sender.sent[0].htmlContent).toContain("复盘 05-22");
    expect(sender.sent[0].htmlContent).toContain("证据：BSR #30 -&gt; #12");
    expect(sender.sent[0].htmlContent).toContain("昨日判断复盘结果");
    expect(sender.sent[0].htmlContent).toContain("判断成立");
    expect(sender.sent[0].htmlContent).toContain("B0IMGTEST1");
    expect(sender.sent[0].htmlContent).toContain("BSR Coupon / Deal");
    expect(sender.sent[0].htmlContent).toContain("Save $5 with coupon / Limited Time Deal");
    const attachment = sender.sent[0].attachments?.[0];
    expect(attachment?.filename).toBe("amazon-monitor-2026-05-19.xlsx");
    expect(attachment?.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(attachment?.content.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(getWorkbookSheetNames(attachment?.content ?? Buffer.alloc(0))).toEqual(DAILY_REPORT_SHEET_NAMES);
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet1.xml")).toContain("Report Date");
    const bestsellerSheet = readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet2.xml");
    expect(bestsellerSheet).toContain("Ice Type");
    expect(bestsellerSheet).toContain("Coupon / Deal");
    expect(bestsellerSheet).toContain("Save $5 with coupon / Limited Time Deal");
    expect(bestsellerSheet).toContain("Image Preview");
    expect(bestsellerSheet).toContain("IMAGE(");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet6.xml")).toContain("Review Change");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet11.xml")).toContain("Unique Ranks");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet13.xml")).toContain("Previous Date");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet14.xml")).toContain("Current Top10 ASINs");
    const actionChecklistSheet = readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet16.xml");
    expect(actionChecklistSheet).toContain("Next Action");
    expect(actionChecklistSheet).toContain("今日必须看");
    expect(actionChecklistSheet).toContain("B0IMGTEST1");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet17.xml")).toContain("Strategy Tags");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet17.xml")).toContain("Attribution Tags");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet17.xml")).toContain("Coupon 依赖型");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet17.xml")).toContain("B0IMGTEST1");
    const reviewQueueSheet = readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet18.xml");
    expect(reviewQueueSheet).toContain("Due Date");
    expect(reviewQueueSheet).toContain("Days Offset");
    expect(reviewQueueSheet).toContain("Assignee");
    expect(reviewQueueSheet).toContain("Alice");
    const reviewOutcomesSheet = readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet19.xml");
    expect(reviewOutcomesSheet).toContain("Review Note");
    expect(reviewOutcomesSheet).toContain("判断成立");
    expect(reviewOutcomesSheet).toContain("复盘后仍在 Top20");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet20.xml")).toContain("Representative Event");
    expect(readZipText(attachment?.content ?? Buffer.alloc(0), "xl/worksheets/sheet20.xml")).toContain("Coupon 依赖型");

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

function sampleNotificationInsight(categoryId: number): InsightEventInput {
  return {
    id: `2026-05-19|category:${categoryId}|asin:B0IMGTEST1|COUPON_ADDED`,
    eventDate: "2026-05-19",
    asin: "B0IMGTEST1",
    brand: "Acme",
    categoryId,
    keywordId: null,
    eventType: "COUPON_ADDED",
    eventLevel: "P0",
    eventTitle: "【新增 Coupon】Acme B0IMGTEST1",
    eventSummary: "发生了什么：BSR #30 -> #12，新增 Coupon。\n可能原因：Coupon 驱动。\n影响判断：机会分 90。",
    attributionTags: ["COUPON_DRIVEN"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      productUrl: "https://www.amazon.com/dp/B0IMGTEST1",
      imageUrl: "https://example.com/B0IMGTEST1.jpg",
      title: "Acme Nugget Countertop Ice Maker",
      currentRank: 12,
      previousRank: 30,
      rankChange: 18,
      couponBefore: null,
      couponAfter: "Save $5 with coupon",
      evidenceItems: ["BSR #30 -> #12", "Coupon - -> Save $5 with coupon"]
    },
    scoreTotal: 90,
    scoreLevel: "S",
    scoreBreakdown: {
      rankingScore: 28,
      productScore: 10,
      promoScore: 8,
      brandScore: 10,
      riskScore: 0,
      reasons: ["排名分 28", "活动强度分 8"]
    },
    suggestedAction: "加入观察并复盘 3 天排名维持情况。",
    status: "TODO",
    assignee: "Alice",
    reviewDueDate: "2026-05-22",
    reviewResult: null,
    userNote: null
  };
}
function sampleReviewedNotificationInsight(categoryId: number): InsightEventInput {
  return {
    ...sampleNotificationInsight(categoryId),
    id: `2026-05-16|category:${categoryId}|asin:B0IMGTEST1|PRICE_DROP`,
    eventDate: "2026-05-16",
    eventType: "PRICE_DROP",
    eventLevel: "P1",
    eventTitle: "【价格下降】Acme B0IMGTEST1",
    attributionTags: ["PRICE_DRIVEN"],
    scoreTotal: 72,
    scoreLevel: "A",
    status: "REVIEWED",
    reviewDueDate: "2026-05-19",
    reviewResult: "CONFIRMED",
    userNote: "复盘后仍在 Top20",
    createdAt: "2026-05-16T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z"
  };
}

function sampleDueNotificationInsight(categoryId: number): InsightEventInput {
  return {
    ...sampleNotificationInsight(categoryId),
    id: `2026-05-16|category:${categoryId}|asin:B0IMGTEST1|REVIEW_DUE`,
    eventDate: "2026-05-16",
    eventType: "RANK_SURGE",
    eventLevel: "P0",
    eventTitle: "【复盘到期】Acme B0IMGTEST1",
    scoreTotal: 86,
    scoreLevel: "S",
    status: "REVIEW_PENDING",
    reviewDueDate: "2026-05-19",
    reviewResult: null,
    userNote: "等待 3 天后验证排名是否维持"
  };
}
