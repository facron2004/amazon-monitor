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

    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTE002|NEW_TOP50_ENTRY",
      asin: "B0ROUTE002",
      eventTitle: "Bob owner event",
      status: "FOLLOWED",
      reviewDueDate: null,
      assignee: "Bob"
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTE003|NEW_TOP50_ENTRY",
      asin: "B0ROUTE003",
      eventTitle: "Unassigned owner event",
      status: "FOLLOWED",
      reviewDueDate: null
    });
    await request(app)
      .get("/api/insight-events?date=2026-06-19&assignee=Alice")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { id: string }) => item.id)).toEqual([event.id]);
      });

    await request(app)
      .get("/api/insight-events?date=2026-06-19&unassignedOnly=true")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE003"]);
      });

    await request(app)
      .get("/api/insight-events?unassignedOnly=maybe")
      .expect(400);

    await request(app)
      .get(`/api/insight-events?assignee=${"a".repeat(121)}`)
      .expect(400);

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
      .patch(`/api/insight-events/${encodeURIComponent(event.id)}/note`)
      .send({ note: "复盘时检查 Top50 是否保持" })
      .expect(200);

    await request(app)
      .get(`/api/insight-events/${encodeURIComponent(event.id)}/notes`)
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { note: string }) => item.note)).toEqual([
          "复盘时检查 Top50 是否保持",
          "已记录价格变化"
        ]);
      });

    await request(app)
      .get("/api/insight-events/missing-event/notes")
      .expect(404);

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
      .send({ date: "2026-06-22", result: "CONFIRMED", note: "3 天后仍在 Top50" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: "WATCHING",
          reviewDueDate: "2026-06-26",
          reviewResult: "CONFIRMED"
        });
      });

    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0OLDREV01|PRICE_DROP",
      eventDate: "2026-06-19",
      asin: "B0OLDREV01",
      eventType: "PRICE_DROP",
      eventTitle: "Reviewed old signal",
      status: "REVIEWED",
      reviewDueDate: null,
      reviewResult: "CONFIRMED",
      updatedAt: "2026-06-22T09:00:00.000Z"
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-22|category:1|asin:B0TODAY001|RANK_SURGE",
      eventDate: "2026-06-22",
      asin: "B0TODAY001",
      eventType: "RANK_SURGE",
      eventTitle: "Today signal",
      reviewDueDate: null
    });
    await request(app)
      .get("/api/insight-events?date=2026-06-22")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0TODAY001"]);
      });
    await request(app)
      .get("/api/insight-events?date=2026-06-22&reviewedOnDate=true")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0TODAY001", "B0OLDREV01"]);
      });
    await request(app).get("/api/insight-events?date=2026-06-22&reviewedOnDate=maybe").expect(400);

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

  it("filters the review-due route with the same query contract as the main insight list", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const event = sampleRouteInsightEvent();
    store.upsertInsightEvent({ ...event, assignee: "Alice" });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-18|category:1|asin:B0ROUTE002|RANK_SURGE",
      eventDate: "2026-06-18",
      asin: "B0ROUTE002",
      brand: "Beta",
      eventType: "RANK_SURGE",
      eventLevel: "P1",
      eventTitle: "Beta review pending",
      status: "REVIEW_PENDING",
      reviewDueDate: "2026-06-20"
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTE003|NEW_TOP50_ENTRY",
      asin: "B0ROUTE003",
      eventTitle: "Already followed",
      status: "FOLLOWED",
      reviewDueDate: "2026-06-20"
    });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&assignee=Alice")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE001"]);
      });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&status=REVIEW_PENDING&level=P1&eventType=RANK_SURGE")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE002"]);
      });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&unassignedOnly=true&limit=1")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE002"]);
      });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&actionStage=reviewDue")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE002", "B0ROUTE001"]);
      });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&unassignedOnly=maybe")
      .expect(400);
  });

  it("sorts insight event routes before applying limit", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const event = sampleRouteInsightEvent();

    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTESCORE|RANK_SURGE",
      asin: "B0ROUTESCORE",
      scoreTotal: 99,
      eventLevel: "P2",
      evidence: { ...event.evidence, rankChange: 5, reviewCountChange: 4 }
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTERANK|RANK_SURGE",
      asin: "B0ROUTERANK",
      scoreTotal: 40,
      eventLevel: "P1",
      evidence: { ...event.evidence, rankChange: 120, reviewCountChange: 8 }
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0ROUTEREVIEW|REVIEW_SPIKE",
      asin: "B0ROUTEREVIEW",
      eventType: "REVIEW_SPIKE",
      scoreTotal: 50,
      eventLevel: "P1",
      evidence: { ...event.evidence, rankChange: 10, reviewCountChange: 80 }
    });

    await request(app)
      .get("/api/insight-events?date=2026-06-19&sortBy=rankChange&limit=1")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTERANK"]);
      });

    await request(app)
      .get("/api/insight-events/review-due?date=2026-06-22&sortBy=reviewChange&limit=1")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTEREVIEW"]);
      });

    await request(app)
      .get("/api/insight-events?date=2026-06-19&sortBy=not-real")
      .expect(400);
  });

  it("returns a daily Action Center trend before the dynamic id route", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const event = sampleRouteInsightEvent();

    store.upsertInsightEvent({
      ...event,
      id: "2026-06-20|category:1|asin:B0ROUTE001|NEW_TOP50_ENTRY",
      eventDate: "2026-06-20",
      status: "TODO",
      eventLevel: "P0",
      attributionTags: ["COUPON_DRIVEN"],
      evidence: {
        ...event.evidence,
        previousRank: 50,
        currentRank: 18,
        rankChange: 32,
        priceBefore: 129.99,
        priceAfter: 99.99,
        reviewCountBefore: 20,
        reviewCountAfter: 45,
        strategyTags: ["COUPON_DEPENDENT"]
      },
      reviewDueDate: "2026-06-21",
      reviewResult: null
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-21|category:1|asin:B0ROUTE002|RANK_SURGE",
      eventDate: "2026-06-21",
      asin: "B0ROUTE002",
      status: "REVIEWED",
      eventLevel: "P1",
      reviewDueDate: null,
      reviewResult: "CONFIRMED"
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-22|category:1|asin:B0ROUTE003|PRICE_DROP",
      eventDate: "2026-06-22",
      asin: "B0ROUTE003",
      status: "FOLLOWED",
      eventLevel: "P2",
      reviewDueDate: null,
      reviewResult: "FAILED"
    });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          {
            date: "2026-06-20",
            totalCount: 1,
            openCount: 1,
            closedCount: 0,
            reviewDueCount: 0,
            p0Count: 1,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-21",
            totalCount: 1,
            openCount: 0,
            closedCount: 1,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 1,
            validatedCount: 1
          },
          {
            date: "2026-06-22",
            totalCount: 1,
            openCount: 0,
            closedCount: 1,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 1,
            validatedCount: 0
          }
        ]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&level=P0")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          {
            date: "2026-06-20",
            totalCount: 1,
            openCount: 1,
            closedCount: 0,
            reviewDueCount: 0,
            p0Count: 1,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-21",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-22",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          }
        ]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&attributionTag=COUPON_DRIVEN&strategyTag=COUPON_DEPENDENT")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          {
            date: "2026-06-20",
            totalCount: 1,
            openCount: 1,
            closedCount: 0,
            reviewDueCount: 0,
            p0Count: 1,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-21",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-22",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 1,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          }
        ]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&evidenceMovement=rankGain&scoreDriver=rankingScore")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((point: { date: string; totalCount: number; reviewDueCount: number }) => [
          point.date,
          point.totalCount,
          point.reviewDueCount
        ])).toEqual([
          ["2026-06-20", 1, 0],
          ["2026-06-21", 0, 1],
          ["2026-06-22", 0, 1]
        ]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&reviewCadence=upcoming")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((point: { date: string; totalCount: number; reviewDueCount: number }) => [
          point.date,
          point.totalCount,
          point.reviewDueCount
        ])).toEqual([
          ["2026-06-20", 1, 0],
          ["2026-06-21", 0, 0],
          ["2026-06-22", 0, 0]
        ]);
      });

    await request(app)
      .get("/api/insight-events?date=2026-06-20&evidenceMovement=priceCut&scoreDriver=rankingScore&reviewCadence=upcoming")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE001"]);
      });

    await request(app)
      .get("/api/insight-events?date=2026-06-20&actionStage=unassigned")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((item: { asin: string }) => item.asin)).toEqual(["B0ROUTE001"]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&actionStage=closed")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((point: { date: string; totalCount: number; closedCount: number }) => [
          point.date,
          point.totalCount,
          point.closedCount
        ])).toEqual([
          ["2026-06-20", 0, 0],
          ["2026-06-21", 1, 1],
          ["2026-06-22", 1, 1]
        ]);
      });

    await request(app)
      .get("/api/insight-events/trend?endDate=2026-06-22&days=3&reviewResult=FAILED")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          {
            date: "2026-06-20",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 0,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-21",
            totalCount: 0,
            openCount: 0,
            closedCount: 0,
            reviewDueCount: 0,
            p0Count: 0,
            reviewedCount: 0,
            validatedCount: 0
          },
          {
            date: "2026-06-22",
            totalCount: 1,
            openCount: 0,
            closedCount: 1,
            reviewDueCount: 0,
            p0Count: 0,
            reviewedCount: 1,
            validatedCount: 0
          }
        ]);
      });

    await request(app).get("/api/insight-events/trend?endDate=2026-06-22&days=31").expect(400);
    await request(app).get("/api/insight-events/trend?endDate=2026-06-22&strategyTag=NOT_A_TAG").expect(400);
    await request(app).get("/api/insight-events/trend?endDate=2026-06-22&evidenceMovement=not-real").expect(400);
    await request(app).get("/api/insight-events/trend?endDate=2026-06-22&actionStage=not-real").expect(400);
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
