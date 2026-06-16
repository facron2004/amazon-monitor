import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { SerpProductInput } from "@amazon-monitor/shared";
import type { AmazonSearchCollector, CollectedSearchPage } from "./amazon-collector.js";
import { createApiApp } from "./server.js";
import { createStore, initSchema } from "./store.js";
import { runCollectionForKeyword } from "./pipeline.js";
import { DAILY_REPORT_SHEET_NAMES, getWorkbookSheetNames } from "./test-support/xlsx.js";

class ControlledAmazonSearchCollector implements AmazonSearchCollector {
  async collect(): Promise<CollectedSearchPage[]> {
    return [
      {
        pageNo: 1,
        url: "https://www.amazon.com/s?k=cordless+leaf+blower&page=1",
        products: [product("B0ACME600F", "Acme Cordless Leaf Blower", 99.99)]
      }
    ];
  }
}

describe("api routes", () => {
  it("starts empty, accepts keyword configuration, and can trigger real collector pipeline", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store, { collector: new ControlledAmazonSearchCollector() });

    const emptySummary = await request(app).get("/api/dashboard/summary?date=2026-05-17").expect(200);
    expect(emptySummary.body.activeKeywordCount).toBe(0);

    const created = await request(app)
      .post("/api/keywords")
      .send({ keyword: "cordless leaf blower", marketplace: "amazon.com", crawlPages: 1 })
      .expect(201);

    const collect = await request(app).post("/api/collect/run").send({ keywordId: created.body.id, date: "2026-05-17" }).expect(202);
    expect(collect.body.status).toBe("pending");
    await runCollectionForKeyword(store, created.body.id, "2026-05-17", { collector: new ControlledAmazonSearchCollector() });

    const folders = await request(app).get("/api/competitor-folders").expect(200);
    expect(folders.body[0]).toMatchObject({ keywordId: created.body.id, competitorCount: 1 });

    const filtered = await request(app).get(`/api/competitors?keywordId=${created.body.id}`).expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0]).toMatchObject({ asin: "B0ACME600F", latestBsrRank: 18 });

    const bsrHistory = await request(app).get(`/api/bsr/history?date=2026-05-17&sourceType=keyword_detail&sourceId=${created.body.id}`).expect(200);
    expect(bsrHistory.body[0]).toMatchObject({ asin: "B0ACME600F", category: "Leaf Blowers", rank: 18, isSpecificRank: true });

    const bsrChanges = await request(app).get(`/api/bsr/changes?date=2026-05-17&sourceType=keyword_detail&sourceId=${created.body.id}`).expect(200);
    expect(bsrChanges.body[0]).toMatchObject({ asin: "B0ACME600F", changeType: "new_entry", currentRank: 18, previousRank: null });

    const actionInsights = await request(app).get(`/api/action-insights?date=2026-05-17&sourceType=keyword_detail&sourceId=${created.body.id}`).expect(200);
    expect(actionInsights.body).toEqual([]);

    await request(app).post("/api/collect/run").send({ keywordId: created.body.id, date: "2026-05-18" }).expect(202);
    await runCollectionForKeyword(store, created.body.id, "2026-05-18", { collector: new ControlledAmazonSearchCollector() });

    const unchangedHidden = await request(app)
      .get(`/api/bsr/changes?date=2026-05-18&sourceType=keyword_detail&sourceId=${created.body.id}`)
      .expect(200);
    expect(unchangedHidden.body).toHaveLength(0);
    const unchangedVisible = await request(app)
      .get(`/api/bsr/changes?date=2026-05-18&sourceType=keyword_detail&sourceId=${created.body.id}&includeUnchanged=true`)
      .expect(200);
    expect(unchangedVisible.body[0]).toMatchObject({ asin: "B0ACME600F", changeType: "unchanged", currentRank: 18, previousRank: 18 });

    const link = await request(app).get("/api/competitors/B0ACME600F/link").expect(200);
    expect(link.body.url).toContain("/dp/B0ACME600F");

    await request(app).get("/api/competitors/B0ACME600F/open").expect(302).expect("Location", /\/dp\/B0ACME600F/);

    const report = await request(app).get("/api/reports/daily?date=2026-05-17").expect(200);
    expect(report.body.markdown).toContain("Amazon 关键词竞品监控日报");

    const excel = await request(app)
      .get("/api/reports/daily.xlsx?date=2026-05-17")
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(excel.headers["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(excel.headers["content-disposition"]).toContain("amazon-monitor-2026-05-17.xlsx");
    const excelBuffer = excel.body as Buffer;
    expect(excelBuffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(getWorkbookSheetNames(excelBuffer)).toEqual(DAILY_REPORT_SHEET_NAMES);

    await request(app).post("/api/demo/seed").expect(404);
  });
});

function binaryParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error: Error) => callback(error));
}

function product(asin: string, title: string, currentPrice: number): SerpProductInput {
  return {
    asin,
    title,
    brand: title.split(" ")[0],
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText: null,
    currency: "$",
    rating: 4.4,
    reviewCount: 500,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: "Tomorrow",
    bsrRank: 2345,
    bsrCategory: "Patio, Lawn & Garden",
    bsrText: "#2,345 in Patio, Lawn & Garden",
    bestsellerRanks: [{ rank: 18, category: "Leaf Blowers", url: "https://www.amazon.com/gp/bestsellers/lawn-garden/123" }],
    detailCollectedAt: "2026-05-17T00:00:00.000Z"
  };
}

describe("api authentication and docs", () => {
  const originalApiKey = process.env.AMAZON_MONITOR_API_KEY;

  it("serves OpenAPI document and Swagger UI without authentication", async () => {
    process.env.AMAZON_MONITOR_API_KEY = "test-secret-key";
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);

    await request(app).get("/api-docs").expect(200);
    await request(app).get("/api/openapi.json").expect(200);
    await request(app).get("/api/health").expect(200);

    if (originalApiKey) {
      process.env.AMAZON_MONITOR_API_KEY = originalApiKey;
    } else {
      delete process.env.AMAZON_MONITOR_API_KEY;
    }
  });

  it("enforces API key validation when AMAZON_MONITOR_API_KEY is configured", async () => {
    process.env.AMAZON_MONITOR_API_KEY = "test-secret-key";
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);

    // 1. Unauthenticated request should return 401
    const unauthResponse = await request(app)
      .get("/api/dashboard/summary?date=2026-05-17")
      .expect(401);
    expect(unauthResponse.body.message).toContain("Unauthorized");

    // 2. Request with incorrect key should return 401
    await request(app)
      .get("/api/dashboard/summary?date=2026-05-17")
      .set("Authorization", "Bearer wrong-key")
      .expect(401);

    // 3. Request with correct key should return 200
    await request(app)
      .get("/api/dashboard/summary?date=2026-05-17")
      .set("Authorization", "Bearer test-secret-key")
      .expect(200);

    if (originalApiKey) {
      process.env.AMAZON_MONITOR_API_KEY = originalApiKey;
    } else {
      delete process.env.AMAZON_MONITOR_API_KEY;
    }
  });
});

describe("queue routing", () => {
  it("allows pushing, listing, and retrieving job status via API", async () => {
    delete process.env.AMAZON_MONITOR_API_KEY;
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);

    const created = await request(app)
      .post("/api/keywords")
      .send({ keyword: "test keyword", marketplace: "amazon.com", crawlPages: 1 })
      .expect(201);

    const postRes = await request(app)
      .post("/api/collect/run")
      .send({ keywordId: created.body.id, date: "2026-06-11" })
      .expect(202);

    expect(postRes.body).toMatchObject({
      taskType: "keyword",
      targetId: created.body.id,
      date: "2026-06-11",
      status: "pending"
    });

    const listRes = await request(app)
      .get("/api/collect/jobs")
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(postRes.body.id);

    const getRes = await request(app)
      .get(`/api/collect/jobs/${postRes.body.id}`)
      .expect(200);

    expect(getRes.body).toMatchObject(postRes.body);

    await request(app)
      .get("/api/collect/jobs/99999")
      .expect(404);
  });
});
