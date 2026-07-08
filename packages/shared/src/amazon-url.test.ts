import { describe, expect, it } from "vitest";
import { isAllowedAmazonMarketplace, normalizeAmazonMarketplaceHost } from "./amazon-url.js";

describe("amazon marketplace host normalization", () => {
  it.each([
    ["US", "www.amazon.com"],
    ["UK", "www.amazon.co.uk"],
    ["GB", "www.amazon.co.uk"],
    ["DE", "www.amazon.de"],
    ["JP", "www.amazon.co.jp"],
    ["amazon.com", "www.amazon.com"],
    ["https://www.amazon.co.jp/bestsellers", "www.amazon.co.jp"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeAmazonMarketplaceHost(input)).toBe(expected);
  });

  it.each(["example.com", "amazon.com.evil.test", "localhost:3000"])("rejects %s", (input) => {
    expect(isAllowedAmazonMarketplace(input)).toBe(false);
    expect(() => normalizeAmazonMarketplaceHost(input)).toThrow("marketplace must be a supported Amazon marketplace");
  });
});
