import { describe, expect, it } from "vitest";
import { inferStrategyTags, strategyTagLabels } from "./strategy-tags.js";

describe("inferStrategyTags", () => {
  it("derives only strategy tags supported by collected evidence", () => {
    expect(inferStrategyTags({
      eventType: "PRICE_DROP",
      attributionTags: ["PRICE_DRIVEN", "COUPON_DRIVEN"],
      currentRank: 18,
      previousRank: 48,
      rankChange: 30,
      brandRisingCount: 1,
      brandNewEntryCount: 0,
      isCoreCompetitor: true
    })).toEqual(["LOW_PRICE_RANKING", "COUPON_DEPENDENT", "HIGH_THREAT_CORE"]);
  });

  it("requires brand matrix evidence before labeling a new-product matrix", () => {
    const base = {
      eventType: "NEW_PRODUCT_BREAKOUT" as const,
      attributionTags: ["NEW_PRODUCT_PUSH" as const],
      currentRank: 42,
      previousRank: null,
      rankChange: null,
      brandRisingCount: 1,
      brandNewEntryCount: 1,
      isCoreCompetitor: false
    };

    expect(inferStrategyTags(base)).not.toContain("NEW_PRODUCT_MATRIX");
    expect(inferStrategyTags({ ...base, brandNewEntryCount: 2 })).toContain("NEW_PRODUCT_MATRIX");
  });

  it("tags evidence-backed reversions after review", () => {
    expect(inferStrategyTags({
      eventType: "RANK_SURGE",
      attributionTags: ["NO_CLEAR_DRIVER"],
      currentRank: 35,
      previousRank: 80,
      rankChange: 45,
      brandRisingCount: null,
      brandNewEntryCount: null,
      isCoreCompetitor: false,
      reviewResult: "REVERTED"
    })).toEqual(["SHORT_SURGE_REVERSION"]);
  });

  it("keeps strategy tag labels readable for Action Center visualization", () => {
    expect(strategyTagLabels).toEqual({
      LOW_PRICE_RANKING: "低价冲榜型",
      COUPON_DEPENDENT: "Coupon 依赖型",
      DEAL_LIFT: "Deal 拉升型",
      REVIEW_ACCELERATION: "Review 快增型",
      NEW_PRODUCT_MATRIX: "新品矩阵型",
      STABLE_HEAD: "稳定头部型",
      SHORT_SURGE_REVERSION: "短期冲榜回落型",
      HIGH_THREAT_CORE: "高威胁核心竞品"
    });
  });
});
