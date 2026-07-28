import { DatabaseSync } from "node:sqlite";
import type { SerpSnapshot } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("keyword organization scope", () => {
  it("isolates keywords, snapshots, collection jobs, and logs by session organization", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstOrg = store.createOrganization({ name: "First operations team" });
    const secondOrg = store.createOrganization({ name: "Second operations team" });
    store.createUser({ orgId: firstOrg.id, username: "first-operator", password: "password-1234", role: "operator" });
    store.createUser({ orgId: secondOrg.id, username: "second-operator", password: "password-1234", role: "operator" });

    const app = createApiApp(store);
    const firstApi = request.agent(app);
    const secondApi = request.agent(app);
    await firstApi.post("/api/auth/login").send({ username: "first-operator", password: "password-1234" }).expect(200);
    await secondApi.post("/api/auth/login").send({ username: "second-operator", password: "password-1234" }).expect(200);

    const firstKeyword = await firstApi.post("/api/keywords").send({ keyword: "first ice maker", marketplace: "amazon.com" }).expect(201);
    const secondKeyword = await secondApi.post("/api/keywords").send({ keyword: "second ice maker", marketplace: "amazon.com" }).expect(201);
    expect((await firstApi.put(`/api/keywords/${firstKeyword.body.id}`).send({ priority: "A" }).expect(200)).body.priority).toBe("A");
    store.insertSnapshots([
      snapshot(firstKeyword.body.id, "first ice maker", "FIRST00001", "first_collector", "2026-07-18T01:00:00.000Z"),
      snapshot(secondKeyword.body.id, "second ice maker", "SECOND0001", "second_collector", "2026-07-18T02:00:00.000Z")
    ]);

    const firstKeywords = await firstApi.get("/api/keywords").expect(200);
    expect(firstKeywords.body.map((item: { keyword: string }) => item.keyword)).toEqual(["first ice maker"]);
    const firstSnapshots = await firstApi.get("/api/snapshots?date=2026-07-18").expect(200);
    expect(firstSnapshots.body.map((item: { asin: string }) => item.asin)).toEqual(["FIRST00001"]);
    expect(firstSnapshots.body[0]).toMatchObject({ dataSource: "first_collector", syncStatus: "success" });
    expect(firstSnapshots.body[0].lastSyncedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    const firstFreshness = await firstApi.get("/api/collectors/freshness").expect(200);
    const secondFreshness = await secondApi.get("/api/collectors/freshness").expect(200);
    expect(firstFreshness.body).toContainEqual(expect.objectContaining({
      taskType: "keyword",
      dataSource: "first_collector",
      lastSyncedAt: "2026-07-18T01:00:00.000Z",
      syncStatus: "success"
    }));
    expect(secondFreshness.body).toContainEqual(expect.objectContaining({
      taskType: "keyword",
      dataSource: "second_collector",
      lastSyncedAt: "2026-07-18T02:00:00.000Z",
      syncStatus: "success"
    }));
    await firstApi.get(`/api/keywords/${secondKeyword.body.id}/detail?date=2026-07-18`).expect(404);
    expect((await firstApi.get(`/api/keywords/${firstKeyword.body.id}/history?date=2026-07-18`).expect(200)).body.keyword.id).toBe(firstKeyword.body.id);
    await firstApi.post("/api/collect/run").send({ keywordId: secondKeyword.body.id, date: "2026-07-18" }).expect(404);

    const firstJob = await firstApi.post("/api/collect/run").send({ keywordId: firstKeyword.body.id, date: "2026-07-18" }).expect(202);
    const secondJob = await secondApi.post("/api/collect/run").send({ keywordId: secondKeyword.body.id, date: "2026-07-18" }).expect(202);
    expect((await firstApi.get("/api/collectors/jobs").expect(200)).body.map((item: { id: number }) => item.id)).toEqual([firstJob.body.id]);
    await firstApi.get(`/api/collectors/jobs/${secondJob.body.id}`).expect(404);

    store.insertTaskLog(taskLog(firstOrg.id, firstKeyword.body.id, "first ice maker"));
    store.insertTaskLog(taskLog(secondOrg.id, secondKeyword.body.id, "second ice maker"));
    const firstLogs = await firstApi.get("/api/collectors/logs").expect(200);
    expect(firstLogs.body.map((item: { keyword: string }) => item.keyword)).toEqual(["first ice maker"]);
    const firstLogPage = await firstApi.get("/api/collectors/logs/page?limit=1").expect(200);
    expect(firstLogPage.body).toMatchObject({
      total: 1,
      logs: [expect.objectContaining({ keyword: "first ice maker" })]
    });

    expect((await firstApi.get("/api/collect/jobs").expect(200)).body.map((item: { id: number }) => item.id)).toEqual([firstJob.body.id]);
    await firstApi.get(`/api/collect/jobs/${secondJob.body.id}`).expect(404);
    expect((await firstApi.get("/api/task-logs").expect(200)).body.map((item: { keyword: string }) => item.keyword)).toEqual(["first ice maker"]);
    expect((await firstApi.get("/api/collect/queue-stats").expect(200)).body.pendingCount).toBe(1);
  });
});

function snapshot(
  keywordId: number,
  keyword: string,
  asin: string,
  dataSource: string,
  lastSyncedAt: string
): SerpSnapshot {
  return {
    keywordId, keyword, marketplace: "amazon.com", snapshotDate: "2026-07-18", pageNo: 1,
    positionInPage: 1, absoluteRank: 1, organicRank: 1, sponsoredRank: null, asin,
    title: keyword, brand: "Acme", imageUrl: "", productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 99, originalPrice: null, couponText: null, couponValue: null, couponRate: null,
    finalEstimatedPrice: 99, currency: "$", rating: 4.5, reviewCount: 10, isSponsored: false,
    isPrime: true, dealBadge: null, deliveryText: null, bsrRank: null, bsrCategory: null,
    bsrText: null, bestsellerRanks: [], detailCollectedAt: null,
    dataSource, lastSyncedAt, syncStatus: "success"
  };
}

function taskLog(orgId: number, keywordId: number, keyword: string) {
  return {
    orgId, taskType: "keyword_collect", keywordId, keyword, marketplace: "amazon.com" as string | null,
    status: "success" as const, startTime: "2026-07-18T01:00:00.000Z", endTime: "2026-07-18T01:01:00.000Z",
    pageCount: 1, successCount: 1, failCount: 0, errorMessage: null, retryCount: 0
  };
}
