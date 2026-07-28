import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AiProductResearchResponse,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryMonitor
} from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;
let token: string;
const EVIDENCE_DATE = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  token = login.body.token as string;
});

afterEach(() => db.close());

describe("Product Research Agent route", () => {
  it("persists evidence-backed category research and keeps every action approval-gated", async () => {
    const category = createCategory();
    store.insertCategorySnapshots([
      snapshot(category, "B0RESEARCH1", "Alpha", 8, 89.99, 48),
      snapshot(category, "B0RESEARCH2", "Alpha", 22, 109.99, 180),
      snapshot(category, "B0RESEARCH3", "Beta", 46, 159.99, 1200)
    ]);
    store.replaceCategorySignals(category.id, EVIDENCE_DATE, [{
      signalDate: EVIDENCE_DATE,
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      signalType: "new_product_breakout",
      alertLevel: "P1",
      asin: "B0RESEARCH1",
      brand: "Alpha",
      title: "Alpha research product",
      rank: 8,
      previousRank: null,
      price: 89.99,
      previousPrice: null,
      content: "New product breakout"
    }]);
    store.addCategoryCompetitor("B0RESEARCH2", category.id);
    store.replaceBrandMatrix(category.id, EVIDENCE_DATE, [
      brandEvidence(category, "Alpha", 2, 2, 1, 8),
      brandEvidence(category, "Beta", 1, 1, 0, 46)
    ]);

    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: EVIDENCE_DATE })
      .expect(201);
    const body = response.body as AiProductResearchResponse;

    expect(body.context).toMatchObject({
      categoryId: category.id,
      snapshotCount: 3,
      brandCount: 2,
      minimumPrice: 89.99,
      medianPrice: 109.99,
      maximumPrice: 159.99,
      lowReviewTop50Count: 2
    });
    expect(body.context.recommendedCompetitors).toEqual([
      expect.objectContaining({
        asin: "B0RESEARCH1",
        candidateType: "breakout_low_review",
        isInCompetitorPool: false
      }),
      expect.objectContaining({
        asin: "B0RESEARCH2",
        candidateType: "low_review_top50",
        isInCompetitorPool: true
      })
    ]);
    expect(body.output.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("价格带"),
      expect.stringContaining("Review VOC")
    ]));
    expect(body.output.artifacts?.productLaunchBrief).toMatchObject({
      title: "Ice Makers 新品立项草案",
      evidenceDate: EVIDENCE_DATE,
      decision: "validate",
      priceBand: {
        minimum: 89.99,
        target: 109.99,
        maximum: 159.99,
        currency: "USD"
      },
      customerPainEvidence: {
        status: "data_gap"
      }
    });
    expect(body.output.artifacts?.productLaunchBrief?.competitorMatrix).toEqual([
      expect.objectContaining({ asin: "B0RESEARCH1", rank: 8, signal: "新品黑马 · 低 Review" }),
      expect.objectContaining({ asin: "B0RESEARCH2", rank: 22, signal: "Top50 · 低 Review" }),
      expect.objectContaining({ asin: "B0RESEARCH3", rank: 46, signal: "榜单 #46" })
    ]);
    expect(body.output.artifacts?.productLaunchBrief?.validationChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: "Review VOC 与用户问题验证", gate: "required" }),
      expect.objectContaining({ item: "利润安全线", gate: "required" }),
      expect.objectContaining({ item: "新品黑马路径复核", gate: "recommended" })
    ]));
    expect(body.output.recommended_actions.every((action) => action.needs_human_approval)).toBe(true);
    expect(body.output.dataFreshness).toMatchObject({
      evidenceDate: EVIDENCE_DATE,
      dataSource: "manual",
      syncStatus: "manual",
      freshnessStatus: "fresh",
      maxAgeHours: 24,
      warning: null
    });
    expect(body.run).toMatchObject({
      agentType: "product_research",
      model: "deterministic-product-research-v3",
      status: "success"
    });
    const persistedRun = store.listAiRuns({ agentType: "product_research" })[0];
    expect(persistedRun?.output?.artifacts?.productLaunchBrief?.competitorMatrix).toHaveLength(3);
  });

  it("reports the data gap without creating a high-priority recommendation", async () => {
    const category = createCategory();
    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: "2026-06-20" })
      .expect(201);

    expect(response.body.output.confidence).toBeLessThan(0.5);
    expect(response.body.output.summary).toContain("暂无榜单快照");
    expect(response.body.output.recommended_actions).toEqual([
      expect.objectContaining({ priority: "P2", needs_human_approval: true })
    ]);
    expect(response.body.output.artifacts?.productLaunchBrief).toBeUndefined();
  });

  it("creates required launch-validation tasks once and keeps them linked to the Agent run", async () => {
    const category = createCategory();
    store.insertCategorySnapshots([
      snapshot(category, "B0VALIDATE1", "Alpha", 8, 109.99, 48),
      snapshot(category, "B0VALIDATE2", "Beta", 31, 139.99, 160)
    ]);
    const research = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: EVIDENCE_DATE })
      .expect(201);
    const runId = research.body.run.id as number;

    const created = await request(app)
      .post(`/api/ai/runs/${runId}/product-launch-brief/tasks`)
      .set("x-amazon-monitor-session", token)
      .expect(201);

    expect(created.body).toMatchObject({
      runId,
      requiredGateCount: 4,
      createdCount: 4,
      existingCount: 0
    });
    expect(created.body.tasks).toEqual([
      expect.objectContaining({
        sourceType: "ai_run",
        sourceId: String(runId),
        title: "[新品立项] Review VOC 与用户问题验证",
        taskType: "review",
        priority: "P1",
        relatedCategoryId: category.id,
        createdBy: 1
      }),
      expect.objectContaining({ title: "[新品立项] 利润安全线", taskType: "price" }),
      expect.objectContaining({ title: "[新品立项] 专利与合规审查", taskType: "other" }),
      expect.objectContaining({ title: "[新品立项] 供应链可行性", taskType: "supplier" })
    ]);
    expect(created.body.tasks[0].description).toContain("完成并复核证据前，不得视为通过立项");
    expect(store.listTasks({ orgId: 1, sourceType: "ai_run", sourceId: String(runId) })).toHaveLength(4);

    const repeated = await request(app)
      .post(`/api/ai/runs/${runId}/product-launch-brief/tasks`)
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(repeated.body).toMatchObject({
      requiredGateCount: 4,
      createdCount: 0,
      existingCount: 4
    });
    expect(repeated.body.tasks.map((task: { id: number }) => task.id)).toEqual(
      created.body.tasks.map((task: { id: number }) => task.id)
    );
    expect(store.listTasks({ orgId: 1, sourceType: "ai_run", sourceId: String(runId) })).toHaveLength(4);
  });

  it("rejects launch-task creation without a launch brief or workflow write access", async () => {
    const category = createCategory();
    const research = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: "2026-06-20" })
      .expect(201);

    await request(app)
      .post(`/api/ai/runs/${research.body.run.id}/product-launch-brief/tasks`)
      .set("x-amazon-monitor-session", token)
      .expect(409);

    store.createUser({
      orgId: 1,
      username: "launch-viewer",
      password: "Viewer123!",
      role: "viewer"
    });
    const viewer = await request(app)
      .post("/api/auth/login")
      .send({ username: "launch-viewer", password: "Viewer123!" })
      .expect(200);

    await request(app)
      .post(`/api/ai/runs/${research.body.run.id}/product-launch-brief/tasks`)
      .set("x-amazon-monitor-session", viewer.body.token as string)
      .expect(403);
  });

  it("downgrades stale evidence to observation and blocks launch-validation tasks", async () => {
    const category = createCategory();
    const staleDate = "2026-01-01";
    store.insertCategorySnapshots([
      snapshot(category, "B0STALE001", "Archive", 9, 99.99, 42, staleDate)
    ]);

    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: staleDate })
      .expect(201);

    expect(response.body.output).toMatchObject({
      confidence: 0.49,
      dataFreshness: {
        evidenceDate: staleDate,
        freshnessStatus: "stale",
        maxAgeHours: 24,
        warning: expect.stringContaining("请重新采集")
      },
      artifacts: {
        productLaunchBrief: {
          decision: "hold",
          opportunityThesis: expect.stringContaining("不可进入立项验证")
        }
      }
    });
    expect(response.body.output.summary).toContain("不可用于当前立项判断");
    expect(response.body.output.recommended_actions).toEqual([
      expect.objectContaining({
        action: expect.stringContaining("重新采集"),
        priority: "P2",
        needs_human_approval: true
      })
    ]);

    await request(app)
      .post(`/api/ai/runs/${response.body.run.id}/product-launch-brief/tasks`)
      .set("x-amazon-monitor-session", token)
      .expect(409);
  });

  it("derives brand evidence from snapshots when the brand matrix is unavailable", async () => {
    const category = createCategory();
    store.insertCategorySnapshots([
      snapshot(category, "B0FALLBACK1", "Northstar", 18, 99.99, 134),
      snapshot(category, "B0FALLBACK2", "Northstar", 31, 119.99, 260),
      snapshot(category, "B0FALLBACK3", "Clearice", 12, 149.99, 480)
    ]);

    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: EVIDENCE_DATE })
      .expect(201);

    expect(response.body.context).toMatchObject({
      brandCount: 2,
      topBrands: [
        { brand: "Northstar", top100Count: 2, top20Count: 1, bestRank: 18 },
        { brand: "Clearice", top100Count: 1, top20Count: 1, bestRank: 12 }
      ]
    });
  });

  it("rejects roles without competitor research capability", async () => {
    const category = createCategory();
    store.createUser({
      orgId: 1,
      username: "ads-only",
      password: "AdsOnly123!",
      role: "ads_operator"
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "ads-only", password: "AdsOnly123!" })
      .expect(200);

    await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", login.body.token as string)
      .send({ categoryId: category.id, date: "2026-06-20" })
      .expect(403);
  });
});

