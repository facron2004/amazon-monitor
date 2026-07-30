import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UserRole } from "@amazon-monitor/shared";
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

describe("daily report archive routes", () => {
  it("generates the complete report structure and keeps one versioned archive per date", async () => {
    store.saveDailyReport("2026-07-10", "ice maker", "# Keyword Daily Report\n\nEvidence from collection.");
    store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "Review competitor price move",
      description: "Validate the source evidence before changing price.",
      taskType: "price",
      priority: "P0",
      dueDate: "2026-07-10",
      relatedAsin: "B0TEST0001",
      createdBy: 1
    });

    const generated = await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", adminToken)
      .send({ date: "2026-07-10" })
      .expect(201);

    expect(generated.body).toMatchObject({
      orgId: 1,
      reportDate: "2026-07-10",
      coverageStatus: "partial",
      taskCount: 1,
      version: 1,
      generatedBy: 1,
      generatedByName: "Administrator"
    });
    for (let index = 1; index <= 9; index += 1) {
      expect(generated.body.markdown).toContain(`## ${index}.`);
    }
    expect(generated.body.markdown).toContain("# Keyword Daily Report");
    expect(generated.body.markdown).toContain("人工审批：需要");

    const history = await request(app)
      .get("/api/reports/daily/history?limit=10")
      .set("Cookie", adminToken)
      .expect(200);
    expect(history.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
    expect(history.body.items).toHaveLength(1);

    await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", adminToken)
      .send({ date: "2026-07-10" })
      .expect(201);

    const archive = await request(app)
      .get("/api/reports/daily/archive?date=2026-07-10")
      .set("Cookie", adminToken)
      .expect(200);
    expect(archive.body.version).toBe(2);
    expect(store.countDailyReportArchives(1)).toBe(1);

    const markdown = await request(app)
      .get("/api/reports/daily.md?date=2026-07-10")
      .set("Cookie", adminToken)
      .expect(200)
      .expect("Content-Type", /text\/markdown/);
    expect(markdown.text).toContain("跨境电商运营日报");

    const pdf = await request(app)
      .get("/api/reports/daily.pdf?date=2026-07-10")
      .set("Cookie", adminToken)
      .expect(200)
      .expect("Content-Type", /application\/pdf/)
      .expect("Content-Disposition", 'attachment; filename="operations-daily-2026-07-10.pdf"');
    expect(pdf.body.subarray(0, 8).toString()).toBe("%PDF-1.7");
    expect(lastPdfInput).toMatchObject({
      title: "跨境电商运营日报",
      subtitle: "业务日期 2026-07-10",
      version: 2,
      generatedByName: "Administrator"
    });
  });

  it("includes rating and Listing evidence in competitor changes", async () => {
    store.upsertInsightEvent(reportEvent({
      id: "rating-drop",
      eventType: "RATING_DROP",
      evidence: { ratingBefore: 4.6, ratingAfter: 4.3 },
      suggestedAction: "复核近期差评主题。"
    }));
    store.upsertInsightEvent(reportEvent({
      id: "listing-change",
      eventType: "LISTING_CHANGED",
      evidence: {
        listingChangedFields: ["title", "mainImage"],
        titleBefore: "Old ice maker title",
        titleAfter: "New nugget ice maker title"
      },
      suggestedAction: "检查新标题和主图表达。"
    }));

    const generated = await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", adminToken)
      .send({ date: "2026-07-10" })
      .expect(201);

    expect(generated.body.coverage.competitorChanges).toBe(2);
    expect(generated.body.markdown).toContain("评分下降，评分 4.6 -> 4.3");
    expect(generated.body.markdown).toContain("Listing 变化，变更字段：标题、主图");
    expect(generated.body.markdown).toContain("Old ice maker title");
    expect(generated.body.markdown).toContain("检查新标题和主图表达");
  });

  it("allows report-capable roles to generate and export reports", async () => {
    const roles: UserRole[] = ["manager", "operator", "ads_operator", "product_researcher"];
    for (const role of roles) {
      const username = `report-${role}`;
      store.createUser({
        orgId: 1,
        username,
        password: "ReportRole123!",
        role,
        displayName: role
      });
      const roleToken = await login(username, "ReportRole123!");
      await request(app)
        .post("/api/reports/daily/generate")
        .set("Cookie", roleToken)
        .send({ date: "2026-07-10" })
        .expect(201);
      await request(app)
        .get("/api/reports/daily.md?date=2026-07-10")
        .set("Cookie", roleToken)
        .expect(200);
    }
  });

  it("allows viewers to read report history but blocks generation and export", async () => {
    await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", adminToken)
      .send({ date: "2026-07-10" })
      .expect(201);
    store.createUser({
      orgId: 1,
      username: "report-viewer",
      password: "Viewer123!",
      role: "viewer",
      displayName: "Report Viewer"
    });
    const viewerToken = await login("report-viewer", "Viewer123!");

    await request(app).get("/api/reports/daily/history").expect(401);
    await request(app)
      .get("/api/reports/daily/history")
      .set("Cookie", viewerToken)
      .expect(200);
    await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", viewerToken)
      .send({ date: "2026-07-10" })
      .expect(403);
    await request(app)
      .get("/api/reports/daily.md?date=2026-07-10")
      .set("Cookie", viewerToken)
      .expect(403);
    await request(app)
      .get("/api/reports/daily.pdf?date=2026-07-10")
      .set("Cookie", viewerToken)
      .expect(403);
    await request(app)
      .get("/api/reports/daily.xlsx?date=2026-07-10")
      .set("Cookie", viewerToken)
      .expect(403);
  });

  it("maps missing report feeds to the responsible data source or collection action", async () => {
    const crawler = store.createDataSource({
      orgId: 1,
      name: "US public crawler",
      sourceType: "public_crawler",
      status: "connected",
      syncStatus: "success",
      lastSuccessAt: "2026-07-09T01:00:00.000Z"
    });
    store.createDataSource({
      orgId: 1,
      name: "US Ads API",
      sourceType: "amazon_ads_api",
      status: "attention",
      syncStatus: "failed",
      syncError: "Token expired"
    });
    const failedKeywordJob = store.pushJob("keyword", 1, "2026-07-10");
    const claimedKeywordJob = store.claimNextJob("archive-test-worker", 60_000);
    expect(claimedKeywordJob?.id).toBe(failedKeywordJob.id);
    store.failJob(
      claimedKeywordJob!.id,
      claimedKeywordJob!.leaseOwner,
      claimedKeywordJob!.leaseToken,
      "CAPTCHA blocked",
      1
    );
    expect(store.getJobStatus(failedKeywordJob.id)?.status).toBe("failed");

    await request(app)
      .post("/api/reports/daily/generate")
      .set("Cookie", adminToken)
      .send({ date: "2026-07-10" })
      .expect(201);

    const readiness = await request(app)
      .get("/api/reports/daily/readiness?date=2026-07-10")
      .set("Cookie", adminToken)
      .expect(200);

    expect(readiness.body).toMatchObject({
      reportDate: "2026-07-10",
      archiveGenerated: true,
      coverageStatus: "empty",
      gapsCount: 5
    });
    expect(readiness.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feed: "ownSkuMetrics",
        state: "missing",
        action: { target: "data-sources", label: "配置数据源" }
      }),
      expect.objectContaining({
        feed: "keywordSnapshots",
        state: "attention",
        action: { target: "collectors", label: "处理失败采集" },
        sources: [expect.objectContaining({ id: crawler.id, name: "US public crawler" })]
      }),
      expect.objectContaining({
        feed: "categorySnapshots",
        state: "missing",
        action: { target: "collectors", label: "运行采集" }
      }),
      expect.objectContaining({
        feed: "adsMetrics",
        state: "attention",
        action: { target: "data-sources", label: "检查连接" }
      })
    ]));

    await request(app).get("/api/reports/daily/readiness?date=2026-07-10").expect(401);
  });
});

