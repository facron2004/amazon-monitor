import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InsightEventInput, InsightEvidence } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

interface EventFixtureOverrides extends Omit<Partial<InsightEventInput>, "evidence"> {
  evidence?: Partial<InsightEvidence>;
}

const reportEnvKeys = [
  "INSIGHT_REPORT_LLM_API_KEY",
  "OPENAI_API_KEY",
  "INSIGHT_REPORT_LLM_MODEL",
  "INSIGHT_REPORT_LLM_BASE_URL",
  "INSIGHT_REPORT_LLM_TIMEOUT_MS"
] as const;

const originalReportEnv = new Map(reportEnvKeys.map((key) => [key, process.env[key]]));

describe("report routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of reportEnvKeys) {
      const value = originalReportEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("builds weekly and monthly insight period reports from evidence-backed events", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);

    store.upsertInsightEvent(eventFixture({
      id: "2026-06-25|category:1|asin:B0ACME0001|CORE_COMPETITOR_RISK",
      eventDate: "2026-06-25",
      asin: "B0ACME0001",
      brand: "Acme",
      eventType: "CORE_COMPETITOR_RISK",
      scoreTotal: 96,
      scoreLevel: "S",
      reviewDueDate: "2026-06-28",
      evidence: { isCoreCompetitor: true, currentRank: 12, strategyTags: ["HIGH_THREAT_CORE"] }
    }));
    store.upsertInsightEvent(eventFixture({
      id: "2026-06-23|category:1|asin:B0BETA0002|NEW_PRODUCT_BREAKOUT",
      eventDate: "2026-06-23",
      asin: "B0BETA0002",
      brand: "Beta",
      eventType: "NEW_PRODUCT_BREAKOUT",
      scoreTotal: 82,
      scoreLevel: "A",
      reviewDueDate: "2026-06-24",
      evidence: { currentRank: 18, strategyTags: ["NEW_PRODUCT_MATRIX"] }
    }));
    store.upsertInsightEvent(eventFixture({
      id: "2026-06-20|category:1|asin:B0ACME0003|PRICE_DROP|REVIEWED",
      eventDate: "2026-06-20",
      asin: "B0ACME0003",
      brand: "Acme",
      eventType: "PRICE_DROP",
      scoreTotal: 70,
      scoreLevel: "B",
      reviewDueDate: null,
      reviewResult: "CONFIRMED",
      userNote: "Price stayed low after 3-day review.",
      updatedAt: "2026-06-24T08:00:00.000Z",
      evidence: { priceAfter: 179.99, strategyTags: ["LOW_PRICE_RANKING"] }
    }));
    store.upsertInsightEvent(eventFixture({
      id: "2026-06-10|category:1|asin:B0OLD00004|RANK_SURGE",
      eventDate: "2026-06-10",
      asin: "B0OLD00004",
      brand: "OldBrand",
      eventType: "RANK_SURGE",
      scoreTotal: 65,
      scoreLevel: "B",
      reviewDueDate: "2026-06-21",
      evidence: { currentRank: 30 }
    }));

    const weekly = await request(app)
      .get("/api/reports/insights/period?endDate=2026-06-25&period=weekly")
      .expect(200);

    expect(weekly.body).toMatchObject({
      period: "weekly",
      startDate: "2026-06-19",
      endDate: "2026-06-25",
      days: 7,
      summary: {
        totalEvents: 3,
        sLevelCount: 1,
        aLevelCount: 1,
        coreRiskCount: 1,
        newBreakoutCount: 1,
        reviewDueCount: 2,
        reviewedCount: 1,
        confirmedCount: 1
      }
    });
    expect(weekly.body.topEvents[0]).toMatchObject({ asin: "B0ACME0001", scoreTotal: 96 });
    expect(weekly.body.topBrands[0]).toMatchObject({ brand: "Acme", eventCount: 2, topScore: 96 });
    expect(weekly.body.markdown).toContain("Weekly Insight Report (2026-06-19 to 2026-06-25)");
    expect(weekly.body.markdown).toContain("B0OLD00004");

    const monthly = await request(app)
      .get("/api/reports/insights/period?endDate=2026-06-25&period=monthly")
      .expect(200);
    expect(monthly.body).toMatchObject({ period: "monthly", startDate: "2026-05-27", days: 30 });
    expect(monthly.body.summary.totalEvents).toBe(4);

    await request(app).get("/api/reports/insights/period?endDate=2026-06-25&period=quarterly").expect(400);
  });

  it("returns disabled AI summary metadata when LLM settings are missing", async () => {
    for (const key of reportEnvKeys) {
      delete process.env[key];
    }
    const { app } = createReportTestApp();

    const response = await request(app)
      .get("/api/reports/insights/period?endDate=2026-06-25&period=weekly&includeAiSummary=true")
      .expect(200);

    expect(response.body.aiSummary).toMatchObject({
      status: "disabled",
      provider: "openai-responses",
      model: null,
      text: null,
      promptVersion: "period-insight-report-v1"
    });
  });

  it("generates optional AI summaries through an OpenAI-compatible Responses endpoint", async () => {
    process.env.INSIGHT_REPORT_LLM_API_KEY = "test-key";
    process.env.INSIGHT_REPORT_LLM_MODEL = "test-model";
    process.env.INSIGHT_REPORT_LLM_BASE_URL = "https://llm.example.test/v1/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "- Risk: Acme is pressuring rank.\n- Action: review pricing." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const { app } = createReportTestApp([
      eventFixture({
        id: "2026-06-25|category:1|asin:B0ACME0001|CORE_COMPETITOR_RISK",
        eventDate: "2026-06-25",
        asin: "B0ACME0001",
        brand: "Acme",
        eventType: "CORE_COMPETITOR_RISK",
        scoreTotal: 96,
        scoreLevel: "S"
      })
    ]);

    const response = await request(app)
      .get("/api/reports/insights/period?endDate=2026-06-25&period=weekly&includeAiSummary=true")
      .expect(200);

    expect(response.body.aiSummary).toMatchObject({
      status: "generated",
      provider: "openai-responses",
      model: "test-model",
      text: "- Risk: Acme is pressuring rank.\n- Action: review pricing.",
      error: null,
      promptVersion: "period-insight-report-v1"
    });
    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://llm.example.test/v1/responses");
    expect((requestInit as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    const body = JSON.parse(String((requestInit as RequestInit).body)) as { model?: string; input?: unknown };
    expect(body.model).toBe("test-model");
    expect(JSON.stringify(body.input)).toContain("Acme");
  });

  it("keeps the evidence report available when AI summary generation fails", async () => {
    process.env.INSIGHT_REPORT_LLM_API_KEY = "test-key";
    process.env.INSIGHT_REPORT_LLM_MODEL = "test-model";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })
    );
    const { app } = createReportTestApp();

    const response = await request(app)
      .get("/api/reports/insights/period?endDate=2026-06-25&period=weekly&includeAiSummary=true")
      .expect(200);

    expect(response.body.markdown).toContain("Weekly Insight Report");
    expect(response.body.aiSummary).toMatchObject({
      status: "failed",
      provider: "openai-responses",
      model: "test-model",
      text: null,
      error: "quota exceeded"
    });
  });
});

