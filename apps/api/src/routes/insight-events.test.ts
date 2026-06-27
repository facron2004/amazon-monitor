import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { InsightEventInput } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("insight event routes", () => {
  it("lists, updates, watches, reviews, and manually generates insight events", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const event = sampleRouteInsightEvent();
    store.upsertInsightEvent(event);

    const list = await request(app).get("/api/insight-events?date=2026-06-19").expect(200);
    expect(list.body[0]).toMatchObject({ id: event.id, eventType: "NEW_TOP50_ENTRY" });

    await request(app)
      .patch(`/api/insight-events/${encodeURIComponent(event.id)}/status`)
      .send({ status: "FOLLOWED" })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("FOLLOWED");
      });

    await request(app)
      .patch(`/api/insight-events/${encodeURIComponent(event.id)}/assignee`)
      .send({ assignee: "  Alice  " })
      .expect(200)
      .expect((response) => {
        expect(response.body.assignee).toBe("Alice");
      });

    await request(app)
      .patch(`/api/insight-events/${encodeURIComponent(event.id)}/assignee`)
      .send({ assignee: null })
      .expect(200)
      .expect((response) => {
        expect(response.body.assignee).toBeNull();
      });

    await request(app)
      .patch(`/api/insight-events/${encodeURIComponent(event.id)}/note`)
      .send({ note: "已记录价格变化" })
      .expect(200)
      .expect((response) => {
        expect(response.body.userNote).toBe("已记录价格变化");
      });

    await request(app)
      .post(`/api/insight-events/${encodeURIComponent(event.id)}/watch`)
      .send({ watchLevel: "POTENTIAL" })
      .expect(200)
      .expect((response) => {
        expect(response.body.watchState).toMatchObject({ asin: event.asin, watchLevel: "POTENTIAL" });
      });

    await request(app)
      .patch(`/api/asin-watch-states/${event.asin}`)
      .send({
        watchLevel: "CORE",
        watchReason: "Top50 核心竞品",
        firstWatchDate: "2026-06-19",
        lastEventDate: "2026-06-20"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          asin: event.asin,
          watchLevel: "CORE",
          firstWatchDate: "2026-06-19",
          lastEventDate: "2026-06-20"
        });
      });

    await request(app)
      .patch(`/api/asin-watch-states/${event.asin}`)
      .send({ watchLevel: "CORE", lastEventDate: "not-a-date" })
      .expect(400);

    // 用户把 event 标成 FOLLOWED 后,它应该从自动复盘队列里消失——
    // 否则 evaluator 会把 FOLLOWED 刷回 REVIEW_PENDING,覆盖用户的决定。
    const due = await request(app).get("/api/insight-events/review-due?date=2026-06-22").expect(200);
    expect(due.body).toEqual([]);

    await request(app)
      .post(`/api/insight-events/${encodeURIComponent(event.id)}/review`)
      .send({ result: "CONFIRMED", note: "3 天后仍在 Top50" })
      .expect(200)
      .expect((response) => {
        expect(response.body.reviewResult).toBe("CONFIRMED");
      });

    await request(app).post("/api/insight-events/generate?date=2026-06-19").send({ date: "2026-06-19" }).expect(201);
  });

  it("evaluates due review events through the fixed review-due route", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const event = sampleRouteInsightEvent();
    store.upsertInsightEvent(event);

    const response = await request(app)
      .post("/api/insight-events/review-due/evaluate?date=2026-06-22")
      .send({ date: "2026-06-22" })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: event.id,
      status: "REVIEW_PENDING",
      reviewDueDate: "2026-06-26",
      reviewResult: "UNCLEAR"
    });
    expect(store.getInsightEvent(event.id)).toMatchObject({ reviewResult: "UNCLEAR" });
  });
});

function sampleRouteInsightEvent(): InsightEventInput {
  return {
    id: "2026-06-19|category:1|asin:B0ROUTE001|NEW_TOP50_ENTRY",
    eventDate: "2026-06-19",
    asin: "B0ROUTE001",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "NEW_TOP50_ENTRY",
    eventLevel: "P0",
    eventTitle: "【新进 Top50】Acme B0ROUTE001 进入 #18",
    eventSummary: "发生了什么：BSR 未上榜 -> #18。",
    attributionTags: ["NEW_PRODUCT_PUSH"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 18,
      previousRank: null,
      productUrl: "https://www.amazon.com/dp/B0ROUTE001",
      evidenceItems: ["BSR 未上榜 -> #18"]
    },
    scoreTotal: 86,
    scoreLevel: "S",
    scoreBreakdown: {
      rankingScore: 35,
      productScore: 25,
      promoScore: 8,
      brandScore: 10,
      riskScore: 8,
      reasons: ["排名分 35"]
    },
    suggestedAction: "加入观察",
    status: "TODO",
    reviewDueDate: "2026-06-22",
    reviewResult: null,
    userNote: null
  };
}
