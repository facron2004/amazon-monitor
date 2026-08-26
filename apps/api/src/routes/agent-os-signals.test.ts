import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { InsightEventInput } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("Agent OS signal routes", () => {
  let db: DatabaseSync;
  let store: ReturnType<typeof createStore>;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    store = createStore(db);
    app = createApiApp(store);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("maps real ranking insight events into an evidence-backed signal feed", async () => {
    const event = seedRankingSignal(store, "rank-surge-feed");
    seedRankingSignal(store, "price-event", { eventType: "PRICE_DROP" });

    const list = await request(app)
      .get("/api/agent-os/signals?limit=10")
      .set("Cookie", cookie)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      id: event.id,
      type: "RANKING_JUMP",
      entityType: "ASIN",
      entityId: "B0JUMP001",
      before: 82,
      after: 26,
      change: 56,
      severity: "MEDIUM",
      status: "NEW",
      evidence: {
        sourceEventId: event.id,
        sourceEventType: "RANK_SURGE",
        eventDate: "2026-08-14",
        marketplace: "amazon.com",
      },
    });

    const ignored = await request(app)
      .patch(`/api/agent-os/signals/${event.id}`)
      .set("Cookie", cookie)
      .send({ status: "IGNORED" })
      .expect(200);
    expect(ignored.body.status).toBe("IGNORED");
  });

  it("starts an idempotent ranking-jump workflow and preserves the human approval boundary", async () => {
    const event = seedRankingSignal(store, "rank-surge-investigate");
    seedFreshCollectionEvidence(store);

    const started = await request(app)
      .post(`/api/agent-os/signals/${event.id}/investigate`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
    expect(started.body.signal.status).toBe("INVESTIGATING");
    expect(started.body.workflow.run).toMatchObject({
      workflowId: "ranking-jump-analysis",
      status: "PAUSED",
      triggerType: "RANKING_JUMP_SIGNAL",
    });

    const completed = await request(app)
      .post(`/api/agent-os/workflows/runs/${started.body.workflow.run.id}/resume`)
      .set("Cookie", cookie)
      .send({ approval: "approved" })
      .expect(200);
    expect(completed.body.run.status).toBe("COMPLETED");
    expect(completed.body.actionProposals).toHaveLength(1);
    expect(completed.body.memories).toHaveLength(1);

    const repeated = await request(app)
      .post(`/api/agent-os/signals/${event.id}/investigate`)
      .set("Cookie", cookie)
      .send({ idempotencyKey: `signal:1:${event.id}:investigate` })
      .expect(201);
    expect(repeated.body.workflow.run.id).toBe(started.body.workflow.run.id);
    expect(repeated.body.workflow.actionProposals).toHaveLength(1);
  });

  it("does not expose non-ranking events as ranking signals", async () => {
    seedRankingSignal(store, "rank-drop", { eventType: "RANK_DROP" });
    await request(app)
      .get("/api/agent-os/signals")
      .set("Cookie", cookie)
      .expect(200)
      .then((response) => expect(response.body).toEqual([]));
  });
});

function seedRankingSignal(
  store: ReturnType<typeof createStore>,
  id: string,
  overrides: Partial<InsightEventInput> = {},
): InsightEventInput {
  const event: InsightEventInput = {
    id,
    eventDate: "2026-08-14",
    asin: "B0JUMP001",
    brand: "Jump Brand",
    categoryId: null,
    keywordId: null,
    eventType: "RANK_SURGE",
    eventLevel: "P1",
    eventTitle: "Competitor ranking jump",
    eventSummary: "BSR moved from #82 to #26.",
    attributionTags: [],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      previousRank: 82,
      currentRank: 26,
      rankChange: 56,
      evidenceItems: ["BSR snapshot 2026-08-14", "Previous BSR snapshot 2026-08-13"],
    },
    scoreTotal: 80,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 80,
      productScore: 0,
      promoScore: 0,
      brandScore: 0,
      riskScore: 0,
      reasons: ["Large BSR improvement"],
    },
    suggestedAction: "Investigate price, promotion, listing, review, and ads evidence.",
    status: "TODO",
    assignee: null,
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    ...overrides,
  };
  store.upsertInsightEvent(event);
  return event;
}

function seedFreshCollectionEvidence(store: ReturnType<typeof createStore>): void {
  for (const taskType of ["keyword", "category"] as const) {
    store.pushJob(taskType, 1, "2026-08-14", 1);
    const claimed = store.claimNextJob(`signal-route-test-${taskType}`, 60_000);
    if (!claimed) throw new Error(`Could not claim ${taskType} test job`);
    if (!store.completeJob(claimed.id, claimed.leaseOwner, claimed.leaseToken)) {
      throw new Error(`Could not complete ${taskType} test job`);
    }
  }
}
