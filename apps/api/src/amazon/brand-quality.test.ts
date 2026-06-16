import { describe, expect, it } from "vitest";
import { hasWeakBrandValue } from "./brand-quality.js";

describe("hasWeakBrandValue", () => {
  it("treats empty or generic descriptor brands as weak", () => {
    expect(hasWeakBrandValue(null, "Countertop Ice Maker")).toBe(true);
    expect(hasWeakBrandValue("Countertop", "Countertop Ice Maker")).toBe(true);
    expect(hasWeakBrandValue("Nugget Ice Maker", "Nugget Ice Maker Machine")).toBe(true);
  });

  it("keeps real brands even when the title contains generic ice-maker words", () => {
    expect(hasWeakBrandValue("EUHOMY", "EUHOMY Countertop Ice Maker")).toBe(false);
    expect(hasWeakBrandValue("Antarctic Star", "Nugget Countertop Ice Maker")).toBe(false);
    expect(hasWeakBrandValue("Silonn", "Silonn Nugget Ice Maker")).toBe(false);
  });
});