function createReportTestApp(events: InsightEventInput[] = []) {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  const store = createStore(db);
  for (const event of events) {
    store.upsertInsightEvent(event);
  }
  return { app: createApiApp(store), store };
}

function eventFixture(overrides: EventFixtureOverrides): InsightEventInput {
  const evidence = overrides.evidence ?? {};
  return {
    id: overrides.id ?? "event-1",
    eventDate: overrides.eventDate ?? "2026-06-25",
    asin: overrides.asin ?? "B0TEST0001",
    brand: overrides.brand ?? "Acme",
    categoryId: overrides.categoryId ?? 1,
    keywordId: null,
    eventType: overrides.eventType ?? "RANK_SURGE",
    eventLevel: overrides.eventLevel ?? "P1",
    eventTitle: overrides.eventTitle ?? `${overrides.brand ?? "Acme"} ${overrides.asin ?? "B0TEST0001"} event`,
    eventSummary: overrides.eventSummary ?? "Evidence-backed event summary.",
    attributionTags: overrides.attributionTags ?? ["ORGANIC_STRENGTH"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      productUrl: overrides.asin ? `https://www.amazon.com/dp/${overrides.asin}` : null,
      imageUrl: null,
      title: overrides.eventTitle ?? "Test product",
      currentRank: evidence.currentRank ?? null,
      previousRank: evidence.previousRank ?? null,
      rankChange: evidence.rankChange ?? null,
      priceBefore: evidence.priceBefore ?? null,
      priceAfter: evidence.priceAfter ?? null,
      priceChangeRate: evidence.priceChangeRate ?? null,
      reviewCountBefore: evidence.reviewCountBefore ?? null,
      reviewCountAfter: evidence.reviewCountAfter ?? null,
      reviewCountChange: evidence.reviewCountChange ?? null,
      couponBefore: evidence.couponBefore ?? null,
      couponAfter: evidence.couponAfter ?? null,
      dealType: evidence.dealType ?? null,
      brandRisingCount: evidence.brandRisingCount ?? null,
      brandNewEntryCount: evidence.brandNewEntryCount ?? null,
      brandTop100Count: evidence.brandTop100Count ?? null,
      priceLowWindow: evidence.priceLowWindow ?? null,
      isCoreCompetitor: evidence.isCoreCompetitor ?? false,
      strategyTags: evidence.strategyTags ?? [],
      evidenceItems: evidence.evidenceItems ?? ["fixture evidence"]
    },
    scoreTotal: overrides.scoreTotal ?? 70,
    scoreLevel: overrides.scoreLevel ?? "B",
    scoreBreakdown: overrides.scoreBreakdown ?? {
      rankingScore: 20,
      productScore: 20,
      promoScore: 10,
      brandScore: 10,
      riskScore: 10,
      reasons: ["fixture"]
    },
    suggestedAction: overrides.suggestedAction ?? "Review the evidence before action.",
    status: overrides.status ?? "TODO",
    reviewDueDate: overrides.reviewDueDate ?? null,
    reviewResult: overrides.reviewResult ?? null,
    userNote: overrides.userNote ?? null,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt
  };
}
