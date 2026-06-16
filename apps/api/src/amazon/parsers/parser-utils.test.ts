import { describe, expect, it } from "vitest";
import {
  parsePrice,
  inferCurrency,
  parseInteger,
  parseRating,
  absolutize,
  extractAsin
} from "./parser-utils.js";

// ── parsePrice ────────────────────────────────────────────────────────────

describe("parsePrice", () => {
  describe("US format (dollar symbol, comma thousands, dot decimal)", () => {
    it("parses a standard price with cents", () => {
      expect(parsePrice("$89.99")).toBe(89.99);
    });

    it("parses a price with thousands separator and cents", () => {
      expect(parsePrice("$1,299.99")).toBe(1299.99);
    });

    it("parses a price with thousands separator and no cents", () => {
      expect(parsePrice("$1,299")).toBe(1299);
    });

    it("parses a very small price", () => {
      expect(parsePrice("$0.01")).toBe(0.01);
    });

    it("parses a large price with multiple comma groups", () => {
      expect(parsePrice("$12,345.67")).toBe(12345.67);
    });
  });

  describe("UK format (pound symbol, comma thousands, dot decimal)", () => {
    it("parses a price with thousands and pence", () => {
      expect(parsePrice("£1,299.99")).toBe(1299.99);
    });

    it("parses a price without thousands separator", () => {
      expect(parsePrice("£89.99")).toBe(89.99);
    });
  });

  describe("DE / European format (euro symbol, dot thousands, comma decimal)", () => {
    it("parses a price with dot thousands and comma cents", () => {
      expect(parsePrice("1.299,99 €")).toBe(1299.99);
    });

    it("parses a price with comma decimal only", () => {
      expect(parsePrice("89,99 €")).toBe(89.99);
    });

    it("parses a price with dot thousands and zero cents", () => {
      expect(parsePrice("1.299,00 €")).toBe(1299.0);
    });

    it("parses a price with euro symbol before the number", () => {
      expect(parsePrice("€ 29,99")).toBe(29.99);
    });
  });

  describe("JP format (yen symbol, no decimals)", () => {
    it("parses a price with thousands separator", () => {
      expect(parsePrice("¥1,299")).toBe(1299);
    });

    it("parses a larger price", () => {
      expect(parsePrice("¥12,800")).toBe(12800);
    });

    it("parses a small price without separator", () => {
      expect(parsePrice("¥299")).toBe(299);
    });
  });

  describe("edge cases", () => {
    it("returns null for an empty string", () => {
      expect(parsePrice("")).toBeNull();
    });

    it("returns null for N/A", () => {
      expect(parsePrice("N/A")).toBeNull();
    });

    it("returns null for FREE", () => {
      expect(parsePrice("FREE")).toBeNull();
    });

    it("returns null for whitespace-only input", () => {
      expect(parsePrice("   ")).toBeNull();
    });

    it("handles non-breaking spaces between number and currency", () => {
      // \u00A0 is a non-breaking space commonly used in European price formatting
      expect(parsePrice("89,99\u00A0€")).toBe(89.99);
    });
  });
});

// ── inferCurrency ─────────────────────────────────────────────────────────

describe("inferCurrency", () => {
  describe("symbol-based detection", () => {
    it("detects USD from dollar sign", () => {
      expect(inferCurrency("$29.99")).toBe("$");
    });

    it("detects GBP from pound sign", () => {
      expect(inferCurrency("£29.99")).toBe("GBP");
    });

    it("detects EUR from euro sign", () => {
      expect(inferCurrency("€ 29,99")).toBe("EUR");
    });

    it("detects JPY from yen sign", () => {
      expect(inferCurrency("¥1,299")).toBe("JPY");
    });
  });

  describe("code-based detection", () => {
    it("detects USD from currency code", () => {
      expect(inferCurrency("USD 29.99")).toBe("USD");
    });

    it("detects GBP from currency code", () => {
      expect(inferCurrency("GBP 29.99")).toBe("GBP");
    });

    it("detects EUR from currency code", () => {
      expect(inferCurrency("EUR 29,99")).toBe("EUR");
    });

    it("detects JPY from currency code", () => {
      expect(inferCurrency("JPY 1299")).toBe("JPY");
    });

    it("detects HKD from currency code", () => {
      expect(inferCurrency("HKD 199.00")).toBe("HKD");
    });

    it("detects CAD from currency code", () => {
      expect(inferCurrency("CAD 49.99")).toBe("CAD");
    });

    it("detects AUD from currency code", () => {
      expect(inferCurrency("AUD 39.99")).toBe("AUD");
    });
  });

  describe("code-based takes priority over symbol-based", () => {
    it("returns USD code even when a dollar sign is also present", () => {
      expect(inferCurrency("USD $29.99")).toBe("USD");
    });
  });

  describe("default fallback", () => {
    it("defaults to $ when no currency indicator is found", () => {
      expect(inferCurrency("")).toBe("$");
    });

    it("defaults to $ for a plain number", () => {
      expect(inferCurrency("29.99")).toBe("$");
    });
  });
});

