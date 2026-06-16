import { describe, expect, it } from "vitest";
import {
  isRetryableSearchError,
  isRetryableCategoryError,
  isOptionalBestSellerPageEnd,
  isRetryableAmazonNetworkError
} from "./retry.js";

// ---------------------------------------------------------------------------
// isRetryableAmazonNetworkError
// ---------------------------------------------------------------------------
describe("isRetryableAmazonNetworkError", () => {
  it.each([
    "net::ERR_CONNECTION_CLOSED",
    "net::ERR_CONNECTION_RESET",
    "net::ERR_CONNECTION_ABORTED",
    "net::ERR_CONNECTION_TIMED_OUT",
    "net::ERR_TIMED_OUT",
    "net::ERR_INTERNET_DISCONNECTED",
    "net::ERR_PROXY_CONNECTION_FAILED",
    "net::ERR_TUNNEL_CONNECTION_FAILED"
  ])("matches Chromium net error: %s", (msg) => {
    expect(isRetryableAmazonNetworkError(msg)).toBe(true);
  });

  it("matches net errors case-insensitively", () => {
    expect(isRetryableAmazonNetworkError("net::err_connection_reset")).toBe(true);
    expect(isRetryableAmazonNetworkError("NET::ERR_TIMED_OUT")).toBe(true);
  });

  it.each([
    "Client network socket disconnected",
    "client network socket disconnected before secure TLS connection was established",
    "socket hang up",
    "read ECONNRESET",
    "connect ETIMEDOUT 54.239.28.85:443"
  ])("matches Node-level network error: %s", (msg) => {
    expect(isRetryableAmazonNetworkError(msg)).toBe(true);
  });

  it.each([
    "",
    "Page not found",
    "Something went wrong",
    "404 Not Found",
    "net::ERR_NAME_NOT_RESOLVED",
    "net::ERR_SSL_PROTOCOL_ERROR"
  ])("returns false for non-network error: %s", (msg) => {
    expect(isRetryableAmazonNetworkError(msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRetryableSearchError
// ---------------------------------------------------------------------------
describe("isRetryableSearchError", () => {
  describe("search-specific patterns", () => {
    it.each([
      "Amazon returned a temporary error page",
      "Sorry! Something went wrong! Please try again.",
      "no-search-cards found on the page",
      "Timeout 30000ms exceeded waiting for s-search-result",
      "zero product cards returned for keyword"
    ])("matches: %s", (msg) => {
      expect(isRetryableSearchError(new Error(msg))).toBe(true);
    });
  });

  describe("inherits network-level errors", () => {
    it.each([
      "net::ERR_CONNECTION_RESET",
      "socket hang up",
      "read ECONNRESET"
    ])("matches: %s", (msg) => {
      expect(isRetryableSearchError(new Error(msg))).toBe(true);
    });
  });

  it("extracts message from Error instances", () => {
    expect(isRetryableSearchError(new Error("Something went wrong"))).toBe(true);
  });

  it("converts non-Error values via String()", () => {
    expect(isRetryableSearchError("Something went wrong")).toBe(true);
    expect(isRetryableSearchError(42)).toBe(false);
    expect(isRetryableSearchError(null)).toBe(false);
    expect(isRetryableSearchError(undefined)).toBe(false);
  });

  it.each([
    "Page loaded successfully",
    "no results found",
    "Timeout waiting for footer",
    "",
    "bestseller cards missing"
  ])("returns false for unrelated message: %s", (msg) => {
    expect(isRetryableSearchError(new Error(msg))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRetryableCategoryError
// ---------------------------------------------------------------------------
describe("isRetryableCategoryError", () => {
  describe("category-specific patterns", () => {
    it.each([
      "Amazon returned a temporary error page",
      "Sorry! Something went wrong!",
      "no-bestseller-cards detected",
      "Best Sellers short page — only 10 items",
      "Best Sellers returned zero product cards",
      "Timeout 30000ms exceeded for product-card selector",
      "Timeout 15000ms exceeded for gridItemRoot selector"
    ])("matches: %s", (msg) => {
      expect(isRetryableCategoryError(new Error(msg))).toBe(true);
    });
  });

  describe("inherits network-level errors", () => {
    it.each([
      "net::ERR_CONNECTION_ABORTED",
      "Client network socket disconnected",
      "connect ETIMEDOUT 52.94.225.100:443"
    ])("matches: %s", (msg) => {
      expect(isRetryableCategoryError(new Error(msg))).toBe(true);
    });
  });

  it("extracts message from Error instances", () => {
    expect(isRetryableCategoryError(new Error("Best Sellers short page"))).toBe(true);
  });

  it("converts non-Error values via String()", () => {
    expect(isRetryableCategoryError("Best Sellers short page")).toBe(true);
    expect(isRetryableCategoryError(null)).toBe(false);
    expect(isRetryableCategoryError(undefined)).toBe(false);
  });

  it.each([
    "Page loaded successfully",
    "no-search-cards",
    "zero product cards",
    "",
    "Timeout waiting for body"
  ])("returns false for unrelated message: %s", (msg) => {
    expect(isRetryableCategoryError(new Error(msg))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOptionalBestSellerPageEnd
// ---------------------------------------------------------------------------
describe("isOptionalBestSellerPageEnd", () => {
  const matchingMessages = [
    "missing page for category Electronics",
    "We couldn't find that page",
    "We couldn\u2019t find that page" // smart apostrophe matched by .?
  ];

  it.each(matchingMessages)("matches when pageNo > required and collected > 0: %s", (msg) => {
    expect(isOptionalBestSellerPageEnd(new Error(msg), 5, 3, 10)).toBe(true);
  });

  it("returns false when pageNo <= requiredPageCount even with matching message", () => {
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 3, 3, 10)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 2, 5, 10)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 1, 1, 50)).toBe(false);
  });

  it("returns false when collected <= 0 even with matching message and pageNo > required", () => {
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 5, 3, 0)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 5, 3, -5)).toBe(false);
  });

  it("returns false for non-matching messages even when boundary conditions are met", () => {
    expect(isOptionalBestSellerPageEnd(new Error("Something went wrong"), 5, 3, 10)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error("net::ERR_CONNECTION_RESET"), 5, 3, 10)).toBe(false);
    expect(isOptionalBestSellerPageEnd(new Error(""), 5, 3, 10)).toBe(false);
  });

  it("converts non-Error values via String()", () => {
    expect(isOptionalBestSellerPageEnd("missing page for category", 5, 3, 10)).toBe(true);
    expect(isOptionalBestSellerPageEnd(null, 5, 3, 10)).toBe(false);
    expect(isOptionalBestSellerPageEnd(undefined, 5, 3, 10)).toBe(false);
  });

  it("handles boundary: pageNo exactly one above requiredPageCount", () => {
    expect(isOptionalBestSellerPageEnd(new Error("missing page for category"), 4, 3, 1)).toBe(true);
  });

  it("handles boundary: collected exactly 1", () => {
    expect(isOptionalBestSellerPageEnd(new Error("couldn't find that page"), 5, 3, 1)).toBe(true);
  });
});