function createCategory(): CategoryMonitor {
  return store.createCategoryMonitor({
    name: "Ice Makers",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
    categoryPath: "Appliances > Ice Makers",
    crawlTopN: 100,
    status: "enabled"
  });
}

function snapshot(
  category: CategoryMonitor,
  asin: string,
  brand: string,
  rank: number,
  price: number,
  reviewCount: number,
  snapshotDate = EVIDENCE_DATE
): BestsellerRankSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate,
    rank,
    asin,
    title: `${brand} research product`,
    brand,
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: price,
    originalPrice: null,
    couponText: null,
    currency: "USD",
    rating: 4.4,
    reviewCount,
    isPrime: true,
    dealBadge: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: price,
    bsrRank: rank,
    bsrCategory: category.name
  };
}

function brandEvidence(
  category: CategoryMonitor,
  brand: string,
  top100: number,
  top50: number,
  top20: number,
  bestRank: number
): BrandMatrixSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: EVIDENCE_DATE,
    brand,
    productCountTop100: top100,
    productCountTop50: top50,
    productCountTop20: top20,
    bestRank,
    averageRank: bestRank,
    newEntryCount: 0,
    droppedCount: 0,
    rankUpCount: 0,
    rankDownCount: 0,
    priceDownCount: 0,
    couponCount: 0,
    dealCount: 0,
    topAsins: []
  };
}
