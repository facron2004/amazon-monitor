import { describe, expect, it } from "vitest";
import type { KeywordMonitor } from "@amazon-monitor/shared";
import { SEARCH_CARD_SELECTOR, buildBestSellerPageUrl, buildSearchUrl, runLimitedConcurrency } from "./amazon-collector.js";

describe("amazon collector concurrency", () => {
  it("runs detail work with a bounded concurrency limit and preserves order", async () => {
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];

    const results = await runLimitedConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      starts.push(value);
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBe(2);
    expect(starts.slice(0, 2)).toEqual([1, 2]);
  });
});

describe("amazon search url", () => {
  it("waits for every card shape that the parser can extract", () => {
    expect(SEARCH_CARD_SELECTOR).toContain('[data-component-type="s-search-result"][data-asin]');
    expect(SEARCH_CARD_SELECTOR).toContain('[data-testid="product-card"]');
    expect(SEARCH_CARD_SELECTOR).toContain(".s-result-item[data-asin]");
    expect(SEARCH_CARD_SELECTOR).toContain('[data-asin]:not([data-asin=""])');
  });

  it("does not include a language query parameter by default because Amazon can return Sorry pages for some keywords", () => {
    const keyword: KeywordMonitor = {
      id: 1,
      keyword: "ice maker",
      marketplace: "amazon.com",
      zipCode: "90001",
      language: "en_US",
      categoryTag: null,
      crawlPages: 1,
      status: "enabled",
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
      lastCollectedAt: null,
      todayStatus: "pending"
    };

    const url = buildSearchUrl(keyword, 1);

    expect(url).toBe("https://www.amazon.com/s?k=ice+maker&page=1");
  });
});

describe("amazon best seller url", () => {
  it("keeps page 1 clean and adds pg for subsequent Best Sellers pages", () => {
    const base = "https://www.amazon.com/Best-Sellers-Home-Kitchen-Ice-Makers/zgbs/home-garden/2399939011?ref_=zg_bs_nav";

    expect(buildBestSellerPageUrl(base, 1)).toBe(
      "https://www.amazon.com/Best-Sellers-Home-Kitchen-Ice-Makers/zgbs/home-garden/2399939011?ref_=zg_bs_nav"
    );
    expect(buildBestSellerPageUrl(base, 2)).toBe(
      "https://www.amazon.com/Best-Sellers-Home-Kitchen-Ice-Makers/zgbs/home-garden/2399939011?ref_=zg_bs_nav&pg=2"
    );
  });
});
