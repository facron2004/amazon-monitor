import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { BestSellerProductInput, BsrRankHistory, CategoryMonitor, CompetitorActionInsight } from "@amazon-monitor/shared";
import type { AmazonBestSellerCollector, CollectedBestSellerPage } from "./category-pipeline.js";
import { runCategoryCollectionForMonitor } from "./category-pipeline.js";
import { createApiApp } from "./server.js";
import { createStore, initSchema } from "./store.js";

class ControlledBestSellerCollector implements AmazonBestSellerCollector {
  constructor(private readonly productsByDate: Record<string, BestSellerProductInput[]>) {}

  async collect(category: CategoryMonitor, date: string): Promise<CollectedBestSellerPage[]> {
    return [
      {
        pageNo: 1,
        url: category.categoryUrl,
        products: this.productsByDate[date] ?? []
      }
    ];
  }
}

describe("category competitor intelligence", () => {
  it("creates rank-ordered indexes for hot category and BSR queries", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);

    const bestsellerIndexes = new Set(
      (db.prepare("PRAGMA index_list(amazon_bestseller_rank_snapshot)").all() as Array<{ name: string }>).map((item) => item.name)
    );
    const bsrIndexes = new Set((db.prepare("PRAGMA index_list(amazon_bsr_rank_history)").all() as Array<{ name: string }>).map((item) => item.name));
    const bsrQualityIndexes = new Set(
      (db.prepare("PRAGMA index_list(amazon_bsr_snapshot_quality)").all() as Array<{ name: string }>).map((item) => item.name)
    );

    expect(bestsellerIndexes.has("idx_bestseller_category_date_rank")).toBe(true);
    expect(bsrIndexes.has("idx_bsr_history_scope_rank")).toBe(true);
    expect(bsrQualityIndexes.has("idx_bsr_quality_latest_ok")).toBe(true);
  });

  it("persists best seller snapshots, brand matrix, signals, product links, and report from category collection", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Home-Kitchen-Ice-Makers/zgbs/home-garden/2399939011",
      categoryPath: "Home & Kitchen > Ice Makers",
      crawlTopN: 100,
      status: "enabled"
    });
    const collector = new ControlledBestSellerCollector({
      "2026-05-18": top100Products([
        product(3, "B0COOLICE1", "Acme Countertop Ice Maker", "Acme", 129.99, null, null),
        product(24, "B0FREEZE24", "FreezePro Nugget Ice Maker", "FreezePro", 219.99, null, null),
        product(68, "B0DROPONLY", "Old Brand Ice Machine", "OldBrand", 179.99, null, null)
      ]),
      "2026-05-19": top100Products([
        product(2, "B0COOLICE1", "Acme Countertop Ice Maker", "Acme", 109.99, "Save $20 with coupon", "Limited Time Deal"),
        product(18, "B0NEWBURST", "GlacierMini Portable Ice Maker", "GlacierMini", 89.99, null, "Prime Exclusive Deal"),
        product(51, "B0FREEZE24", "FreezePro Nugget Ice Maker", "FreezePro", 219.99, null, null)
      ])
    });

    await runCategoryCollectionForMonitor(store, category.id, "2026-05-18", { collector });
    const result = await runCategoryCollectionForMonitor(store, category.id, "2026-05-19", { collector });

    expect(result.status).toBe("success");
    expect(result.successCount).toBe(100);

    const detail = store.getCategoryDetail(category.id, "2026-05-19");
    expect(detail.snapshots.filter((item) => ["B0COOLICE1", "B0NEWBURST", "B0FREEZE24"].includes(item.asin)).map((item) => item.asin)).toEqual([
      "B0COOLICE1",
      "B0NEWBURST",
      "B0FREEZE24"
    ]);
    expect(detail.snapshots.find((item) => item.asin === "B0COOLICE1")).toMatchObject({
      rank: 2,
      couponValue: 20,
      finalEstimatedPrice: 89.99
    });
    expect(
      store
        .listBsrRankHistory({ date: "2026-05-19", sourceType: "category_bestseller", sourceId: category.id })
        .filter((item) => ["B0COOLICE1", "B0NEWBURST", "B0FREEZE24"].includes(item.asin))
        .map((item) => [item.asin, item.rank])
    ).toEqual([
      ["B0COOLICE1", 2],
      ["B0NEWBURST", 18],
      ["B0FREEZE24", 51]
    ]);
    expect(store.listBsrSnapshotQuality({ date: "2026-05-19", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      expectedCount: 100,
      actualCount: 100,
      uniqueAsinCount: 100,
      uniqueRankCount: 100,
      minRank: 1,
      maxRank: 100,
      qualityStatus: "ok"
    });
    expect(store.listBsrRankChanges({ date: "2026-05-19", sourceType: "category_bestseller", sourceId: category.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asin: "B0NEWBURST", changeType: "new_entry", currentRank: 18, previousRank: null }),
        expect.objectContaining({ asin: "B0DROPONLY", changeType: "dropped", currentRank: null, previousRank: 68 }),
        expect.objectContaining({ asin: "B0COOLICE1", changeType: "rank_up", currentRank: 2, previousRank: 3, rankChange: 1 }),
        expect.objectContaining({ asin: "B0FREEZE24", changeType: "rank_down", currentRank: 51, previousRank: 24, rankChange: -27 })
      ])
    );
    db.exec("DELETE FROM amazon_bsr_rank_history");
    initSchema(db);
    expect(store.listBsrRankHistory({ date: "2026-05-19", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(100);

    const acme = detail.brandMatrix.find((item) => item.brand === "Acme");
    expect(acme).toMatchObject({
      productCountTop100: 1,
      productCountTop50: 1,
      productCountTop20: 1,
      bestRank: 2,
      rankUpCount: 1,
      priceDownCount: 1,
      couponCount: 1,
      dealCount: 1
    });

    const glacier = detail.brandMatrix.find((item) => item.brand === "GlacierMini");
    expect(glacier).toMatchObject({
      productCountTop20: 1,
      newEntryCount: 1
    });

    expect(detail.signals.map((signal) => signal.signalType)).toEqual(
      expect.arrayContaining(["new_top_20", "new_product_breakout", "major_rank_down", "dropped_top_100", "price_drop", "new_coupon", "new_deal"])
    );
    expect(detail.report).toContain("Amazon 类目竞品情报日报");
    expect(
      store
        .listProductPriceHistory({ date: "2026-05-19", categoryId: category.id })
        .filter((item) => ["B0NEWBURST", "B0COOLICE1", "B0FREEZE24"].includes(item.asin))
        .map((item) => [item.asin, item.currentPrice, item.t30LowPrice])
    ).toEqual([
      ["B0NEWBURST", 89.99, 89.99],
      ["B0COOLICE1", 109.99, 109.99],
      ["B0FREEZE24", 219.99, 219.99]
    ]);
    expect(store.listCategoryActivityEvents({ date: "2026-05-19", categoryId: category.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asin: "B0NEWBURST", eventType: "new_entry_top50" }),
        expect.objectContaining({ asin: "B0COOLICE1", eventType: "price_drop" }),
        expect.objectContaining({ asin: "B0COOLICE1", eventType: "coupon_start" }),
        expect.objectContaining({ asin: "B0COOLICE1", eventType: "deal_start" })
      ])
    );
    expect(store.listCompetitorActionInsights({ date: "2026-05-19", sourceType: "category_bestseller", sourceId: category.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asin: "B0NEWBURST", insightType: "bsr_new_entry", currentRank: 18, previousDate: "2026-05-18" }),
        expect.objectContaining({ asin: "B0FREEZE24", insightType: "bsr_rank_drop", previousRank: 24, currentRank: 51, previousDate: "2026-05-18" }),
        expect.objectContaining({ asin: "B0COOLICE1", insightType: "price_drop_rank_lift", previousDate: "2026-05-18" })
      ])
    );
    expect(store.listCompetitors({ sourceType: "category" }).map((item) => [item.asin, item.latestCategoryRank, item.competitorTier])).toEqual(
      expect.arrayContaining([
        ["B0COOLICE1", 2, "core"],
        ["B0NEWBURST", 18, "core"],
        ["B0FREEZE24", 51, "rising"],
        ["B0DROPONLY", 68, "watch"]
      ])
    );
    const calendar = store.getProductActivityCalendar("B0COOLICE1", { date: "2026-05-19" });
    expect(calendar?.summary).toMatchObject({
      activeDays: 2,
      bestCategoryRank: 2,
      latestCategoryRank: 2
    });
    expect(calendar?.summary.eventCount).toBeGreaterThanOrEqual(4);
    expect(calendar?.days[0].events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["price_drop", "coupon_start", "deal_start"]));
    expect(calendar?.days[0].actionInsights.map((insight) => insight.insightType)).toEqual(expect.arrayContaining(["price_drop_rank_lift"]));
    expect(store.getCategoryProductLink("B0NEWBURST", category.id)?.url).toContain("/dp/B0NEWBURST");
    expect(store.getDashboardSummary("2026-05-19").categorySnapshotCount).toBe(100);
  });

  it("exposes category monitor, collection, detail, signal, and open-link API routes", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const collector = new ControlledBestSellerCollector({
      "2026-05-19": [product(1, "B0API00001", "Acme API Ice Maker", "Acme", 99.99, null, null)]
    });
    const app = createApiApp(store, { categoryCollector: collector });

    const created = await request(app)
      .post("/api/categories")
      .send({
        name: "Ice Makers",
        marketplace: "amazon.com",
        categoryUrl: "https://www.amazon.com/Best-Sellers/zgbs",
        categoryPath: "Home & Kitchen",
        crawlTopN: 1
      })
      .expect(201);

    await request(app).post(`/api/categories/${created.body.id}/collect`).send({ date: "2026-05-19" }).expect(200);

    const detail = await request(app).get(`/api/categories/${created.body.id}/detail?date=2026-05-19`).expect(200);
    expect(detail.body.brandMatrix[0]).toMatchObject({ brand: "Acme", productCountTop20: 1 });

    const signals = await request(app).get("/api/category-signals?date=2026-05-19").expect(200);
    expect(signals.body[0]).toMatchObject({ asin: "B0API00001", signalType: "new_top_20" });

    const priceHistory = await request(app).get(`/api/product-price-history?date=2026-05-19&categoryId=${created.body.id}`).expect(200);
    expect(priceHistory.body[0]).toMatchObject({ asin: "B0API00001", currentPrice: 99.99, t30LowPrice: 99.99 });

    const bsrQuality = await request(app).get(`/api/bsr/quality?date=2026-05-19&sourceType=category_bestseller&sourceId=${created.body.id}`).expect(200);
    expect(bsrQuality.body[0]).toMatchObject({ expectedCount: 1, actualCount: 1, qualityStatus: "ok" });

    const activityEvents = await request(app).get(`/api/activity-events?date=2026-05-19&categoryId=${created.body.id}`).expect(200);
    expect(activityEvents.body[0]).toMatchObject({ asin: "B0API00001", eventType: "new_entry_top50" });

    const actionInsights = await request(app)
      .get(`/api/action-insights?date=2026-05-19&sourceType=category_bestseller&sourceId=${created.body.id}`)
      .expect(200);
    expect(actionInsights.body[0]).toMatchObject({ asin: "B0API00001", insightType: "bsr_new_entry", currentRank: 1, previousDate: null });

    const competitors = await request(app).get("/api/competitors?sourceType=category").expect(200);
    expect(competitors.body[0]).toMatchObject({ asin: "B0API00001", sourceType: "category", latestCategoryRank: 1, competitorTier: "core" });

    const calendar = await request(app).get("/api/products/B0API00001/activity-calendar?date=2026-05-19").expect(200);
    expect(calendar.body.summary).toMatchObject({ activeDays: 1, bestCategoryRank: 1, latestCategoryRank: 1 });

    await request(app)
      .get(`/api/category-products/B0API00001/open?categoryId=${created.body.id}`)
      .expect(302)
      .expect("Location", /\/dp\/B0API00001/);
  });

  it("fails category collection when Best Sellers count is below the configured Top N and keeps existing rows", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 2,
      status: "enabled"
    });

    const successCollector = new ControlledBestSellerCollector({
      "2026-05-20": [
        product(1, "B0STRICT001", "Strict First Ice Maker", "Acme", 99, null, null),
        product(2, "B0STRICT002", "Strict Second Ice Maker", "Acme", 109, null, null)
      ]
    });
    const partialCollector = new ControlledBestSellerCollector({
      "2026-05-20": [product(1, "B0PARTIAL1", "Partial Ice Maker", "Beta", 89, null, null)]
    });

    await runCategoryCollectionForMonitor(store, category.id, "2026-05-20", { collector: successCollector });
    const failed = await runCategoryCollectionForMonitor(store, category.id, "2026-05-20", { collector: partialCollector });

    expect(failed.status).toBe("failed");
    expect(failed.successCount).toBe(1);
    expect(failed.errorMessage).toContain("strict count failed");
    expect(store.getCategoryMonitor(category.id)?.todayStatus).toBe("success");
    expect(store.listCategorySnapshots({ date: "2026-05-20", categoryId: category.id }).map((item) => item.asin)).toEqual([
      "B0STRICT001",
      "B0STRICT002"
    ]);
    expect(store.listBsrRankHistory({ date: "2026-05-20", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(2);
    expect(store.listBsrSnapshotQuality({ date: "2026-05-20", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      expectedCount: 2,
      actualCount: 2,
      qualityStatus: "ok"
    });
  });

  it("records Best Sellers page retry counts in category task logs", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const collector: AmazonBestSellerCollector = {
      async collect() {
        return [
          {
            pageNo: 1,
            url: category.categoryUrl,
            retryCount: 1,
            products: [
              product(1, "B0RETRY001", "Retry First Ice Maker", "Acme", 99, null, null),
              product(2, "B0RETRY002", "Retry Second Ice Maker", "Acme", 109, null, null)
            ]
          },
          {
            pageNo: 2,
            url: `${category.categoryUrl}?pg=2`,
            retryCount: 2,
            products: [product(3, "B0RETRY003", "Retry Third Ice Maker", "Acme", 119, null, null)]
          }
        ];
      }
    };

    const log = await runCategoryCollectionForMonitor(store, category.id, "2026-05-27", { collector });

    expect(log).toMatchObject({ status: "success", retryCount: 3, successCount: 3 });
  });

  it("keeps retry counts when strict BSR count fails", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 2,
      status: "enabled"
    });
    const collector: AmazonBestSellerCollector = {
      async collect() {
        return [
          {
            pageNo: 1,
            url: category.categoryUrl,
            retryCount: 2,
            products: [product(1, "B0RETRYFAIL", "Retry Failed Ice Maker", "Acme", 99, null, null)]
          }
        ];
      }
    };

    const log = await runCategoryCollectionForMonitor(store, category.id, "2026-05-28", { collector });

    expect(log).toMatchObject({ status: "failed", retryCount: 2, successCount: 1 });
    expect(log.errorMessage).toContain("strict count failed");
  });

  it("records BSR quality when a new category collection cannot meet strict Top N", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 2,
      status: "enabled"
    });
    const partialCollector = new ControlledBestSellerCollector({
      "2026-05-21": [product(1, "B0PARTIAL1", "Partial Ice Maker", "Beta", 89, null, null)]
    });

    const failed = await runCategoryCollectionForMonitor(store, category.id, "2026-05-21", { collector: partialCollector });

    expect(failed.status).toBe("failed");
    expect(failed.successCount).toBe(1);
    expect(store.getCategoryMonitor(category.id)?.todayStatus).toBe("failed");
    expect(store.listCategorySnapshots({ date: "2026-05-21", categoryId: category.id })).toHaveLength(0);
    expect(store.listBsrRankHistory({ date: "2026-05-21", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
    expect(store.listBsrRankChanges({ date: "2026-05-21", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
    expect(store.listBsrSnapshotQuality({ date: "2026-05-21", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      expectedCount: 2,
      actualCount: 1,
      uniqueAsinCount: 1,
      uniqueRankCount: 1,
      minRank: 1,
      maxRank: 1,
      qualityStatus: "partial"
    });
    expect(store.listBsrSnapshotQuality({ date: "2026-05-21", sourceType: "category_bestseller", sourceId: category.id })[0].issue).toContain(
      "strict count failed"
    );
    expect(store.listBsrSnapshotQuality({ date: "2026-05-21", sourceType: "category_bestseller", sourceId: category.id })[0].issue).toContain(
      "Missing ranks: #2."
    );
  });

  it("rejects category collection when rank coverage has duplicate ranks", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const collector = new ControlledBestSellerCollector({
      "2026-05-25": [
        product(1, "B0COVER001", "Coverage Ice Maker 1", "Acme", 89, null, null),
        product(3, "B0COVER003", "Coverage Ice Maker 3", "Acme", 99, null, null),
        product(3, "B0COVER004", "Coverage Ice Maker 4", "Beta", 109, null, null)
      ]
    });

    const failed = await runCategoryCollectionForMonitor(store, category.id, "2026-05-25", { collector });
    const quality = store.listBsrSnapshotQuality({ date: "2026-05-25", sourceType: "category_bestseller", sourceId: category.id })[0];

    expect(failed.status).toBe("failed");
    expect(failed.successCount).toBe(3);
    expect(failed.errorMessage).toContain("Expected 3 unique ranks, collected 2");
    expect(failed.errorMessage).toContain("Missing ranks: #2.");
    expect(failed.errorMessage).toContain("Duplicate ranks: #3.");
    expect(store.listCategorySnapshots({ date: "2026-05-25", categoryId: category.id })).toHaveLength(0);
    expect(store.listBsrRankHistory({ date: "2026-05-25", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
    expect(quality).toMatchObject({
      expectedCount: 3,
      actualCount: 3,
      uniqueAsinCount: 3,
      uniqueRankCount: 2,
      minRank: 1,
      maxRank: 3,
      qualityStatus: "partial"
    });
    expect(quality.issue).toContain("Expected 3 unique ranks, collected 2");
    expect(quality.issue).toContain("Missing ranks: #2.");
    expect(quality.issue).toContain("Duplicate ranks: #3.");
  });

  it("rejects category collection when duplicate ASINs hide missing unique products", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const collector: AmazonBestSellerCollector = {
      async collect() {
        return [
          {
            pageNo: 1,
            url: category.categoryUrl,
            products: [
              product(1, "B0UNIQUE001", "First Ice Maker", "Acme", 99, null, null),
              product(2, "B0UNIQUE002", "Second Ice Maker", "Acme", 109, null, null),
              product(3, "B0UNIQUE002", "Duplicate Ice Maker", "Acme", 119, null, null)
            ]
          }
        ];
      }
    };

    const failed = await runCategoryCollectionForMonitor(store, category.id, "2026-05-26", { collector });
    const quality = store.listBsrSnapshotQuality({ date: "2026-05-26", sourceType: "category_bestseller", sourceId: category.id })[0];

    expect(failed).toMatchObject({ status: "failed", successCount: 2, failCount: 1 });
    expect(failed.errorMessage).toContain("expected 3, collected 2");
    expect(store.listCategorySnapshots({ date: "2026-05-26", categoryId: category.id })).toHaveLength(0);
    expect(store.listBsrRankHistory({ date: "2026-05-26", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
    expect(quality).toMatchObject({
      actualCount: 2,
      uniqueAsinCount: 2,
      qualityStatus: "partial"
    });
  });

  it("normalizes Best Sellers page-local ranks across paginated category collection", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 4,
      status: "enabled"
    });
    const collector: AmazonBestSellerCollector = {
      async collect() {
        return [
          {
            pageNo: 1,
            url: category.categoryUrl,
            products: [
              product(1, "B0PAGE1001", "Page One First Ice Maker", "Acme", 99, null, null),
              product(2, "B0PAGE1002", "Page One Second Ice Maker", "Acme", 109, null, null)
            ]
          },
          {
            pageNo: 2,
            url: `${category.categoryUrl}?pg=2`,
            products: [
              product(1, "B0PAGE2001", "Page Two First Ice Maker", "Beta", 119, null, null),
              product(2, "B0PAGE2002", "Page Two Second Ice Maker", "Beta", 129, null, null)
            ]
          }
        ];
      }
    };

    await runCategoryCollectionForMonitor(store, category.id, "2026-05-22", { collector });

    const detail = store.getCategoryDetail(category.id, "2026-05-22");
    expect(detail.snapshots.map((item) => [item.asin, item.rank, item.bsrRank])).toEqual([
      ["B0PAGE1001", 1, 1],
      ["B0PAGE1002", 2, 2],
      ["B0PAGE2001", 3, 3],
      ["B0PAGE2002", 4, 4]
    ]);
  });

  it("accepts a complete Top100 when an extra Best Sellers page fills a short earlier page", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 100,
      status: "enabled"
    });
    const makePage = (pageNo: number, count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) => {
        const rank = index + 1;
        return product(rank, `B0${prefix}${String(rank).padStart(6, "0")}`, `Headless Fill Ice Maker ${pageNo}-${rank}`, "Acme", 99 + rank, null, null);
      });
    const collector: AmazonBestSellerCollector = {
      async collect() {
        return [
          { pageNo: 1, url: category.categoryUrl, products: makePage(1, 30, "P1") },
          { pageNo: 2, url: `${category.categoryUrl}?pg=2`, products: makePage(2, 50, "P2") },
          { pageNo: 3, url: `${category.categoryUrl}?pg=3`, products: makePage(3, 20, "P3") }
        ];
      }
    };

    const result = await runCategoryCollectionForMonitor(store, category.id, "2026-06-03", { collector });

    expect(result).toMatchObject({ status: "success", successCount: 100, failCount: 0 });
    const snapshots = store.getCategoryDetail(category.id, "2026-06-03").snapshots;
    expect(snapshots).toHaveLength(100);
    expect(snapshots.at(0)).toMatchObject({ rank: 1, bsrRank: 1 });
    expect(snapshots.at(-1)).toMatchObject({ rank: 100, bsrRank: 100 });
    expect(store.listBsrSnapshotQuality({ date: "2026-06-03", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      actualCount: 100,
      uniqueRankCount: 100,
      minRank: 1,
      maxRank: 100,
      qualityStatus: "ok"
    });
  });

  it("keeps partial category BSR snapshots out of rank-change comparisons", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 100,
      status: "enabled"
    });

    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-19",
      items: bsrItems(category, "2026-05-19", 100)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-22",
      items: bsrItems(category, "2026-05-22", 60)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-23",
      items: bsrItems(category, "2026-05-23", 100)
    });

    const partialQuality = store.listBsrSnapshotQuality({ date: "2026-05-22", sourceType: "category_bestseller", sourceId: category.id })[0];
    expect(partialQuality).toMatchObject({
      expectedCount: 100,
      actualCount: 60,
      qualityStatus: "partial"
    });
    expect(partialQuality.issue).toContain("Missing ranks: #61, #62");
    expect(store.listBsrRankChanges({ date: "2026-05-22", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);

    const changes = store.listBsrRankChanges({ date: "2026-05-23", sourceType: "category_bestseller", sourceId: category.id });
    expect(changes).toHaveLength(100);
    expect(new Set(changes.map((item) => item.previousDate))).toEqual(new Set(["2026-05-19"]));
    expect(changes.filter((item) => item.changeType !== "unchanged")).toHaveLength(0);
    expect(store.listBsrRankChanges({ date: "2026-05-23", sourceType: "category_bestseller", sourceId: category.id, includeUnchanged: false })).toHaveLength(0);

    const categoryWithoutBaseline = store.createCategoryMonitor({
      name: "Compact Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Compact-Ice-Makers/zgbs/appliances/123456",
      crawlTopN: 100,
      status: "enabled"
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: categoryWithoutBaseline.id,
      date: "2026-05-22",
      items: bsrItems(categoryWithoutBaseline, "2026-05-22", 60)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: categoryWithoutBaseline.id,
      date: "2026-05-23",
      items: bsrItems(categoryWithoutBaseline, "2026-05-23", 100)
    });
    expect(store.listBsrRankChanges({ date: "2026-05-23", sourceType: "category_bestseller", sourceId: categoryWithoutBaseline.id })).toHaveLength(0);
  });

  it("marks category BSR quality partial when rank coverage is gapped", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const items = bsrItems(category, "2026-05-24", 3);
    items[2] = {
      ...items[2],
      asin: "B0BSR00004",
      title: "BSR Fixture Ice Maker 4",
      rank: 4
    };

    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-24",
      items
    });

    expect(store.listBsrSnapshotQuality({ date: "2026-05-24", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      expectedCount: 3,
      actualCount: 3,
      uniqueAsinCount: 3,
      uniqueRankCount: 3,
      minRank: 1,
      maxRank: 4,
      qualityStatus: "partial",
      issue: "Expected max rank 3, saved max rank 4."
    });
    expect(store.listBsrRankChanges({ date: "2026-05-24", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
  });

  it("marks category BSR quality partial when rank coverage has duplicate ranks with a full row count", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const items = bsrItems(category, "2026-05-26", 3);
    items[1] = { ...items[1], rank: 3 };

    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-26",
      items
    });

    expect(store.listBsrSnapshotQuality({ date: "2026-05-26", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      expectedCount: 3,
      actualCount: 3,
      uniqueAsinCount: 3,
      uniqueRankCount: 2,
      minRank: 1,
      maxRank: 3,
      qualityStatus: "partial",
      issue: "Expected 3 unique ranks, saved 2. Missing ranks: #2. Duplicate ranks: #3."
    });
    expect(store.listBsrRankChanges({ date: "2026-05-26", sourceType: "category_bestseller", sourceId: category.id })).toHaveLength(0);
  });

  it("refreshes stale BSR quality rows with duplicate rank coverage on schema init", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 3,
      status: "enabled"
    });
    const items = bsrItems(category, "2026-05-27", 3);
    items[1] = { ...items[1], rank: 3 };
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-27",
      items
    });
    db.prepare(
      `UPDATE amazon_bsr_snapshot_quality
       SET quality_status = 'ok', issue = NULL
       WHERE snapshot_date = ? AND source_type = ? AND source_id = ?`
    ).run("2026-05-27", "category_bestseller", category.id);
    db.prepare("DELETE FROM amazon_schema_metadata WHERE metadata_key = ?").run("refresh_bsr_quality_unique_rank_coverage_v1");

    initSchema(db);

    expect(store.listBsrSnapshotQuality({ date: "2026-05-27", sourceType: "category_bestseller", sourceId: category.id })[0]).toMatchObject({
      uniqueRankCount: 2,
      qualityStatus: "partial",
      issue: "Expected 3 unique ranks, saved 2. Missing ranks: #2. Duplicate ranks: #3."
    });
  });

  it("uses each BSR scope's own previous date for cross-scope rank changes", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstCategory = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 2,
      status: "enabled"
    });
    const secondCategory = store.createCategoryMonitor({
      name: "Nugget Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Nugget-Ice-Makers/zgbs/appliances/987654",
      crawlTopN: 2,
      status: "enabled"
    });

    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: firstCategory.id,
      date: "2026-05-19",
      items: bsrItems(firstCategory, "2026-05-19", 2)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: firstCategory.id,
      date: "2026-05-23",
      items: bsrItems(firstCategory, "2026-05-23", 2)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: secondCategory.id,
      date: "2026-05-22",
      items: bsrItems(secondCategory, "2026-05-22", 2)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: secondCategory.id,
      date: "2026-05-23",
      items: bsrItems(secondCategory, "2026-05-23", 2)
    });

    const changes = store.listBsrRankChanges({ date: "2026-05-23" });
    expect(changes.filter((item) => item.sourceId === firstCategory.id).map((item) => item.previousDate)).toEqual(["2026-05-19", "2026-05-19"]);
    expect(changes.filter((item) => item.sourceId === secondCategory.id).map((item) => item.previousDate)).toEqual(["2026-05-22", "2026-05-22"]);
    expect(changes.filter((item) => item.changeType !== "unchanged")).toHaveLength(0);
  });

  it("does not truncate BSR rank-change input above 10000 rows", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);

    store.replaceBsrRankHistoryForDate({
      sourceType: "keyword_detail",
      sourceId: 999,
      date: "2026-05-25",
      items: keywordBsrItems("2026-05-25", 10001)
    });

    const changes = store.listBsrRankChanges({ date: "2026-05-25", sourceType: "keyword_detail", sourceId: 999 });
    expect(changes).toHaveLength(10001);
    expect(changes[0]).toMatchObject({ asin: "B0BIG00001", changeType: "new_entry", currentRank: 1 });
    expect(changes.at(-1)).toMatchObject({ asin: "B0BIG10001", changeType: "new_entry", currentRank: 10001 });
  });

  it("deduplicates brand-level action insights when ASIN is empty", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 1,
      status: "enabled"
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-24",
      items: bsrItems(category, "2026-05-24", 1)
    });
    const insight: CompetitorActionInsight = {
      insightDate: "2026-05-24",
      previousDate: null,
      sourceType: "category_bestseller",
      sourceId: category.id,
      sourceName: category.name,
      marketplace: category.marketplace,
      category: category.name,
      asin: null,
      brand: "Acme",
      title: null,
      insightType: "brand_push",
      confidence: "medium",
      currentRank: 1,
      previousRank: null,
      rankChange: null,
      price: null,
      productUrl: null,
      evidence: "Acme pushed multiple ASINs.",
      inferredAction: "Possible brand matrix push.",
      suggestedResponse: "Track the brand matrix."
    };

    store.replaceCompetitorActionInsights({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-24",
      items: [insight, { ...insight, evidence: "Updated Acme evidence." }]
    });

    const insights = store.listCompetitorActionInsights({ date: "2026-05-24", sourceType: "category_bestseller", sourceId: category.id });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ brand: "Acme", insightType: "brand_push", evidence: "Updated Acme evidence." });
  });

  it("does not write category action insights without an ok BSR quality row", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      crawlTopN: 1,
      status: "enabled"
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-24",
      items: bsrItems(category, "2026-05-24", 1)
    });
    db.exec("DELETE FROM amazon_bsr_snapshot_quality");

    store.replaceCompetitorActionInsights({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-05-24",
      items: [
        {
          insightDate: "2026-05-24",
          previousDate: null,
          sourceType: "category_bestseller",
          sourceId: category.id,
          sourceName: category.name,
          marketplace: category.marketplace,
          category: category.name,
          asin: "B0BSR00001",
          brand: "Acme",
          title: "Acme Ice Maker",
          insightType: "bsr_new_entry",
          confidence: "high",
          currentRank: 1,
          previousRank: null,
          rankChange: null,
          price: 99,
          productUrl: "https://www.amazon.com/dp/B0BSR00001",
          evidence: "Entered the BSR chart.",
          inferredAction: "Possible launch push.",
          suggestedResponse: "Track the ASIN."
        }
      ]
    });

    expect(store.listCompetitorActionInsights({ date: "2026-05-24", sourceType: "category_bestseller", sourceId: category.id })).toEqual([]);
  });
});

