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
    expect(detail.body.sopRecommendations).toEqual([]);
  });

  it("recommends only matching published SOPs from the current organization", async () => {
    const taskResponse = await request
      .post("/api/tasks")
      .set("x-amazon-monitor-session", token)
      .send({
        sourceType: "manual",
        title: "Reduce Acme bid",
        taskType: "ad",
        priority: "P1",
        relatedAsin: "B0MATCH123",
        relatedBrand: "Acme",
        relatedKeyword: "ice maker"
      });
    const taskId = taskResponse.body.id as number;

    const exact = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "Acme Ads recovery",
        category: "ad_optimization",
        bodyMd: "# Steps\nReview placement and bid changes.",
        tags: ["ad", "B0MATCH123", "Acme"]
      });
    await request
      .post(`/api/sops/${exact.body.id as number}/publish`)
      .set("x-amazon-monitor-session", token)
      .expect(200);

    const keyword = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "Ice maker checklist",
        category: "general",
        bodyMd: "# Steps",
        tags: ["ice maker"]
      });
    await request
      .post(`/api/sops/${keyword.body.id as number}/publish`)
      .set("x-amazon-monitor-session", token)
      .expect(200);

    const draft = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "Unpublished Ads SOP",
        category: "ad_optimization",
        bodyMd: "# Draft",
        tags: ["ad"]
      });

    const otherOrganization = store.createOrganization({ name: "Other SOP organization" });
    const otherSop = store.createSop({
      orgId: otherOrganization.id,
      title: "Other organization Ads SOP",
      category: "ad_optimization",
      bodyMd: "# Hidden",
      tags: ["ad", "B0MATCH123"]
    });
    store.publishSop(otherSop.id);

    const detail = await request
      .get(`/api/tasks/${taskId}/detail`)
      .set("x-amazon-monitor-session", token);

    expect(detail.status).toBe(200);
    expect(detail.body.sopRecommendations.map(
      (item: { sop: { id: number } }) => item.sop.id
    )).toEqual([exact.body.id, keyword.body.id]);
    expect(detail.body.sopRecommendations[0]).toMatchObject({
      score: 100,
      matchReasons: [
        "任务类型匹配：广告优化",
        "标签匹配：广告",
        "标签匹配：ASIN B0MATCH123",
        "标签匹配：品牌 Acme"
      ]
    });
    expect(JSON.stringify(detail.body)).not.toContain(draft.body.title);
    expect(JSON.stringify(detail.body)).not.toContain(otherSop.title);
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

  it("reports organization-scoped team throughput, timeliness, and review effectiveness", async () => {
    const assignee = store.createUser({
      orgId: 1,
      username: "performance-owner",
      password: "Performance123!",
      role: "operator",
      displayName: "Performance Owner"
    });
    const now = new Date();
    const createdAt = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    const completedAt = new Date(now.getTime() - 86_400_000).toISOString();
    const overdueDate = new Date(now.getTime() - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const completed = store.createTask({
      orgId: 1,
      sourceType: "manual",
      title: "Completed performance task",
      taskType: "other",
      priority: "P1",
      assigneeId: assignee.id
    });
    store.transitionTaskStatus(completed.id, "in_progress");
    store.submitTaskForReview(completed.id, { actionTaken: "Completed the requested operation" });
    store.transitionTaskStatus(completed.id, "done");
    store.reviewTask(completed.id, { reviewResult: "CONFIRMED" });
    db.prepare(
      `UPDATE tasks
       SET created_at = ?, completed_at = ?, reviewed_at = ?, due_date = ?
       WHERE id = ?`
    ).run(createdAt, completedAt, completedAt, completedAt.slice(0, 10), completed.id);

    const overdue = store.createTask({
      orgId: 1,
      sourceType: "manual",
      title: "Overdue performance task",
      taskType: "other",
      priority: "P0",
      assigneeId: assignee.id,
      dueDate: overdueDate
    });
    db.prepare("UPDATE tasks SET created_at = ? WHERE id = ?").run(createdAt, overdue.id);

    const otherOrganization = store.createOrganization({ name: "Performance other org" });
    store.createTask({
      orgId: otherOrganization.id,
      sourceType: "manual",
      title: "Hidden task",
      taskType: "other",
      priority: "P1"
    });

    const response = await request
      .get("/api/tasks/team-performance?days=7")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(response.body).toMatchObject({
      windowDays: 7,
      totals: {
        assignedCount: 2,
        completedCount: 1,
        openCount: 1,
        overdueCount: 1,
        reviewedCount: 1,
        confirmedCount: 1,
        dueCompletedCount: 1,
        onTimeCompletedCount: 1,
        onTimeRate: 100,
        confirmationRate: 100
      }
    });
    expect(response.body.members).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assigneeId: assignee.id,
        assigneeName: "Performance Owner",
        assignedCount: 2,
        completedCount: 1,
        openCount: 1,
        overdueCount: 1,
        onTimeRate: 100,
        confirmationRate: 100
      })
    ]));
    expect(JSON.stringify(response.body)).not.toContain("Hidden task");

    await request
      .get("/api/tasks/team-performance?days=14")
      .set("x-amazon-monitor-session", token)
      .expect(400);
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

  it("pages the complete organization SOP library with filter-aware status counts", async () => {
    const createdIds: number[] = [];
    for (let index = 0; index < 205; index += 1) {
      createdIds.push(store.createSop({
        orgId: 1,
        title: `SOP ${String(index).padStart(3, "0")}`,
        category: index % 2 === 0 ? "price_action" : "general",
        bodyMd: "# Steps",
        tags: index === 204 ? ["final-page"] : []
      }).id);
    }
    store.publishSop(createdIds[0]);
    store.publishSop(createdIds[1]);
    store.archiveSop(createdIds[1]);

    const otherOrganization = store.createOrganization({ name: "Hidden SOP organization" });
    store.createSop({
      orgId: otherOrganization.id,
      title: "Hidden SOP",
      category: "price_action",
      bodyMd: "# Hidden"
    });

    const finalPage = await request
      .get("/api/sops/page?limit=25&offset=200")
      .set("x-amazon-monitor-session", token);
    expect(finalPage.status).toBe(200);
    expect(finalPage.body).toMatchObject({
      total: 205,
      limit: 25,
      offset: 200,
      statusCounts: {
        all: 205,
        draft: 203,
        published: 1,
        archived: 1
      }
    });
    expect(finalPage.body.sops).toHaveLength(5);
    expect(JSON.stringify(finalPage.body)).not.toContain("Hidden SOP");

    const filtered = await request
      .get("/api/sops/page?category=price_action&q=final-page&limit=25")
      .set("x-amazon-monitor-session", token);
    expect(filtered.body).toMatchObject({
      total: 1,
      statusCounts: { all: 1, draft: 1, published: 0, archived: 0 }
    });
    expect(filtered.body.sops[0].tags).toContain("final-page");
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

    const unreviewed = await request
      .post("/api/sops")
      .set("x-amazon-monitor-session", token)
      .send({
        title: "竞品 Deal 复盘 SOP",
        category: "competitor_response",
        bodyMd: "# SOP\n记录证据、动作和结果",
        sourceTaskId: taskId,
        tags: ["deal", "review"]
      });
    expect(unreviewed.status).toBe(409);

    await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "in_progress" })
      .expect(200);
    await request
      .post(`/api/tasks/${taskId}/submit`)
      .set("x-amazon-monitor-session", token)
      .send({ actionTaken: "记录竞品 Deal 周期并观察排名回落。" })
      .expect(200);
    await request
      .post(`/api/tasks/${taskId}/complete`)
      .set("x-amazon-monitor-session", token)
      .send({})
      .expect(200);
    await request
      .post(`/api/tasks/${taskId}/review`)
      .set("x-amazon-monitor-session", token)
      .send({ reviewResult: "CONFIRMED", reviewNote: "动作有效，可复用。" })
      .expect(200);

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
          bodyMd: "# SOP"
        });
      expect(sop.status).toBe(201);
      expect(sop.body.sourceTaskId).toBeNull();
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
