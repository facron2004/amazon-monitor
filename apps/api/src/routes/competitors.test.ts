import { DatabaseSync } from "node:sqlite";
import {
  isoDate,
  isoDateOffset,
  type InsightEventInput,
} from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("competitor routes", () => {
  it("creates and idempotently updates a manual competitor", async () => {
    const { api } = await setupAuthenticatedApi("product_researcher");

    const created = await api
      .post("/api/competitors")
      .send({
        asin: "b0manual01",
        marketplace: "US",
        title: "Manual competitor",
        brand: "Acme",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      asin: "B0MANUAL01",
      marketplace: "www.amazon.com",
      sourceType: "manual",
      title: "Manual competitor",
      bestRank: null,
      latestRank: null,
    });
    expect(created.body.latestProductUrl).toBe(
      "https://www.amazon.com/dp/B0MANUAL01",
    );
    expect(
      (await api.get(`/api/competitors/${created.body.id}`).expect(200)).body
        .asin,
    ).toBe("B0MANUAL01");
    expect(
      (
        await api
          .get(`/api/competitors/${created.body.id}/timeline`)
          .expect(200)
      ).body.days,
    ).toEqual([]);
    await api
      .get(
        `/api/competitors/${created.body.id}/snapshots?startDate=2026-07-20&endDate=2026-07-18`,
      )
      .expect(400);

    await api
      .post("/api/competitors")
      .send({
        asin: "B0MANUAL01",
        marketplace: "amazon.com",
        title: "Updated competitor",
      })
      .expect(201);

    const listed = await api
      .get("/api/competitors?sourceType=manual")
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      asin: "B0MANUAL01",
      title: "Updated competitor",
    });
  });

  it("returns an organization-scoped daily KPI comparison only from captured evidence", async () => {
    const { api, db, store, orgId } =
      await setupAuthenticatedApi("product_researcher");
    const yesterday = isoDateOffset(isoDate(), -1);

    store.createManualCompetitor(
      {
        asin: "B0KPI00001",
        marketplace: "amazon.com",
        title: "Established core competitor",
      },
      orgId,
    );
    db.prepare(
      `UPDATE amazon_competitor_pool
       SET first_seen_date = ?, competitor_tier = 'core', coupon_text = 'Save $10 with coupon'
       WHERE org_id = ? AND asin = 'B0KPI00001'`,
    ).run(yesterday, orgId);
    store.captureCompetitorDailyKpiSnapshot(orgId, yesterday);

    const secondOrg = store.createOrganization({
      name: "Unrelated competitor organization",
    });
    store.createManualCompetitor(
      {
        asin: "B0OTHER001",
        marketplace: "amazon.com",
        title: "Other organization competitor",
      },
      secondOrg.id,
    );

    store.createManualCompetitor(
      {
        asin: "B0KPI00002",
        marketplace: "amazon.com",
        title: "New high-priority competitor",
      },
      orgId,
    );
    store.setKeyCompetitor("B0KPI00002", true, orgId);

    const response = await api.get("/api/competitors/kpis").expect(200);
    expect(response.body).toEqual({
      current: {
        date: isoDate(),
        total: 2,
        core: 2,
        new: 2,
        priceActive: 1,
        key: 1,
      },
      previous: {
        date: yesterday,
        total: 1,
        core: 1,
        new: 1,
        priceActive: 1,
        key: 0,
      },
      delta: { total: 1, core: 1, new: 1, priceActive: 0, key: 1 },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("validates input and rejects roles without competitor management", async () => {
    const researcher = await setupAuthenticatedApi("product_researcher");
    await researcher.api
      .post("/api/competitors")
      .send({ asin: "bad", marketplace: "US", title: "Invalid" })
      .expect(400);

    const viewer = await setupAuthenticatedApi("viewer");
    await viewer.api
      .post("/api/competitors")
      .send({
        asin: "B0MANUAL02",
        marketplace: "US",
        title: "Read only",
      })
      .expect(403);
    await viewer.api
      .post("/api/competitors/from-category")
      .send({ asin: "B0MANUAL02", categoryId: 1 })
      .expect(403);
  });

  it("imports valid CSV rows and reports invalid rows without hiding them", async () => {
    const { api } = await setupAuthenticatedApi("product_researcher");
    const csv = [
      "\ufeffasin,marketplace,title,brand",
      'B0CSV00001,US,"Countertop ice maker, compact",Acme',
      "INVALID,DE,Invalid competitor,Example",
      "B0CSV00001,US,Duplicate competitor,Acme",
    ].join("\n");

    const imported = await api
      .post("/api/competitors/import")
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(200);

    expect(imported.body).toMatchObject({
      totalRows: 3,
      importedCount: 1,
      failedCount: 2,
    });
    expect(imported.body.errors).toEqual([
      expect.objectContaining({ row: 3, asin: "INVALID" }),
      expect.objectContaining({
        row: 4,
        asin: "B0CSV00001",
        message: expect.stringContaining("Duplicate"),
      }),
    ]);

    const listed = await api
      .get("/api/competitors?sourceType=manual")
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      asin: "B0CSV00001",
      marketplace: "www.amazon.com",
      title: "Countertop ice maker, compact",
    });
  });

  it("rejects CSV files with missing required headers", async () => {
    const { api } = await setupAuthenticatedApi("product_researcher");
    await api
      .post("/api/competitors/import/csv")
      .set("Content-Type", "text/csv")
      .send("asin,marketplace\nB0CSV00002,US")
      .expect(400, { message: "Missing required headers: title" });
  });

  it("reports category pool status and idempotently adds a category product", async () => {
    const { api, db, store, orgId } =
      await setupAuthenticatedApi("product_researcher");
    const category = store.createCategoryMonitor({
      orgId,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl:
        "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      categoryPath: "Appliances > Ice Makers",
      crawlTopN: 100,
      status: "enabled",
    });
    const currentSnapshot = {
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-07-13",
      rank: 12,
      asin: "B0CAT00001",
      title: "Fast rising ice maker",
      brand: "Acme",
      imageUrl: "https://example.com/product.jpg",
      productUrl: "https://www.amazon.com/dp/B0CAT00001",
      currentPrice: 99.99,
      originalPrice: null,
      couponText: null,
      couponValue: null,
      couponRate: null,
      finalEstimatedPrice: 99.99,
      currency: "$",
      rating: 4.6,
      reviewCount: 88,
      iceType: "bullet",
      isPrime: true,
      dealBadge: null,
      bsrRank: 12,
      bsrCategory: "Ice Makers",
    };
    store.insertCategorySnapshots([
      { ...currentSnapshot, snapshotDate: "2026-06-30", rank: 50, bsrRank: 50 },
      { ...currentSnapshot, snapshotDate: "2026-07-12", rank: 30, bsrRank: 30 },
      currentSnapshot,
    ]);

    const before = await api
      .get(`/api/categories/${category.id}/detail?date=2026-07-13`)
      .expect(200);
    expect(before.body.snapshots[0]).toMatchObject({
      asin: "B0CAT00001",
      competitorPoolStatus: "missing",
      previousRank: 30,
      sevenDayReferenceRank: 50,
      sevenDayRankChange: 38,
      firstListedDate: "2026-06-30",
      daysListed: 3,
      isNewListing: true,
    });

    const added = await api
      .post("/api/competitors/from-category")
      .send({
        asin: "b0cat00001",
        categoryId: category.id,
      })
      .expect(201);
    expect(added.body).toMatchObject({
      asin: "B0CAT00001",
      sourceType: "category",
      status: "active",
    });

    db.prepare(
      "UPDATE amazon_competitor_pool SET status = 0 WHERE asin = ?",
    ).run("B0CAT00001");
    const ignored = await api
      .get(`/api/categories/${category.id}/detail?date=2026-07-13`)
      .expect(200);
    expect(ignored.body.snapshots[0].competitorPoolStatus).toBe("ignored");

    await api
      .post("/api/competitors/from-category")
      .send({ asin: "B0CAT00001", categoryId: category.id })
      .expect(201);
    const restored = await api
      .get(`/api/categories/${category.id}/detail?date=2026-07-13`)
      .expect(200);
    expect(restored.body.snapshots[0].competitorPoolStatus).toBe("active");
  });

  it("includes Listing change evidence in the competitor activity calendar", async () => {
    const { api, store, orgId } =
      await setupAuthenticatedApi("product_researcher");
    const category = store.createCategoryMonitor({
      orgId,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl:
        "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
      categoryPath: "Appliances > Ice Makers",
      crawlTopN: 100,
      status: "enabled",
    });
    store.insertCategorySnapshots([
      {
        categoryId: category.id,
        categoryName: category.name,
        marketplace: category.marketplace,
        snapshotDate: "2026-07-13",
        rank: 18,
        asin: "B0TREND001",
        title: "Updated competitor title",
        brand: "Acme",
        imageUrl: "https://example.com/product-new.jpg",
        productUrl: "https://www.amazon.com/dp/B0TREND001",
        currentPrice: 99.99,
        originalPrice: 119.99,
        couponText: null,
        couponValue: null,
        couponRate: null,
        finalEstimatedPrice: 99.99,
        currency: "$",
        rating: 4.6,
        reviewCount: 120,
        iceType: "bullet",
        isPrime: true,
        dealBadge: null,
        bsrRank: 18,
        bsrCategory: "Ice Makers",
      },
    ]);
    store.upsertInsightEvent(listingChangeEvent(category.id, orgId));

    const response = await api
      .get(
        "/api/products/B0TREND001/activity-calendar?date=2026-07-13&limitDays=30",
      )
      .expect(200);

    expect(response.body.insightEvents).toEqual([
      expect.objectContaining({
        asin: "B0TREND001",
        eventDate: "2026-07-13",
        eventType: "LISTING_CHANGED",
      }),
    ]);
    expect(response.body.summary).toMatchObject({
      latestReviewCount: 120,
      eventCount: 1,
    });
    expect(response.body.days[0].categoryRanks[0].reviewCount).toBe(120);
  });
});

