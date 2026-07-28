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
      priority: "P2",
      needs_human_approval: true
    });
    expect(response.body.output.dataFreshness).toMatchObject({
      evidenceDate: "2026-06-19",
      freshnessStatus: "stale",
      maxAgeHours: 24
    });
    expect(response.body.output.confidence).toBe(0.49);
    expect(response.body.run).toMatchObject({
      agentType: "daily_operator",
      status: "success",
      model: "deterministic-daily-operator-v2"
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
    expect(body.output.dataFreshness).toMatchObject({
      evidenceDate: "2026-06-19",
      freshnessStatus: "stale",
      maxAgeHours: 3
    });
    expect(body.output.recommended_actions[0]?.priority).toBe("P2");
    expect(body.run).toMatchObject({
      agentType: "competitor_analyst",
      status: "success",
      model: "deterministic-competitor-analyst-v2"
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
    expect(body.markdown).toContain("## Data Freshness");
    expect(body.markdown).toContain("- Status: stale / success");
    expect(body.markdown).toContain("Approval-Gated Actions");
    expect(body.output.evidence.length).toBeGreaterThan(0);
    expect(body.output.recommended_actions.every((action) => action.needs_human_approval)).toBe(true);
    expect(body.output.dataFreshness).toMatchObject({
      evidenceDate: "2026-06-19",
      freshnessStatus: "stale",
      maxAgeHours: 24
    });
    expect(body.sourceEventIds).toContain("2026-06-19|category:1|asin:B0AIROUTE1|PRICE_DROP");
    expect(body.run).toMatchObject({
      agentType: "report_writer",
      status: "success",
      model: "deterministic-report-writer-v2"
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
    expect(pagedBody.total).toBe(2);
    expect(pagedBody.runs).toHaveLength(1);
    expect(pagedBody.runs[0].output?.recommended_actions[0].needs_human_approval).toBe(true);

    const filteredResponse = await request(app)
      .get("/api/ai/runs?agentType=daily_operator&status=success")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    const filteredBody = filteredResponse.body as AiRunListResponse;

    expect(filteredBody.total).toBe(1);
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

  it("summarizes organization-scoped Agent feedback and reviewed task outcomes for managers", async () => {
    const run = store.createAiRun({
      orgId: 1,
      agentType: "daily_operator",
      inputContextJson: "{}",
      output: {
        summary: "Two approval-gated actions",
        evidence: ["Current organization evidence"],
        impact: "Prioritize workflow",
        recommended_actions: [
          {
            action: "Review price",
            priority: "P1",
            reason: "Price pressure",
            risk: "Margin",
            needs_human_approval: true
          },
          {
            action: "Review ads",
            priority: "P2",
            reason: "Spend pressure",
            risk: "Traffic",
            needs_human_approval: true
          }
        ],
        confidence: 0.8
      },
      model: "quality-test-model",
      status: "success"
    });
    const operator = store.createUser({
      orgId: 1,
      username: "quality-operator",
      password: "Quality123!",
      role: "operator",
      displayName: "Quality Operator"
    });
    store.upsertAiActionFeedback({
      runId: run.id,
      orgId: 1,
      userId: 1,
      actionIndex: 0,
      value: "up"
    });
    store.upsertAiActionFeedback({
      runId: run.id,
      orgId: 1,
      userId: operator.id,
      actionIndex: 1,
      value: "down"
    });
    const task = store.createTask({
      orgId: 1,
      sourceType: "ai_run",
      sourceId: String(run.id),
      title: "Execute Agent recommendation",
      taskType: "other",
      priority: "P1",
      assigneeId: operator.id
    });
    store.transitionTaskStatus(task.id, "in_progress");
    store.submitTaskForReview(task.id, { actionTaken: "Reviewed and executed recommendation" });
    store.transitionTaskStatus(task.id, "done");
    store.reviewTask(task.id, { reviewResult: "CONFIRMED" });

    const otherOrganization = store.createOrganization({ name: "Quality other org" });
    store.createAiRun({
      orgId: otherOrganization.id,
      agentType: "ads_analyst",
      inputContextJson: "{}",
      output: null,
      model: "hidden-quality-model",
      status: "failed"
    });

    const response = await request(app)
      .get("/api/ai/quality?days=30")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(response.body).toMatchObject({
      windowDays: 30,
      totals: {
        runCount: 1,
        successfulRunCount: 1,
        actionableRunCount: 1,
        actionCount: 2,
        feedbackCount: 2,
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 1,
        positiveFeedbackRate: 50,
        convertedRunCount: 1,
        runConversionRate: 100,
        reviewedTaskCount: 1,
        confirmedTaskCount: 1,
        taskConfirmationRate: 100
      },
      agents: [
        expect.objectContaining({
          agentType: "daily_operator",
          runCount: 1,
          actionCount: 2,
          positiveFeedbackRate: 50,
          runConversionRate: 100,
          taskConfirmationRate: 100
        })
      ]
    });
    expect(JSON.stringify(response.body)).not.toContain("hidden-quality-model");

    const operatorToken = await loginAs("quality-operator", "Quality123!");
    await request(app)
      .get("/api/ai/quality?days=30")
      .set("x-amazon-monitor-session", operatorToken)
      .expect(403);
    await request(app)
      .get("/api/ai/quality?days=14")
      .set("x-amazon-monitor-session", token)
      .expect(400);
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
    expect(adminRuns.body.total).toBe(1);
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
    expect(otherRuns.body.total).toBe(1);
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
