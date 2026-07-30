import { beforeEach, describe, expect, it } from "vitest";
import { openAppStore } from "../store.js";
import { StoreAgentToolBackend } from "./agent-tool-backend.js";

describe("StoreAgentToolBackend", () => {
  let store: ReturnType<typeof openAppStore>;
  let backend: StoreAgentToolBackend;

  beforeEach(() => {
    store = openAppStore(":memory:");
    store.reset();
    backend = new StoreAgentToolBackend(store);
  });

  it("injects organization scope and returns bounded evidence envelopes", async () => {
    const first = store.createOrganization({ name: "First organization" });
    const second = store.createOrganization({ name: "Second organization" });
    const category = store.createCategoryMonitor({
      orgId: first.id,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers/zgbs",
      crawlTopN: 100,
    });
    const snapshotDate = new Date().toISOString().slice(0, 10);
    store.insertCategorySnapshots([{
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate,
      rank: 1,
      asin: "B000TEST01",
      title: "Test product",
      brand: "Test",
      imageUrl: null,
      productUrl: null,
      currentPrice: 99,
      originalPrice: null,
      couponText: null,
      couponValue: null,
      couponRate: null,
      finalEstimatedPrice: 99,
      currency: "$",
      rating: 4.5,
      reviewCount: 100,
      iceType: null,
      isPrime: true,
      dealBadge: null,
      bsrRank: 1,
      bsrCategory: "Ice Makers",
    }]);

    const firstResult = await backend.execute(
      "get_category_snapshot",
      { categoryId: category.id },
      { orgId: first.id, userId: 1, runId: 1 },
    );
    const secondResult = await backend.execute(
      "get_category_snapshot",
      { categoryId: category.id },
      { orgId: second.id, userId: 2, runId: 2 },
    );

    expect(firstResult.data).toEqual([
      expect.objectContaining({ asin: "B000TEST01" }),
    ]);
    expect(firstResult.evidenceRefs).toHaveLength(1);
    expect(firstResult.freshness.status).toBe("fresh");
    expect(secondResult.data).toEqual([]);
    expect(secondResult.freshness.status).toBe("missing");
  });

  it("rejects model-supplied tenant context before querying the Store", async () => {
    await expect(backend.execute(
      "get_category_snapshot",
      { categoryId: 1, orgId: 999 },
      { orgId: 1, userId: 1, runId: 1 },
    )).rejects.toThrow();
  });
});
