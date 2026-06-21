import { describe, expect, it } from "vitest";
import { inferAttribution } from "./attribution-engine.js";

describe("inferAttribution", () => {
  it("marks price, coupon, deal, and review drivers only from evidence fields", () => {
    const result = inferAttribution({
      currentRank: 20,
      previousRank: 80,
      priceChangeRate: -0.12,
      couponBefore: null,
      couponAfter: "Save $20",
      dealBefore: null,
      dealAfter: "Limited Time Deal",
      reviewCount: 88,
      reviewCountChange: 30,
      medianReviewChange: 10,
      daysListed: 8,
      brandRisingCount: 3,
      brandNewTop100Count: 0
    });

    expect(result.tags).toEqual(expect.arrayContaining(["PRICE_DRIVEN", "COUPON_DRIVEN", "DEAL_DRIVEN", "REVIEW_DRIVEN", "NEW_PRODUCT_PUSH", "BRAND_MATRIX_PUSH"]));
    expect(result.evidenceItems.join(" ")).toContain("BSR #80 -> #20");
  });

  it("uses NO_CLEAR_DRIVER when evidence is insufficient", () => {
    expect(
      inferAttribution({
        currentRank: 70,
        previousRank: 75,
        priceChangeRate: null,
        couponBefore: null,
        couponAfter: null,
        dealBefore: null,
        dealAfter: null,
        reviewCount: 500,
        reviewCountChange: null,
        medianReviewChange: null,
        daysListed: null,
        brandRisingCount: 0,
        brandNewTop100Count: 0
      }).tags
    ).toEqual(["ORGANIC_STRENGTH"]);
  });

  // PRICE_DRIVEN 边界
  it("emits PRICE_DRIVEN only when rank improves by >=30 and price drops by <=-8%", () => {
    const off = inferAttribution({
      currentRank: 50,
      previousRank: 60, // rankChange=10 < 30,门槛不满足
      priceChangeRate: -0.12,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(off.tags).not.toContain("PRICE_DRIVEN");

    const exact = inferAttribution({
      currentRank: 30,
      previousRank: 60, // rankChange=30,刚好命中
      priceChangeRate: -0.08, // 刚好 -8%
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(exact.tags).toContain("PRICE_DRIVEN");
  });

  // REVIEW_DRIVEN: 阈值是 2 * median,无 median 时 fallback 10
  it("emits REVIEW_DRIVEN using medianReviewChange*2 with fallback threshold of 10", () => {
    const noMedian = inferAttribution({
      currentRank: 50, previousRank: 100, // rankChange=50
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: 10, // 等于 fallback 阈值
      medianReviewChange: null,
      daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(noMedian.tags).toContain("REVIEW_DRIVEN");

    const boundary = inferAttribution({
      currentRank: 50, previousRank: 100,
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: 19, // median=10,2*median=20,差 1
      medianReviewChange: 10,
      daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(boundary.tags).not.toContain("REVIEW_DRIVEN");
  });

  // DEAL_DRIVEN 必须 deal 是新增 + 排名上升,RANK_DROP 不应误触
  it("does not tag DEAL_DRIVEN on a rank drop with a long-standing deal badge", () => {
    const result = inferAttribution({
      currentRank: 80, // rankChange=-30(下跌)
      previousRank: 50,
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: "Limited Time Deal", // deal 已存在("假新增"模拟)
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(result.tags).not.toContain("DEAL_DRIVEN");
  });

  // BRAND_MATRIX_PUSH 阈值 + null coalescing
  it("emits BRAND_MATRIX_PUSH when brandRisingCount>=3 or brandNewTop100Count>=2", () => {
    const rising3 = inferAttribution({
      currentRank: 80, previousRank: 80,
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 3, brandNewTop100Count: 0
    });
    expect(rising3.tags).toContain("BRAND_MATRIX_PUSH");

    const below = inferAttribution({
      currentRank: 80, previousRank: 80,
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 2, brandNewTop100Count: 1
    });
    expect(below.tags).not.toContain("BRAND_MATRIX_PUSH");
  });

  // PROMO_END_DROP 两种触发路径
  it("emits PROMO_END_DROP when coupon or deal is removed and rank drops by >=20", () => {
    const couponRemoved = inferAttribution({
      currentRank: 80, previousRank: 30, // rankChange=-50
      priceChangeRate: null,
      couponBefore: "Save $20", couponAfter: null,
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(couponRemoved.tags).toContain("PROMO_END_DROP");

    const dealRemoved = inferAttribution({
      currentRank: 80, previousRank: 30,
      priceChangeRate: null,
      couponBefore: null, couponAfter: null,
      dealBefore: "Limited Time Deal", dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(dealRemoved.tags).toContain("PROMO_END_DROP");
  });

  // evidenceItems formatting 在 price/review/coupon 边缘场景的格式
  it("formats evidence items with placeholder dashes for missing inputs", () => {
    const result = inferAttribution({
      currentRank: 50, previousRank: null, // rankDelta=null
      priceChangeRate: null,
      couponBefore: null, couponAfter: "Save $20",
      dealBefore: null, dealAfter: null,
      reviewCount: 200, reviewCountChange: null,
      medianReviewChange: null, daysListed: null,
      brandRisingCount: 0, brandNewTop100Count: 0
    });
    expect(result.evidenceItems.join(" ")).toContain("Coupon - -> Save $20");
    // rankChange=null 时不应出现 BSR 行
    expect(result.evidenceItems.join(" ")).not.toContain("BSR");
  });
});
