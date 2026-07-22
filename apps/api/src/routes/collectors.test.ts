import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

afterEach(() => {
  delete process.env.AMAZON_MONITOR_API_KEY;
});

describe("collector routes", () => {
  it("queues enabled targets and exposes jobs, logs, freshness, and health", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "countertop ice maker",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "enabled"
    });
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers/zgbs/home-garden/2399939011",
      crawlTopN: 100,
      status: "enabled"
    });
    store.insertTaskLog({
      taskType: "keyword",
      keywordId: keyword.id,
      keyword: keyword.keyword,
      marketplace: keyword.marketplace,
      status: "success",
      startTime: "2026-07-10T01:00:00.000Z",
      endTime: "2026-07-10T01:01:00.000Z",
      pageCount: 1,
      successCount: 12,
      failCount: 0,
      errorMessage: null,
      retryCount: 0
    });
    const api = request.agent(createApiApp(store));
    await api.post("/api/auth/login").send({ username: "admin", password: "admin123" }).expect(200);

    const run = await api
      .post("/api/collectors/run")
      .send({ taskType: "all", date: "2026-07-10" })
      .expect(202);

    expect(run.body).toHaveLength(2);
    expect(run.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskType: "keyword", targetId: keyword.id, status: "pending" }),
      expect.objectContaining({ taskType: "category", targetId: category.id, status: "pending" })
    ]));

    const jobs = await api.get("/api/collectors/jobs?limit=20").expect(200);
    expect(jobs.body).toHaveLength(2);
    await api.get(`/api/collectors/jobs/${jobs.body[0].id}`).expect(200);
    await api.get("/api/collectors/jobs/99999").expect(404);

    const logs = await api.get("/api/collectors/logs").expect(200);
    expect(logs.body).toEqual([expect.objectContaining({ keyword: keyword.keyword, status: "success" })]);

    const freshness = await api.get("/api/collectors/freshness").expect(200);
    expect(freshness.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskType: "keyword", totalJobs: 1 }),
      expect.objectContaining({ taskType: "category", totalJobs: 1 })
    ]));

    const queueStats = await api.get("/api/collectors/queue-stats").expect(200);
    expect(queueStats.body).toMatchObject({ pendingCount: 2, processingCount: 0 });
    const workerStatus = await api.get("/api/collectors/worker-status").expect(200);
    expect(workerStatus.body).toMatchObject({ offline: true });
  });

  it("supports a single target and rejects ambiguous or unavailable targets", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const enabled = store.createKeyword({
      keyword: "portable ice maker",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "enabled"
    });
    const disabled = store.createKeyword({
      keyword: "disabled keyword",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "disabled"
    });
    const api = request.agent(createApiApp(store));
    await api.post("/api/auth/login").send({ username: "admin", password: "admin123" }).expect(200);

    const targetedRun = await api
      .post("/api/collectors/run")
      .send({ taskType: "keyword", targetId: enabled.id, date: "2026-07-10" })
      .expect(202);
    expect(targetedRun.body).toEqual([expect.objectContaining({ targetId: enabled.id })]);

    await api
      .post("/api/collectors/run")
      .send({ taskType: "all", targetId: enabled.id })
      .expect(400);
    await api
      .post("/api/collectors/run")
      .send({ taskType: "keyword", targetId: disabled.id })
      .expect(409);
    await api
      .post("/api/collectors/run")
      .send({ taskType: "category", targetId: 99999 })
      .expect(404);
  });
});