function product(
  rank: number,
  asin: string,
  title: string,
  brand: string,
  currentPrice: number,
  couponText: string | null,
  dealBadge: string | null
): BestSellerProductInput {
  return {
    rank,
    asin,
    title,
    brand,
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText,
    currency: "$",
    rating: 4.5,
    reviewCount: 1200,
    isPrime: true,
    dealBadge,
    bsrRank: rank,
    bsrCategory: "Ice Makers"
  };
}

function top100Products(overrides: BestSellerProductInput[]): BestSellerProductInput[] {
  const byRank = new Map(overrides.map((item) => [item.rank, item]));
  return Array.from({ length: 100 }, (_, index) => {
    const rank = index + 1;
    return byRank.get(rank) ?? product(rank, `B0FILL${String(rank).padStart(4, "0")}`, `Filler Ice Maker ${rank}`, "Filler", 199.99, null, null);
  });
}

function bsrItems(category: CategoryMonitor, date: string, count: number): BsrRankHistory[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    const asin = `B0BSR${String(rank).padStart(5, "0")}`;
    return {
      snapshotDate: date,
      sourceType: "category_bestseller",
      sourceId: category.id,
      sourceName: category.name,
      marketplace: category.marketplace,
      asin,
      title: `BSR Fixture Ice Maker ${rank}`,
      brand: rank <= 50 ? "Acme" : "Beta",
      category: category.name,
      rank,
      rankUrl: category.categoryUrl,
      productUrl: `https://www.amazon.com/dp/${asin}`,
      currentPrice: 99 + rank,
      parentRank: null,
      isSpecificRank: true
    };
  });
}

function keywordBsrItems(date: string, count: number): BsrRankHistory[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return {
      snapshotDate: date,
      sourceType: "keyword_detail",
      sourceId: 999,
      sourceName: "large keyword",
      marketplace: "amazon.com",
      asin: `B0BIG${String(rank).padStart(5, "0")}`,
      title: `Large Keyword Fixture ${rank}`,
      brand: "Large",
      category: "Leaf Blowers",
      rank,
      rankUrl: null,
      productUrl: `https://www.amazon.com/dp/B0BIG${String(rank).padStart(5, "0")}`,
      currentPrice: 99,
      parentRank: rank,
      isSpecificRank: true
    };
  });
}