async function login(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
    .expect(200);
  return response.headers["set-cookie"][0] as string;
}

interface ReportEventOverrides {
  id: string;
  eventType: "RATING_DROP" | "LISTING_CHANGED";
  evidence: {
    ratingBefore?: number;
    ratingAfter?: number;
    listingChangedFields?: Array<"title" | "mainImage">;
    titleBefore?: string;
    titleAfter?: string;
  };
  suggestedAction: string;
}

function reportEvent(overrides: ReportEventOverrides): Parameters<Store["upsertInsightEvent"]>[0] {
  return {
    id: overrides.id,
    eventDate: "2026-07-10",
    asin: "B0REPORT01",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: overrides.eventType,
    eventLevel: "P1",
    eventTitle: "Competitor detail changed",
    eventSummary: "Evidence-backed competitor change.",
    attributionTags: ["NO_CLEAR_DRIVER"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      evidenceItems: ["Consecutive category snapshots"],
      ...overrides.evidence
    },
    scoreTotal: 70,
    scoreLevel: "B",
    scoreBreakdown: {
      rankingScore: 10,
      productScore: 20,
      promoScore: 10,
      brandScore: 10,
      riskScore: 20,
      reasons: ["fixture"]
    },
    suggestedAction: overrides.suggestedAction,
    status: "TODO",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null
  };
}
