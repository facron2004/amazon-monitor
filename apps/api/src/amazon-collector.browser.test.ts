import { describe, expect, it } from "vitest";
import type { KeywordMonitor } from "@amazon-monitor/shared";
import { chromium } from "playwright";
import {
  SEARCH_CARD_SELECTOR,
  buildBestSellerPageUrl,
  buildSearchUrl,
  extractBestSellerCards,
  extractProductDetailRanks,
  extractStorePageBrand,
  extractSearchCards,
  isOptionalBestSellerPageEnd,
  isRetryableAmazonNetworkError,
  runLimitedConcurrency
} from "./amazon-collector.js";

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
      zipCode: "97201",
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

describe("amazon collector parsers", () => {
  it("extracts review counts from modern Best Sellers and search card markup", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`
        <section>
          <div id="gridItemRoot" data-asin="B0BEST0001">
            <div class="zg-bdg-text">#1</div>
            <a href="/dp/B0BEST0001"><img src="https://example.com/best-1.jpg" alt="Acme Nugget Ice Maker"></a>
            <a href="/dp/B0BEST0001"><span class="_cDEzb_p13n-sc-css-line-clamp-4_2q2cc">Acme Nugget Ice Maker</span></a>
            <i class="a-icon-star-small"><span class="a-icon-alt">4.6 out of 5 stars</span></i>
            <a href="/product-reviews/B0BEST0001"><span class="a-size-small" aria-label="12,221 ratings">12,221</span></a>
            <span class="a-price"><span class="a-offscreen">$89.99</span></span>
            <span class="s-coupon-unclipped">Save $20.02</span>
            <span class="s-coupon-unclipped">with coupon</span>
            <span class="a-badge-text">Prime
Big Deal Days</span>
          </div>
          <div id="gridItemRoot" data-asin="B0BEST0002">
            <div class="zg-bdg-text">#2</div>
            <a href="/dp/B0BEST0002"><img src="https://example.com/best-2.jpg" alt="DUMOS Bullet Ice Maker"></a>
            <a href="/dp/B0BEST0002"><span class="_cDEzb_p13n-sc-css-line-clamp-4_2q2cc">DUMOS Bullet Ice Maker</span></a>
            <i class="a-icon-star-small"><span class="a-icon-alt">4.5 out of 5 stars</span></i>
            <span>44</span>
            <span class="a-price"><span class="a-offscreen">$49.98</span></span>
          </div>
        </section>
      `);

      const bestSellerProducts = await page.evaluate(extractBestSellerCards, {
        categoryName: "Ice Makers",
        categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011"
      });
      expect(bestSellerProducts.map((product) => product.reviewCount)).toEqual([12221, null]);
      expect(bestSellerProducts[0]).toMatchObject({
        couponText: "Save $20.02 with coupon",
        dealBadge: "Prime Big Deal Days"
      });

      await page.setContent(`
        <div data-component-type="s-search-result" data-asin="B0SEARCH001">
          <h2><a href="/dp/B0SEARCH001"><span>Acme Countertop Ice Maker</span></a></h2>
          <img class="s-image" src="https://example.com/search-1.jpg">
          <i class="a-icon-star"><span class="a-icon-alt">4.4 out of 5 stars</span></i>
          <a href="/product-reviews/B0SEARCH001"><span aria-label="3,169 ratings">3,169</span></a>
          <span class="a-price"><span class="a-offscreen">$59.48</span></span>
          <span class="s-coupon-unclipped">Apply 10% coupon</span>
          <span class="a-badge-text">PrimeDay Deal</span>
        </div>
        <div data-component-type="s-search-result" data-asin="B0SEARCH002">
          <h2><a href="/dp/B0SEARCH002"><span>Badge Number Trap Ice Maker</span></a></h2>
          <img class="s-image" src="https://example.com/search-2.jpg">
          <i class="a-icon-star"><span class="a-icon-alt">4.1 out of 5 stars</span></i>
          <span>58</span>
          <span class="a-price"><span class="a-offscreen">$69.99</span></span>
        </div>
        <div data-component-type="s-search-result" data-asin="B0SEARCH003">
          <h2><a href="/dp/B0SEARCH003"><span>Plain Review Link Number Trap Ice Maker</span></a></h2>
          <img class="s-image" src="https://example.com/search-3.jpg">
          <i class="a-icon-star"><span class="a-icon-alt">4.2 out of 5 stars</span></i>
          <a href="/product-reviews/B0SEARCH003"><span>9,876</span></a>
          <span class="a-price"><span class="a-offscreen">$79.99</span></span>
        </div>
      `);

      const searchProducts = await page.evaluate(extractSearchCards);
      expect(searchProducts[0]).toMatchObject({
        asin: "B0SEARCH001",
        reviewCount: 3169,
        rating: 4.4,
        couponText: "Apply 10% coupon",
        dealBadge: "PrimeDay Deal"
      });
      expect(searchProducts[1]).toMatchObject({
        asin: "B0SEARCH002",
        reviewCount: null,
        couponText: null,
        dealBadge: null
      });
      expect(searchProducts[2]).toMatchObject({
        asin: "B0SEARCH003",
        reviewCount: null
      });

      await page.setContent(`
        <span id="productTitle">ORFLROA Nugget Ice Maker</span>
        <div id="corePriceDisplay_desktop_feature_div">
          <span class="a-price"><span class="a-offscreen">$259.98</span></span>
          <span class="basisPrice"><span class="a-offscreen">$319.99</span></span>
        </div>
        <a id="bylineInfo" href="https://www.amazon.com/stores/ORFLROA/page/abc">Visit the ORFLROA Store</a>
        <table id="productOverview_feature_div">
          <tr><td>Brand</td><td>ORFLROA</td></tr>
        </table>
        <div id="averageCustomerReviews">
          <span id="acrPopover" title="4.7 out of 5 stars"><span class="a-icon-alt">4.7 out of 5 stars</span></span>
          <span id="acrCustomerReviewText">12,345 ratings</span>
        </div>
        <div id="couponFeatureDiv">Save $30 with coupon Details</div>
        <div id="dealBadge_feature_div"><span class="a-badge-text">Prime-Day Deal</span></div>
        <ul>
          <li id="SalesRank">Best Sellers Rank #1,234 in Appliances (See Top 100 in Appliances) #12 in Ice Makers</li>
        </ul>
      `);
      const detail = await page.evaluate(extractProductDetailRanks);
      expect(detail).toMatchObject({
        title: "ORFLROA Nugget Ice Maker",
        brand: "ORFLROA",
        storeUrl: "https://www.amazon.com/stores/ORFLROA/page/abc",
        couponText: "Save $30 with coupon",
        currentPrice: 259.98,
        originalPrice: 319.99,
        currency: "$",
        rating: 4.7,
        reviewCount: 12345,
        iceType: "nugget",
        bsrRank: 12,
        bsrCategory: "Ice Makers",
        dealBadge: "Prime-Day Deal"
      });

      await page.setContent(`
        <span id="productTitle">Clear Ice Maker</span>
        <div id="averageCustomerReviews">
          <span id="acrPopover" title="4.2 out of 5 stars"></span>
          <span id="acrCustomerReviewText">41 ratings</span>
        </div>
        <div id="priceblock_dealprice"><span class="a-offscreen">$129.99</span></div>
        <ul>
          <li id="SalesRank">Best Sellers Rank #41 in Ice Makers</li>
        </ul>
      `);
      const detailWithoutPromo = await page.evaluate(extractProductDetailRanks);
      expect(detailWithoutPromo).toMatchObject({
        couponText: null,
        dealBadge: null,
        rating: 4.2,
        reviewCount: 41,
        iceType: "clear"
      });

      await page.setContent(`
        <div id="centerCol">
          <div id="averageCustomerReviews">
            <span id="acrCustomerReviewText">25 ratings</span>
          </div>
          <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$199.99</span></div>
          <ul>
            <li id="SalesRank">Best Sellers Rank #10 in Ice Makers</li>
          </ul>
        </div>
        <div id="sp_detail2_B0RELATED_couponBadge">Save $70.00 with coupon</div>
        <div id="sp_detail_thematic-top_brands_B0RELATED_dealsXbadge-badge">Limited time deal</div>
      `);
      const detailWithRelatedPromos = await page.evaluate(extractProductDetailRanks);
      expect(detailWithRelatedPromos).toMatchObject({
        couponText: null,
        dealBadge: null,
        reviewCount: 25
      });

      await page.setContent(`
        <span id="productTitle">Portable Ice Maker Countertop, 26Lbs Per Day, 9 Cubes Ready in 6 Mins</span>
        <div id="feature-bullets">
          <ul>
            <li>Portable countertop design for home and office.</li>
            <li>Produces 9 ice cubes in 6 mins.</li>
          </ul>
        </div>
        <div id="averageCustomerReviews">
          <span id="acrPopover" title="4.5 out of 5 stars"></span>
          <span id="acrCustomerReviewText">514 ratings</span>
        </div>
        <ul>
          <li id="SalesRank">Best Sellers Rank #47 in Ice Makers</li>
        </ul>
      `);
      const detailWithBulletHeuristic = await page.evaluate(extractProductDetailRanks);
      expect(detailWithBulletHeuristic).toMatchObject({
        iceType: "bullet",
        rating: 4.5,
        reviewCount: 514
      });

      await page.setContent(`
        <span id="productTitle">Silonn Nugget Ice Maker Countertop</span>
        <div data-state="{&quot;averageCustomerReviews&quot;:{&quot;reviewCount&quot;:4660,&quot;displayString&quot;:&quot;4.4 out of 5 stars&quot;,&quot;value&quot;:4.4}}"></div>
        <ul>
          <li id="SalesRank">Best Sellers Rank #78 in Ice Makers</li>
        </ul>
      `);
      const detailWithEmbeddedReviews = await page.evaluate(extractProductDetailRanks);
      expect(detailWithEmbeddedReviews).toMatchObject({
        rating: 4.4,
        reviewCount: 4660,
        iceType: "nugget"
      });

      await page.setContent(`
        <html>
          <head>
            <title>Antarctic Star Storefront - Amazon.com</title>
            <meta property="og:site_name" content="Antarctic Star" />
          </head>
          <body>
            <header>
              <h1>Nugget Ice Makers Storefront</h1>
            </header>
          </body>
        </html>
      `);
      const storeBrand = await page.evaluate(extractStorePageBrand);
      expect(storeBrand).toBe("Antarctic Star");
    } finally {
      await browser.close();
    }
  }, 30000);
});

describe("amazon collector retry rules", () => {
  it("retries transient network disconnects from Playwright navigation", () => {
    expect(
      isRetryableAmazonNetworkError(
        "page.goto: net::ERR_CONNECTION_CLOSED at https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011"
      )
    ).toBe(true);
    expect(isRetryableAmazonNetworkError("Client network socket disconnected before secure TLS connection was established")).toBe(true);
    expect(isRetryableAmazonNetworkError("Amazon Best Sellers strict count failed for Ice makers")).toBe(false);
  });

  it("stops only optional Best Sellers pages when Amazon returns a missing page", () => {
    const missingPage = new Error('Amazon returned a missing page for category "Ice makers" page 3. Screenshot: no-bestseller-cards.png');

    expect(isOptionalBestSellerPageEnd(missingPage, 3, 2, 60)).toBe(true);
    expect(isOptionalBestSellerPageEnd(missingPage, 2, 2, 60)).toBe(false);
    expect(isOptionalBestSellerPageEnd(missingPage, 3, 2, 0)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error("Amazon blocked category collection"), 3, 2, 60)).toBe(false);
  });
});
