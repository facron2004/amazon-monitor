import { describe, expect, it } from "vitest";
import { scoreInsightEvent } from "./scoring-engine.js";

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
      brandTop100ShareChange: 0.06,
      isCoreCompetitor: true,
      coreCompetitorRising3Days: true
    });

    expect(score.total).toBe(100);
    expect(score.level).toBe("S");
    expect(score.breakdown.riskScore).toBe(15);
  });
});
