import { describe, expect, it } from "vitest";
import { deriveAsinDualScore } from "./asin-dual-score.js";

describe("deriveAsinDualScore", () => {
  it("normalizes opportunity and risk sub-scores to 0-100", () => {
    const result = deriveAsinDualScore({
      rankingScore: 35,
      productScore: 25,
      promoScore: 20,
      brandScore: 15,
      riskScore: 15,
      reasons: []
    });

    expect(result.opportunityScore).toBe(100);
    expect(result.riskScore).toBe(100);
    expect(result.opportunityReasons).toEqual(["ranking +35", "product +25", "promo +20"]);
    expect(result.riskReasons).toEqual(["brand +15", "risk +15"]);
  });

  it("handles empty breakdown safely", () => {
    const result = deriveAsinDualScore(null);
    expect(result.opportunityScore).toBe(0);
    expect(result.riskScore).toBe(0);
    expect(result.opportunityReasons).toEqual([]);
    expect(result.riskReasons).toEqual([]);
  });
});