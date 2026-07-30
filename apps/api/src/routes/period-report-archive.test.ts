import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
import type { ReportPdfInput } from "../reports/report-pdf.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let adminToken: string;
let lastPdfInput: ReportPdfInput | null;

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  lastPdfInput = null;
  app = createApiApp(store, {
    reportPdfRenderer: async (input) => {
      lastPdfInput = input;
      return Buffer.from("%PDF-1.7\nfixture");
    }
  });
  adminToken = await login("admin", "admin123");
});

afterEach(() => {
  db.close();
});

describe("period report archive routes", () => {
  it("generates versioned weekly and monthly reports from organization-scoped evidence", async () => {
    const usProduct = seedProduct("US", "WEEK-US", "B0WEEKUS01");
    const ukProduct = seedProduct("UK", "WEEK-UK", "B0WEEKUK01");
    seedMetric(usProduct.id, "2026-07-10", 80, 0.25);
    seedMetric(usProduct.id, "2026-07-17", 100, 0.3);
    seedMetric(ukProduct.id, "2026-07-17", 200, 0.25);
    seedAds(usProduct.id, "2026-07-10", 20, 100);
    seedAds(usProduct.id, "2026-07-17", 35, 100);
    store.upsertProductListingSnapshot({
      productId: usProduct.id,
      date: "2026-07-17",
      title: "Ice Maker",
      bulletPoints: ["Fast ice"],
      imageUrls: ["https://example.com/1.jpg"],
      coreKeywords: ["ice maker"]
    });
    store.upsertProductReview({
      productId: usProduct.id,
      reviewDate: "2026-07-16",
      rating: 2,
      title: "Too loud",
      body: "The machine is loud.",
      sentiment: "negative",
      topics: ["noise"]
    });
    seedInsightEvent();
    completeTask();

    const otherOrg = store.createOrganization({ name: "Other report org" });
    const otherProduct = store.createProduct({
      orgId: otherOrg.id,
      marketplace: "US",
      sku: "OTHER-ORG-SKU",
      asin: "B0OTHERORG",
      title: "Other organization product",
      status: "active"
    });
    seedMetric(otherProduct.id, "2026-07-17", 9999, 0.8);

    const weekly = await request(app)
      .post("/api/reports/period/generate")
      .set("Cookie", adminToken)
      .send({ period: "weekly", endDate: "2026-07-17" })
      .expect(201);

    expect(weekly.body).toMatchObject({
      orgId: 1,
      period: "weekly",
      startDate: "2026-07-11",
      endDate: "2026-07-17",
      coverageStatus: "complete",
      salesMarketplaceCount: 2,
      insightCount: 1,
      completedTaskCount: 1,
      version: 1,
      generatedByName: "Administrator"
    });
    for (let index = 1; index <= 8; index += 1) {
      expect(weekly.body.markdown).toContain(`## ${index}.`);
    }
    expect(weekly.body.markdown).toContain("US：销售 $100");
    expect(weekly.body.markdown).toContain("UK：销售 £200");
    expect(weekly.body.markdown).toContain("ACOS 35.0%（上期 20.0%）");
    expect(weekly.body.markdown).toContain("Listing / Review 问题");
    expect(weekly.body.markdown).toContain("下周重点动作建议");
    expect(weekly.body.markdown).not.toContain("OTHER-ORG-SKU");
    expect(weekly.body.markdown).not.toContain("9,999");

    await request(app)
      .post("/api/reports/period/generate")
      .set("Cookie", adminToken)
      .send({ period: "weekly", endDate: "2026-07-17" })
      .expect(201);
    const archive = await request(app)
      .get("/api/reports/period/archive?period=weekly&endDate=2026-07-17")
      .set("Cookie", adminToken)
      .expect(200);
    expect(archive.body.version).toBe(2);
    expect(store.countPeriodReportArchives(1, "weekly")).toBe(1);
    expect(store.getPeriodReportArchive(otherOrg.id, "weekly", "2026-07-17")).toBeNull();

    const monthly = await request(app)
      .post("/api/reports/period/generate")
      .set("Cookie", adminToken)
      .send({ period: "monthly", endDate: "2026-07-17" })
      .expect(201);
    expect(monthly.body).toMatchObject({
      period: "monthly",
      startDate: "2026-06-18",
      endDate: "2026-07-17"
    });
    expect(monthly.body.markdown).toContain("跨境电商运营月报");
    expect(monthly.body.markdown).toContain("下月重点动作建议");

    const history = await request(app)
      .get("/api/reports/period/history?period=weekly&limit=10")
      .set("Cookie", adminToken)
      .expect(200);
    expect(history.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
    expect(history.body.items).toHaveLength(1);

    const markdown = await request(app)
      .get("/api/reports/period.md?period=weekly&endDate=2026-07-17")
      .set("Cookie", adminToken)
      .expect(200)
      .expect("Content-Type", /text\/markdown/);
    expect(markdown.text).toContain("跨境电商运营周报");

    const pdf = await request(app)
      .get("/api/reports/period.pdf?period=weekly&endDate=2026-07-17")
      .set("Cookie", adminToken)
      .expect(200)
      .expect("Content-Type", /application\/pdf/)
      .expect("Content-Disposition", 'attachment; filename="operations-weekly-2026-07-17.pdf"');
    expect(pdf.body.subarray(0, 8).toString()).toBe("%PDF-1.7");
    expect(lastPdfInput).toMatchObject({
      title: "跨境电商运营周报",
      subtitle: "2026-07-11 - 2026-07-17",
      version: 2,
      generatedByName: "Administrator"
    });
  });

  it("allows report readers to inspect archives but keeps generation and export approval-gated", async () => {
    await request(app)
      .post("/api/reports/period/generate")
      .set("Cookie", adminToken)
      .send({ period: "weekly", endDate: "2026-07-17" })
      .expect(201);
    store.createUser({
      orgId: 1,
      username: "period-viewer",
      password: "Viewer123!",
      role: "viewer",
      displayName: "Period Viewer"
    });
    const viewerToken = await login("period-viewer", "Viewer123!");

    await request(app)
      .get("/api/reports/period/history?period=weekly")
      .set("Cookie", viewerToken)
      .expect(200);
    await request(app)
      .get("/api/reports/period/archive?period=weekly&endDate=2026-07-17")
      .set("Cookie", viewerToken)
      .expect(200);
    await request(app)
      .post("/api/reports/period/generate")
      .set("Cookie", viewerToken)
      .send({ period: "weekly", endDate: "2026-07-17" })
      .expect(403);
    await request(app)
      .get("/api/reports/period.md?period=weekly&endDate=2026-07-17")
      .set("Cookie", viewerToken)
      .expect(403);
    await request(app)
      .get("/api/reports/period.pdf?period=weekly&endDate=2026-07-17")
      .set("Cookie", viewerToken)
      .expect(403);
  });
});

function seedProduct(marketplace: string, sku: string, asin: string) {
  return store.createProduct({
    orgId: 1,
    marketplace,
    sku,
    asin,
    brand: "Northstar",
    title: `${sku} ice maker`,
    status: "active"
  });
}

function seedMetric(productId: number, date: string, salesAmount: number, grossMargin: number): void {
  store.upsertProductDailyMetric({
    productId,
    date,
    salesAmount,
    orders: 5,
    grossMargin,
    dataSource: "manual",
    syncStatus: "manual"
  });
}

function seedAds(productId: number, date: string, spend: number, sales: number): void {
  store.upsertAdDailyMetric({
    orgId: 1,
    productId,
    date,
    campaignId: `campaign-${date}`,
    campaignName: "Exact core terms",
    spend,
    sales,
    dataSource: "manual",
    syncStatus: "manual"
  });
}

function seedInsightEvent(): void {
  store.upsertInsightEvent({
    id: "weekly-price-drop",
    eventDate: "2026-07-16",
    asin: "B0COMPETE1",
    brand: "Competitor",
    categoryId: 1,
    keywordId: null,
    eventType: "PRICE_DROP",
    eventLevel: "P1",
    eventTitle: "Competitor price dropped",
    eventSummary: "Price moved from 199 to 179.",
    attributionTags: ["PRICE_DRIVEN"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      priceBefore: 199,
      priceAfter: 179,
      evidenceItems: ["Consecutive snapshots"]
    },
    scoreTotal: 78,
    scoreLevel: "B",
    scoreBreakdown: {
      rankingScore: 10,
      productScore: 10,
      promoScore: 30,
      brandScore: 8,
      riskScore: 20,
      reasons: ["Price pressure"]
    },
    suggestedAction: "Review our price safety line before responding.",
    status: "TODO",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null
  });
}

function completeTask(): void {
  const task = store.createTask({
    orgId: 1,
    sourceType: "manual",
    sourceId: null,
    title: "Review core term budget",
    description: "Evidence-backed budget review.",
    taskType: "ad",
    priority: "P1",
    dueDate: "2026-07-17",
    createdBy: 1
  });
  store.transitionTaskStatus(task.id, "in_progress");
  store.submitTaskForReview(task.id, {
    actionTaken: "Reduced waste terms and retained the core campaign.",
    resultBefore: [{ label: "ACOS", value: "38", unit: "%" }],
    resultAfter: [{ label: "ACOS", value: "31", unit: "%" }]
  });
  store.transitionTaskStatus(task.id, "done");
  store.reviewTask(task.id, { reviewResult: "CONFIRMED", reviewNote: "Efficiency improved." });
  db.prepare("UPDATE tasks SET completed_at = ?, reviewed_at = ? WHERE id = ?")
    .run("2026-07-17T08:00:00.000Z", "2026-07-17T09:00:00.000Z", task.id);
}

async function login(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
    .expect(200);
  return response.headers["set-cookie"][0] as string;
}
