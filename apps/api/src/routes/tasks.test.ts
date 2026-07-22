import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
import type { InsightEventInput } from "@amazon-monitor/shared";
import supertest from "supertest";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let request: supertest.SuperTest<supertest.Test>;
let token: string;

async function loginAsAdmin(): Promise<string> {
  const res = await request
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function loginAs(username: string, password: string): Promise<string> {
  const response = await request
    .post("/api/auth/login")
    .send({ username, password });
  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe("tasks & sops routes (e2e)", () => {
  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    store = createStore(db);
    app = createApiApp(store);
    request = supertest(app);
    token = await loginAsAdmin();
  });

  it("logs in, creates a manual task, transitions it, and reviews it", async () => {
    const create = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "manual",
        title: "降价",
        description: "调低 B0 对手价格",
        taskType: "price",
        priority: "P0"
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("pending");
    const taskId = create.body.id as number;

    const updated = await request
      .put(`/api/tasks/${taskId}`)
      .set("x-amazon-monitor-session", token)
      .send({ title: "PRD compatible task update" });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("PRD compatible task update");

    // pending → in_progress
    const t1 = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "in_progress" });
    expect(t1.status).toBe(200);
    expect(t1.body.status).toBe("in_progress");

    // A bare transition cannot bypass the execution record.
    const missingExecution = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "awaiting_review" });
    expect(missingExecution.status).toBe(409);

    // in_progress → awaiting_review with an execution record and before/after metrics.
    const t2 = await request
      .post(`/api/tasks/${taskId}/submit`)
      .set("x-amazon-monitor-session", token)
      .send({
        actionTaken: "已将主推款价格下调 5%，并保护核心词预算。",
        resultBefore: [{ label: "到手价", value: "189.99", unit: "USD" }],
        resultAfter: [{ label: "到手价", value: "179.99", unit: "USD" }]
      });
    expect(t2.status).toBe(200);
    expect(t2.body).toMatchObject({
      status: "awaiting_review",
      actionTaken: "已将主推款价格下调 5%，并保护核心词预算。"
    });
    expect(t2.body.resultBeforeJson).toContain("到手价");

    // illegal: awaiting_review → reviewed
    const bad = await request
      .post(`/api/tasks/${taskId}/review`)
      .set("x-amazon-monitor-session", token)
      .send({ reviewResult: "CONFIRMED" });
    expect(bad.status).toBe(409);

    // awaiting_review → done
    const t3 = await request
      .post(`/api/tasks/${taskId}/complete`)
      .set("x-amazon-monitor-session", token)
      .send({});
    expect(t3.body.status).toBe("done");

    // review with CONFIRMED
    const review = await request
      .post(`/api/tasks/${taskId}/review`)
      .set("x-amazon-monitor-session", token)
      .send({ reviewResult: "CONFIRMED", reviewNote: "已落实" });
    expect(review.body.status).toBe("reviewed");
    expect(review.body.reviewResult).toBe("CONFIRMED");

    // list by status
    const list = await request
      .get("/api/tasks?status=reviewed")
      .set("x-amazon-monitor-session", token);
    expect(list.body).toHaveLength(1);
  });

  it("creates an approval-gated task from a persisted AI run", async () => {
    const run = store.createAiRun({
      orgId: 1,
      agentType: "ads_analyst",
      inputContextJson: "{}",
      output: null,
      model: "deterministic-ads-analyst-v1",
      status: "success"
    });
    const created = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "ai_run",
        sourceId: String(run.id),
        title: "Reduce bid after approval",
        description: "Reason: ACOS is above target\nRisk: Traffic may decline",
        taskType: "ad",
        priority: "P1",
        relatedAsin: "B0TEST1234",
        aiRecommendation: "Reduce bid after approval"
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      sourceType: "ai_run",
      sourceId: String(run.id),
      taskType: "ad",
      priority: "P1",
      status: "pending",
      relatedAsin: "B0TEST1234",
      createdBy: 1
    });

    const detail = await request
      .get(`/api/tasks/${created.body.id as number}/detail`)
      .set("x-amazon-monitor-session", token);
    expect(detail.status).toBe(200);
    expect(detail.body.sourceAiRun).toMatchObject({
      id: run.id,
      agentType: "ads_analyst",
      model: "deterministic-ads-analyst-v1"
    });
  });

  it("rejects a task linked to an AI run from another organization", async () => {
    const otherOrganization = store.createOrganization({ name: "Other organization" });
    const otherRun = store.createAiRun({
      orgId: otherOrganization.id,
      agentType: "daily_operator",
      inputContextJson: "{}",
      output: null,
      model: "other-org-model",
      status: "success"
    });

    await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "ai_run",
        sourceId: String(otherRun.id),
        title: "Cross-organization task",
        taskType: "other",
        priority: "P1"
      })
      .expect(404, { message: "AI run not found" });
  });

  it("converts an insight event into a linked task and keeps the event-task lookup usable", async () => {
    const event = sampleTaskRouteInsightEvent();
    store.upsertInsightEvent(event);

    const create = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "insight_event",
        sourceId: event.id,
        title: event.eventTitle,
        taskType: "competitor",
        priority: "P0"
      });

    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({
      sourceType: "insight_event",
      sourceId: event.id,
      title: event.eventTitle,
      relatedAsin: event.asin,
      description: event.eventSummary,
      priority: event.eventLevel
    });
    expect(store.getInsightEvent(event.id)).toMatchObject({ status: "CONVERTED_TO_TASK" });

    const detail = await request
      .get(`/api/tasks/${create.body.id}/detail`)
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(detail.body).toMatchObject({
      task: { id: create.body.id, sourceId: event.id },
      sourceEvent: { id: event.id, suggestedAction: event.suggestedAction }
    });

    const linked = await request
      .get(`/api/insight-events/${encodeURIComponent(event.id)}/tasks`)
      .set("x-amazon-monitor-session", token);
    expect(linked.status).toBe(200);
    expect(linked.body.map((task: { id: number }) => task.id)).toEqual([create.body.id]);
  });

  it("rejects developer role from creating tasks", async () => {
    // create a developer user
    const orgs = store.listOrganizations();
    const dev = store.createUser({
      orgId: orgs[0].id,
      username: "dev1",
      password: "dev1pass",
      role: "developer",
      displayName: null,
      email: null
    });
    void dev;
    const login = await request
      .post("/api/auth/login")
      .send({ username: "dev1", password: "dev1pass" });
    expect(login.status).toBe(200);
    const devToken = login.body.token as string;

    const create = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", devToken)
      .send({ sourceType: "manual", title: "x", taskType: "other", priority: "P1" });
    expect(create.status).toBe(403);
  });

  it("lets operators create and edit tasks but reserves assignment for managers", async () => {
    const assignee = store.createUser({
      orgId: 1,
      username: "task-owner",
      password: "TaskOwner123!",
      role: "operator",
      displayName: "Task Owner"
    });
    store.createUser({
      orgId: 1,
      username: "task-operator",
      password: "TaskOperator123!",
      role: "operator",
      displayName: "Task Operator"
    });
    store.createUser({
      orgId: 1,
      username: "task-manager",
      password: "TaskManager123!",
      role: "manager",
      displayName: "Task Manager"
    });
    const operatorToken = await loginAs("task-operator", "TaskOperator123!");
    const managerToken = await loginAs("task-manager", "TaskManager123!");

    const created = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", operatorToken)
      .send({ sourceType: "manual", title: "Operator task", taskType: "other", priority: "P1" })
      .expect(201);

    await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", operatorToken)
      .send({
        sourceType: "manual",
        title: "Pre-assigned task",
        taskType: "other",
        priority: "P1",
        assigneeId: assignee.id
      })
      .expect(403);

    await request
      .patch(`/api/tasks/${created.body.id}`)
      .set("x-amazon-monitor-session", operatorToken)
      .send({ title: "Operator-updated task" })
      .expect(200);
    await request
      .patch(`/api/tasks/${created.body.id}`)
      .set("x-amazon-monitor-session", operatorToken)
      .send({ assigneeId: assignee.id })
      .expect(403);

    const assigned = await request
      .patch(`/api/tasks/${created.body.id}`)
      .set("x-amazon-monitor-session", managerToken)
      .send({ assigneeId: assignee.id })
      .expect(200);
    expect(assigned.body).toMatchObject({ assigneeId: assignee.id, title: "Operator-updated task" });
  });

  it("isolates task and SOP reads and writes by organization", async () => {
    const task = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({ sourceType: "manual", title: "Org 1 task", taskType: "other", priority: "P1" })
      .expect(201);
    const sop = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({ title: "Org 1 SOP", category: "general", bodyMd: "# Private SOP" })
      .expect(201);
    store.linkEventToTask("org-1-event", task.body.id as number);

    const secondOrg = store.createOrganization({ name: "Other organization" });
    store.createUser({
      orgId: secondOrg.id,
      username: "other-operator",
      password: "Other123!",
      role: "operator",
      displayName: "Other Operator"
    });
    const otherLogin = await request
      .post("/api/auth/login")
      .send({ username: "other-operator", password: "Other123!" })
      .expect(200);
    const otherToken = otherLogin.body.token as string;

    await request
      .get("/api/tasks")
      .set("x-amazon-monitor-session", otherToken)
      .expect(200)
      .expect([]);
    await request
      .get(`/api/tasks/${task.body.id}`)
      .set("x-amazon-monitor-session", otherToken)
      .expect(404);
    await request
      .get(`/api/tasks/${task.body.id}/detail`)
      .set("x-amazon-monitor-session", otherToken)
      .expect(404);
    await request
      .post(`/api/tasks/${task.body.id}/submit`)
      .set("x-amazon-monitor-session", otherToken)
      .send({ actionTaken: "Attempt cross-org write" })
      .expect(404);
    await request
      .get(`/api/insight-events/${encodeURIComponent("org-1-event")}/tasks`)
      .set("x-amazon-monitor-session", otherToken)
      .expect(404);

    await request
      .get("/api/sops")
      .set("x-amazon-monitor-session", otherToken)
      .expect(200)
      .expect([]);
    await request
      .get(`/api/sops/${sop.body.id}`)
      .set("x-amazon-monitor-session", otherToken)
      .expect(404);
    await request
      .post(`/api/sops/${sop.body.id}/publish`)
      .set("x-amazon-monitor-session", otherToken)
      .expect(404);
  });

  it("creates an SOP and publishes it", async () => {
    const create = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "调价 SOP",
        category: "price_action",
        bodyMd: "# Step 1\n降价 5%",
        tags: ["price", "B0"]
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("draft");
    const id = create.body.id as number;

    const pub = await request
      .post(`/api/sops/${id}/publish`)
      .set("x-amazon-monitor-session", token);
    expect(pub.body.status).toBe("published");

    const list = await request
      .get("/api/sops?status=published")
      .set("x-amazon-monitor-session", token);
    expect(list.body).toHaveLength(1);
  });

  it("promotes a reviewed task into an SOP and marks the task", async () => {
    const taskRes = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "manual",
        title: "复盘竞品 Deal",
        description: "总结活动应对动作",
        taskType: "competitor",
        priority: "P1"
      });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.id as number;

    const createSop = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "竞品 Deal 复盘 SOP",
        category: "competitor_response",
        bodyMd: "# SOP\n记录证据、动作和结果",
        sourceTaskId: taskId,
        tags: ["deal", "review"]
      });
    expect(createSop.status).toBe(201);
    expect(createSop.body.sourceTaskId).toBe(taskId);

    const task = await request
      .get(`/api/tasks/${taskId}`)
      .set("x-amazon-monitor-session", token);
    expect(task.body.promotedToSopId).toBe(createSop.body.id);
  });

  it("returns 404 when creating an SOP from a missing task", async () => {
    const createSop = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "不存在任务 SOP",
        category: "general",
        bodyMd: "# SOP",
        sourceTaskId: 99999
      });
    expect(createSop.status).toBe(404);
  });

  it("adds a note and lists it", async () => {
    const create = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({ sourceType: "manual", title: "x", taskType: "other", priority: "P1" });
    const id = create.body.id as number;
    const note = await request
      .post(`/api/tasks/${id}/notes`)
      .set("x-amazon-monitor-session", token)
      .send({ body: "first" });
    expect(note.status).toBe(201);
    const notes = await request
      .get(`/api/tasks/${id}/notes`)
      .set("x-amazon-monitor-session", token);
    expect(notes.body).toHaveLength(1);
    expect(notes.body[0].body).toBe("first");
  });

  it("allows legacy API key auth to create tasks and SOPs", async () => {
    const originalApiKey = process.env.AMAZON_MONITOR_API_KEY;
    process.env.AMAZON_MONITOR_API_KEY = "legacy-key";
    const legacyDb = new DatabaseSync(":memory:");
    try {
      initSchema(legacyDb);
      const legacyStore = createStore(legacyDb);
      const legacyRequest = supertest(createApiApp(legacyStore));

      const task = await legacyRequest
        .post("/api/tasks")
        .set("Authorization", "Bearer legacy-key")
        .send({ sourceType: "manual", title: "legacy task", taskType: "other", priority: "P1" });
      expect(task.status).toBe(201);

      const sop = await legacyRequest
        .post("/api/sops")
        .set("Authorization", "Bearer legacy-key")
        .send({
          title: "legacy SOP",
          category: "general",
          bodyMd: "# SOP",
          sourceTaskId: task.body.id
        });
      expect(sop.status).toBe(201);
      expect(sop.body.sourceTaskId).toBe(task.body.id);
    } finally {
      legacyDb.close();
      if (originalApiKey) {
        process.env.AMAZON_MONITOR_API_KEY = originalApiKey;
      } else {
        delete process.env.AMAZON_MONITOR_API_KEY;
      }
    }
  });
});

function sampleTaskRouteInsightEvent(): InsightEventInput {
  return {
    id: "2026-06-19|category:1|asin:B0TASK0001|NEW_TOP50_ENTRY",
    eventDate: "2026-06-19",
    asin: "B0TASK0001",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "NEW_TOP50_ENTRY",
    eventLevel: "P0",
    eventTitle: "【新进 Top50】Acme B0TASK0001 进入 #18",
    eventSummary: "发生了什么：BSR 未上榜 -> #18。",
    attributionTags: ["NEW_PRODUCT_PUSH"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 18,
      previousRank: null,
      productUrl: "https://www.amazon.com/dp/B0TASK0001",
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
    suggestedAction: "加入观察并拆解竞品动作",
    status: "TODO",
    reviewDueDate: "2026-06-22",
    reviewResult: null,
    userNote: null
  };
}