// ── parseInteger ──────────────────────────────────────────────────────────

describe("parseInteger", () => {
  describe("US/UK review counts", () => {
    it("parses a comma-separated number", () => {
      expect(parseInteger("12,345")).toBe(12345);
    });

    it("parses a number followed by 'ratings'", () => {
      expect(parseInteger("1,234 ratings")).toBe(1234);
    });

    it("parses a plain small number", () => {
      expect(parseInteger("44")).toBe(44);
    });
  });

  describe("edge cases", () => {
    it("returns null for an empty string", () => {
      expect(parseInteger("")).toBeNull();
    });

    it("returns null for N/A", () => {
      expect(parseInteger("N/A")).toBeNull();
    });

    it("parses a large number with multiple comma groups", () => {
      expect(parseInteger("1,234,567")).toBe(1234567);
    });
  });
});

// ── parseRating ───────────────────────────────────────────────────────────

describe("parseRating", () => {
  it("extracts rating from 'X out of 5 stars' format (US/UK)", () => {
    expect(parseRating("4.6 out of 5 stars")).toBe(4.6);
  });

  it("extracts the first number from Japanese format (leading 5 in '5つ星のうち4.3')", () => {
    // parseRating matches the first numeric token; the leading "5" wins.
    expect(parseRating("5つ星のうち4.3")).toBe(5);
  });

  it("extracts decimal rating when it appears first", () => {
    expect(parseRating("4.3つ星")).toBe(4.3);
  });

  it("extracts a bare decimal rating", () => {
    expect(parseRating("4.5")).toBe(4.5);
  });

  it("extracts an integer rating", () => {
    expect(parseRating("5 out of 5 stars")).toBe(5);
  });

  it("returns null for an empty string", () => {
    expect(parseRating("")).toBeNull();
  });

  it("returns null when no digits are present", () => {
    expect(parseRating("No rating available")).toBeNull();
  });
});

// ── absolutize ────────────────────────────────────────────────────────────

describe("absolutize", () => {
  it("resolves a relative /dp/ path against the UK origin", () => {
    expect(absolutize("/dp/B0ABC12345", "https://www.amazon.co.uk")).toBe(
      "https://www.amazon.co.uk/dp/B0ABC12345"
    );
  });

  it("resolves a relative /dp/ path against the DE origin", () => {
    expect(absolutize("/dp/B0ABC12345", "https://www.amazon.de")).toBe(
      "https://www.amazon.de/dp/B0ABC12345"
    );
  });

  it("resolves a relative /gp/product/ path against the JP origin", () => {
    expect(absolutize("/gp/product/B0ABC12345", "https://www.amazon.co.jp")).toBe(
      "https://www.amazon.co.jp/gp/product/B0ABC12345"
    );
  });

  it("returns an already-absolute URL unchanged", () => {
    const url = "https://www.amazon.com/dp/B0ABC12345?ref=sr_1_1";
    expect(absolutize(url, "https://www.amazon.co.uk")).toBe(url);
  });

  it("uses amazon.com as the default origin when none is specified", () => {
    expect(absolutize("/dp/B0ABC12345")).toBe(
      "https://www.amazon.com/dp/B0ABC12345"
    );
  });

  it("preserves query parameters on relative paths", () => {
    expect(absolutize("/dp/B0ABC12345?ref=sr_1_1", "https://www.amazon.com")).toBe(
      "https://www.amazon.com/dp/B0ABC12345?ref=sr_1_1"
    );
  });
});

// ── extractAsin ───────────────────────────────────────────────────────────

describe("extractAsin", () => {
  it("extracts ASIN from a UK /dp/ URL", () => {
    expect(extractAsin("https://www.amazon.co.uk/dp/B0ABCDEF12")).toBe("B0ABCDEF12");
  });

  it("extracts ASIN from a DE /gp/product/ URL", () => {
    expect(extractAsin("https://www.amazon.de/gp/product/B0ABCDEF12")).toBe("B0ABCDEF12");
  });

  it("extracts ASIN from a JP URL with query parameters", () => {
    expect(extractAsin("https://www.amazon.co.jp/dp/B0ABCDEF12?ref=sr_1_1&keywords=test")).toBe(
      "B0ABCDEF12"
    );
  });

  it("extracts ASIN from a US URL", () => {
    expect(extractAsin("https://www.amazon.com/dp/B0ABCDEF12")).toBe("B0ABCDEF12");
  });

  it("uppercases the ASIN", () => {
    expect(extractAsin("https://www.amazon.com/dp/b0abcdef12")).toBe("B0ABCDEF12");
  });

  it("extracts ASIN from a bare /dp/ path", () => {
    expect(extractAsin("/dp/B0ABCDEF12")).toBe("B0ABCDEF12");
  });

  it("returns empty string when no ASIN is present", () => {
    expect(extractAsin("")).toBe("");
  });

  it("returns empty string for a URL without a recognisable ASIN", () => {
    expect(extractAsin("https://www.amazon.com/gp/browse.html")).toBe("");
  });
});
