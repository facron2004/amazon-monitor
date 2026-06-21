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
});
