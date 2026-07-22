import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AiCompetitorAnalysisResponse,
  AiReportWriterResponse,
  AiRunListResponse,
  InsightEventInput
} from "@amazon-monitor/shared";
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

async function loginAs(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
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

  it("analyzes a competitor insight event with persisted approval-gated output", async () => {
    const event = store.upsertInsightEvent(sampleInsightEvent());

    const response = await request(app)
      .post("/api/ai/analyze-competitor")
      .set("x-amazon-monitor-session", token)
      .send({ eventId: event.id, date: "2026-06-19" })
      .expect(201);
    const body = response.body as AiCompetitorAnalysisResponse;

    expect(body.date).toBe("2026-06-19");
    expect(body.eventId).toBe(event.id);
    expect(body.event.eventType).toBe("PRICE_DROP");
    expect(body.output.summary).toContain("B0AIROUTE1");
    expect(body.output.evidence.length).toBeGreaterThan(0);
    expect(body.output.recommended_actions.every((action) => action.needs_human_approval)).toBe(true);
    expect(body.run).toMatchObject({
      agentType: "competitor_analyst",
      status: "success",
      model: "deterministic-competitor-analyst-v1"
    });

    const runs = store.listAiRuns({ agentType: "competitor_analyst" });
    expect(runs).toHaveLength(1);
    expect(runs[0].output?.recommended_actions[0].needs_human_approval).toBe(true);
  });

  it("creates a persisted report writer markdown brief from insight evidence", async () => {
    store.upsertInsightEvent(sampleInsightEvent());

    const response = await request(app)
      .post("/api/ai/create-report")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19", reportType: "daily" })
      .expect(201);
    const body = response.body as AiReportWriterResponse;

    expect(body.date).toBe("2026-06-19");
    expect(body.reportType).toBe("daily");
    expect(body.markdown).toContain("Report Writer Summary");
    expect(body.markdown).toContain("Approval-Gated Actions");
    expect(body.output.evidence.length).toBeGreaterThan(0);
    expect(body.output.recommended_actions.every((action) => action.needs_human_approval)).toBe(true);
    expect(body.sourceEventIds).toContain("2026-06-19|category:1|asin:B0AIROUTE1|PRICE_DROP");
    expect(body.run).toMatchObject({
      agentType: "report_writer",
      status: "success",
      model: "deterministic-report-writer-v1"
    });

    const runs = store.listAiRuns({ agentType: "report_writer" });
    expect(runs).toHaveLength(1);
    expect(runs[0].output?.recommended_actions[0].needs_human_approval).toBe(true);
  });

  it("lists persisted AI runs with filters and pagination", async () => {
    store.upsertInsightEvent(sampleInsightEvent());
    await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19" })
      .expect(201);
    await request(app)
      .post("/api/ai/create-report")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19", reportType: "daily" })
      .expect(201);

    const pagedResponse = await request(app)
      .get("/api/ai/runs?limit=1&offset=0")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    const pagedBody = pagedResponse.body as AiRunListResponse;

    expect(pagedBody.limit).toBe(1);
    expect(pagedBody.offset).toBe(0);
    expect(pagedBody.runs).toHaveLength(1);
    expect(pagedBody.runs[0].output?.recommended_actions[0].needs_human_approval).toBe(true);

    const filteredResponse = await request(app)
      .get("/api/ai/runs?agentType=daily_operator&status=success")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    const filteredBody = filteredResponse.body as AiRunListResponse;

    expect(filteredBody.runs).toHaveLength(1);
    expect(filteredBody.runs[0]).toMatchObject({
      agentType: "daily_operator",
      status: "success"
    });
  });

  it("records per-user feedback for an AI recommended action", async () => {
    store.upsertInsightEvent(sampleInsightEvent());
    const generated = await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19" })
      .expect(201);
    const runId = generated.body.run.id as number;

    await request(app)
      .put(`/api/ai/runs/${runId}/actions/0/feedback`)
      .set("x-amazon-monitor-session", token)
      .send({ value: "up" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ runId, actionIndex: 0, value: "up", userId: 1 });
      });
    await request(app)
      .put(`/api/ai/runs/${runId}/actions/0/feedback`)
      .set("x-amazon-monitor-session", token)
      .send({ value: "down" })
      .expect(200);

    const runs = await request(app)
      .get("/api/ai/runs")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(runs.body.runs[0].actionFeedback).toEqual([
      expect.objectContaining({ runId, actionIndex: 0, value: "down", userId: 1 })
    ]);

    store.createUser({ orgId: 1, username: "feedback-operator", password: "Operator123!", role: "operator" });
    const operatorToken = await loginAs("feedback-operator", "Operator123!");
    const operatorRuns = await request(app)
      .get("/api/ai/runs")
      .set("x-amazon-monitor-session", operatorToken)
      .expect(200);
    expect(operatorRuns.body.runs[0].actionFeedback).toEqual([]);

    await request(app)
      .put(`/api/ai/runs/${runId}/actions/99/feedback`)
      .set("x-amazon-monitor-session", token)
      .send({ value: "up" })
      .expect(400, { message: "Invalid AI action index" });
  });

  it("aligns Agent access with the shared business capability matrix", async () => {
    store.upsertInsightEvent(sampleInsightEvent());
    const generated = await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-06-19" })
      .expect(201);
    const runId = generated.body.run.id as number;

    store.createUser({ orgId: 1, username: "ai-manager", password: "Manager123!", role: "manager" });
    store.createUser({ orgId: 1, username: "ai-researcher", password: "Researcher123!", role: "product_researcher" });
    store.createUser({ orgId: 1, username: "ai-ads", password: "AdsOperator123!", role: "ads_operator" });
    store.createUser({ orgId: 1, username: "ai-viewer", password: "Viewer123!", role: "viewer" });
    store.createUser({ orgId: 1, username: "ai-developer", password: "Developer123!", role: "developer" });

    const managerToken = await loginAs("ai-manager", "Manager123!");
    const researcherToken = await loginAs("ai-researcher", "Researcher123!");
    const adsToken = await loginAs("ai-ads", "AdsOperator123!");
    const viewerToken = await loginAs("ai-viewer", "Viewer123!");
    const developerToken = await loginAs("ai-developer", "Developer123!");

    await request(app).get("/api/ai/runs").set("x-amazon-monitor-session", managerToken).expect(200);
    await request(app).get("/api/ai/runs").set("x-amazon-monitor-session", viewerToken).expect(200);
    await request(app).get("/api/ai/runs").set("x-amazon-monitor-session", developerToken).expect(200);
    await request(app)
      .put(`/api/ai/runs/${runId}/actions/0/feedback`)
      .set("x-amazon-monitor-session", managerToken)
      .send({ value: "up" })
      .expect(200);
    await request(app)
      .put(`/api/ai/runs/${runId}/actions/0/feedback`)
      .set("x-amazon-monitor-session", viewerToken)
      .send({ value: "up" })
      .expect(403);

    await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", managerToken)
      .send({ date: "2026-06-19" })
      .expect(201);
    await request(app)
      .post("/api/ai/analyze-competitor")
      .set("x-amazon-monitor-session", researcherToken)
      .send({ eventId: sampleInsightEvent().id, date: "2026-06-19" })
      .expect(201);
    await request(app)
      .post("/api/ai/analyze-competitor")
      .set("x-amazon-monitor-session", adsToken)
      .send({ eventId: sampleInsightEvent().id, date: "2026-06-19" })
      .expect(403);
    await request(app)
      .post("/api/ai/create-report")
      .set("x-amazon-monitor-session", adsToken)
      .send({ date: "2026-06-19", reportType: "daily" })
      .expect(201);
    await request(app)
      .post("/api/ai/daily-brief")
      .set("x-amazon-monitor-session", viewerToken)
      .send({ date: "2026-06-19" })
      .expect(403);
  });

  it("isolates persisted AI runs by organization", async () => {
    store.createAiRun({
      orgId: 1,
      agentType: "daily_operator",
      inputContextJson: "{}",
      output: null,
      model: "org-one-model",
      status: "success"
    });
    const otherOrganization = store.createOrganization({ name: "Other organization" });
    store.createUser({
      orgId: otherOrganization.id,
      username: "other-admin",
      password: "OtherAdmin123!",
      role: "admin"
    });
    store.createAiRun({
      orgId: otherOrganization.id,
      agentType: "ads_analyst",
      inputContextJson: "{}",
      output: null,
      model: "org-two-model",
      status: "success"
    });

    const adminRuns = await request(app)
      .get("/api/ai/runs")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(adminRuns.body.runs).toHaveLength(1);
    expect(adminRuns.body.runs[0]).toMatchObject({ orgId: 1, model: "org-one-model" });

    const otherToken = await loginAs("other-admin", "OtherAdmin123!");
    await request(app)
      .put("/api/ai/runs/1/actions/0/feedback")
      .set("x-amazon-monitor-session", otherToken)
      .send({ value: "up" })
      .expect(404, { message: "AI run not found" });
    const otherRuns = await request(app)
      .get("/api/ai/runs")
      .set("x-amazon-monitor-session", otherToken)
      .expect(200);
    expect(otherRuns.body.runs).toHaveLength(1);
    expect(otherRuns.body.runs[0]).toMatchObject({
      orgId: otherOrganization.id,
      model: "org-two-model"
    });
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
