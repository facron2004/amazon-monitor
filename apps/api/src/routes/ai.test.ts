import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InsightEventInput } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let token: string;

async function loginAsAdmin(): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  return response.body.token as string;
}

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  token = await loginAsAdmin();
});

afterEach(() => {
  db.close();
});

describe("AI Agent routes", () => {
  it("generates a persisted daily brief with evidence and approval-gated actions", async () => {
    store.upsertInsightEvent(sampleInsightEvent());

    const response = await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19" })
      .expect(201);

    expect(response.body.date).toBe("2026-06-19");
    expect(response.body.output.summary).toContain("priority insight signals");
    expect(response.body.output.evidence.length).toBeGreaterThan(0);
    expect(response.body.output.recommended_actions[0]).toMatchObject({
      priority: "P0",
      needs_human_approval: true
    });
    expect(response.body.run).toMatchObject({
      agentType: "daily_operator",
      status: "success",
      model: "deterministic-daily-operator-v1"
    });

    const runs = store.listAiRuns({ agentType: "daily_operator" });
    expect(runs).toHaveLength(1);
    expect(runs[0].output?.recommended_actions[0].needs_human_approval).toBe(true);
  });

  it("keeps low-evidence daily briefs below P0 priority", async () => {
    const response = await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-20" })
      .expect(201);

    expect(response.body.output.confidence).toBeLessThan(0.5);
    expect(response.body.output.recommended_actions.every((action: { priority: string }) => action.priority !== "P0")).toBe(true);
    expect(store.listAiRuns({ agentType: "daily_operator" })).toHaveLength(1);
  });
});

function sampleInsightEvent(): InsightEventInput {
  return {
    id: "2026-06-19|category:1|asin:B0AIROUTE1|PRICE_DROP",
    eventDate: "2026-06-19",
    asin: "B0AIROUTE1",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "PRICE_DROP",
    eventLevel: "P0",
    eventTitle: "Acme B0AIROUTE1 price dropped into the main band",
    eventSummary: "A core competitor moved price down while rank stayed strong.",
    attributionTags: ["PRICE_DRIVEN"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 18,
      previousRank: 26,
      rankChange: 8,
      priceBefore: 189.99,
      priceAfter: 159.99,
      priceChangeRate: -0.158,
      productUrl: "https://www.amazon.com/dp/B0AIROUTE1",
      evidenceItems: ["Rank moved from #26 to #18", "Price changed from 189.99 to 159.99"]
    },
    scoreTotal: 88,
    scoreLevel: "S",
    scoreBreakdown: {
      rankingScore: 35,
      productScore: 15,
      promoScore: 22,
      brandScore: 8,
      riskScore: 8,
      reasons: ["Price-driven rank pressure"]
    },
    suggestedAction: "Review matching price and coupon response options",
    status: "TODO",
    reviewDueDate: "2026-06-20",
    reviewResult: null,
    userNote: null
  };
}