function listingChangeEvent(
  categoryId: number,
  orgId: number,
): InsightEventInput {
  return {
    orgId,
    id: "2026-07-13|category:1|asin:B0TREND001|LISTING_CHANGED",
    eventDate: "2026-07-13",
    asin: "B0TREND001",
    brand: "Acme",
    categoryId,
    keywordId: null,
    eventType: "LISTING_CHANGED",
    eventLevel: "P1",
    eventTitle: "竞品 Listing 标题与主图发生变化",
    eventSummary: "标题与主图均发生变化，建议观察后续点击与排名表现。",
    attributionTags: ["NO_CLEAR_DRIVER"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 18,
      previousRank: 22,
      listingChangedFields: ["title", "main_image"],
      titleBefore: "Old competitor title",
      titleAfter: "Updated competitor title",
      imageUrlBefore: "https://example.com/product-old.jpg",
      imageUrlAfter: "https://example.com/product-new.jpg",
      productUrl: "https://www.amazon.com/dp/B0TREND001",
      evidenceItems: ["标题与主图变化"],
    },
    scoreTotal: 68,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 20,
      productScore: 20,
      promoScore: 0,
      brandScore: 8,
      riskScore: 20,
      reasons: ["Listing 变化"],
    },
    suggestedAction: "观察 3 天排名变化",
    status: "WATCHING",
    reviewDueDate: "2026-07-16",
    reviewResult: null,
    userNote: null,
  };
}

async function setupAuthenticatedApi(role: "product_researcher" | "viewer") {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  const store = createStore(db);
  const organization = store.createOrganization({ name: `Competitor ${role}` });
  store.createUser({
    orgId: organization.id,
    username: `competitor-${role}`,
    password: "password-1234",
    role,
  });
  const api = request.agent(createApiApp(store));
  await api
    .post("/api/auth/login")
    .send({ username: `competitor-${role}`, password: "password-1234" })
    .expect(200);
  return { api, db, store, orgId: organization.id };
}
