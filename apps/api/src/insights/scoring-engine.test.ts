import { describe, expect, it } from "vitest";
import { scoreInsightEvent, scoreLevel } from "./scoring-engine.js";

describe("scoreInsightEvent", () => {
  it("scores rank lift, low review, promotion, brand movement, and core risk with a capped total", () => {
    const score = scoreInsightEvent({
      eventType: "CORE_COMPETITOR_RISK",
      currentRank: 12,
      previousRank: 92,
      rankChange: 80,
      reviewCount: 42,
      daysListed: 5,
      couponAdded: true,
      dealAdded: true,
      priceChangeRate: -0.16,
      priceLowWindow: "T90",
      brandRisingCount: 5,
      brandNewTop100Count: 2,
      brandDroppedCount: 0,
      brandRankDownCount: 0,
      brandTop100ShareChange: 0.06,
      isCoreCompetitor: true,
      coreCompetitorRising3Days: true
    });

    expect(score.total).toBe(100);
    expect(score.level).toBe("S");
    expect(score.breakdown.riskScore).toBe(15);
  });

  // scoreLevel 边界:覆盖每个阈值(包含/不包含)
  it("maps score to level using inclusive thresholds: 85=S, 70=A, 55=B, 40=C, <40=D", () => {
    expect(scoreLevel(100)).toBe("S");
    expect(scoreLevel(85)).toBe("S");
    expect(scoreLevel(84)).toBe("A");
    expect(scoreLevel(70)).toBe("A");
    expect(scoreLevel(69)).toBe("B");
    expect(scoreLevel(55)).toBe("B");
    expect(scoreLevel(54)).toBe("C");
    expect(scoreLevel(40)).toBe("C");
    expect(scoreLevel(39)).toBe("D");
    expect(scoreLevel(0)).toBe("D");
  });

  // scoreBrand 阈值 + null coalescing + 上限
  it("scoreBrand: null inputs default to 0, thresholds use inclusive >=, and total is capped at 15", () => {
    const baseInput = {
      eventType: "BRAND_MATRIX_SURGE" as const,
      currentRank: 30, previousRank: null, rankChange: null,
      reviewCount: 200, daysListed: null,
      couponAdded: false, dealAdded: false,
      priceChangeRate: null, priceLowWindow: null,
      brandDroppedCount: 0, brandRankDownCount: 0,
      isCoreCompetitor: false, coreCompetitorRising3Days: false
    };
    // null 输入全默认 0 → brandScore=0
    const none = scoreInsightEvent({ ...baseInput, brandRisingCount: null, brandNewTop100Count: null, brandTop100ShareChange: null });
    expect(none.breakdown.brandScore).toBe(0);

    // rising=2 不够 (>=3 起步),newTop100=1 不够 (>=2 起步),share=0.04 不够 (>=0.05 起步)
    const below = scoreInsightEvent({ ...baseInput, brandRisingCount: 2, brandNewTop100Count: 1, brandTop100ShareChange: 0.04 });
    expect(below.breakdown.brandScore).toBe(0);

    // rising=3 → +10,newTop100=2 → +12,share=0.05 → +8,合计 30 → 上限 15
    const capped = scoreInsightEvent({ ...baseInput, brandRisingCount: 3, brandNewTop100Count: 2, brandTop100ShareChange: 0.05 });
    expect(capped.breakdown.brandScore).toBe(15);

    // 单阈值触发:只有 share=0.06 触发 → 8
    const onlyShare = scoreInsightEvent({ ...baseInput, brandRisingCount: 0, brandNewTop100Count: 0, brandTop100ShareChange: 0.06 });
    expect(onlyShare.breakdown.brandScore).toBe(8);

    const drop = scoreInsightEvent({
      ...baseInput,
      eventType: "BRAND_MATRIX_DROP",
      brandRisingCount: 0,
      brandNewTop100Count: 0,
      brandDroppedCount: 2,
      brandRankDownCount: 3,
      brandTop100ShareChange: -0.05
    });
    expect(drop.breakdown.brandScore).toBe(15);
  });

  // scoreRisk: 非核心竞品 = 0,核心但 rank>50 = 0,T30 触发
  it("scoreRisk: non-core competitor contributes 0; core competitor risks depend on rank + priceLowWindow", () => {
    const base = {
      eventType: "CORE_COMPETITOR_RISK" as const,
      currentRank: 10, previousRank: null, rankChange: null,
      reviewCount: 200, daysListed: null,
      couponAdded: false, dealAdded: false,
      priceChangeRate: null, priceLowWindow: null,
      brandRisingCount: null, brandNewTop100Count: null, brandDroppedCount: null, brandRankDownCount: null, brandTop100ShareChange: null,
      coreCompetitorRising3Days: false
    };
    const nonCore = scoreInsightEvent({ ...base, isCoreCompetitor: false });
    expect(nonCore.breakdown.riskScore).toBe(0);

    // 核心但 rank=51 → 0
    const coreOutsideTop50 = scoreInsightEvent({ ...base, isCoreCompetitor: true, currentRank: 51 });
    expect(coreOutsideTop50.breakdown.riskScore).toBe(0);

    // 核心 + Top20 + T30 + 持续 3 天上涨 → 15+10+8=33 → 上限 15
    const full = scoreInsightEvent({
      ...base,
      isCoreCompetitor: true,
      currentRank: 15,
      priceLowWindow: "T30",
      coreCompetitorRising3Days: true
    });
    expect(full.breakdown.riskScore).toBe(15);
  });

  // scoreRanking: 多条件只取 max,cap 35
  it("scoreRanking takes max across rank bucket and rankChange bucket, capped at 35", () => {
    const base = {
      eventType: "RANK_SURGE" as const,
      currentRank: 80, previousRank: null, rankChange: 80,
      reviewCount: 200, daysListed: null,
      couponAdded: false, dealAdded: false,
      priceChangeRate: null, priceLowWindow: null,
      brandRisingCount: null, brandNewTop100Count: null, brandDroppedCount: null, brandRankDownCount: null, brandTop100ShareChange: null,
      isCoreCompetitor: false, coreCompetitorRising3Days: false
    };
    // currentRank=80 (>50, <=100 → 20),rankChange=80 (>=80 → 30) → max(20,30)=30
    const result = scoreInsightEvent({ ...base });
    expect(result.breakdown.rankingScore).toBe(30);
  });
});
