import { describe, expect, it } from "vitest";
import { formatMarketplaceMoney, normalizeMarketplaceCode } from "./marketplace-money";

describe("marketplace money formatting", () => {
  it.each([
    ["US", "US"],
    ["www.amazon.co.uk", "UK"],
    ["amazon.de", "DE"],
    ["JP", "JP"]
  ] as const)("normalizes %s", (marketplace, expected) => {
    expect(normalizeMarketplaceCode(marketplace)).toBe(expected);
  });

  it("keeps currencies separate and leaves missing values explicit", () => {
    expect(formatMarketplaceMoney(1234.5, "US")).toContain("$1,234.50");
    expect(formatMarketplaceMoney(1234.5, "DE")).toContain("1.234,50");
    expect(formatMarketplaceMoney(1234.5, "JP")).toContain("1,235");
    expect(formatMarketplaceMoney(null, "US")).toBe("--");
  });
});
