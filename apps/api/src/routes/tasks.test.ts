import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
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

    // pending → in_progress
    const t1 = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "in_progress" });
    expect(t1.status).toBe(200);
    expect(t1.body.status).toBe("in_progress");

    // in_progress → awaiting_review
    const t2 = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "awaiting_review" });
    expect(t2.body.status).toBe("awaiting_review");

    // illegal: awaiting_review → reviewed
    const bad = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "reviewed" });
    expect(bad.status).toBe(409);

    // awaiting_review → done
    const t3 = await request
      .post(`/api/tasks/${taskId}/transition`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "done" });
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
