import { afterEach, describe, expect, it, vi } from "vitest";
import { detailConcurrency, pageDelayMs, searchRetryCount, timeoutMs } from "./config.js";

describe("amazon config env parsing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back when integer env values are blank or invalid", () => {
    vi.stubEnv("AMAZON_COLLECT_TIMEOUT_MS", "");
    expect(timeoutMs()).toBe(30000);

    vi.stubEnv("AMAZON_COLLECT_TIMEOUT_MS", "abc");
    expect(timeoutMs()).toBe(30000);
  });

  it("clamps numeric env values to safe integer bounds", () => {
    vi.stubEnv("AMAZON_COLLECT_DETAIL_CONCURRENCY", "999999");
    expect(detailConcurrency()).toBe(10);

    vi.stubEnv("AMAZON_COLLECT_PAGE_DELAY_MS", "-20");
    expect(pageDelayMs()).toBe(0);

    vi.stubEnv("AMAZON_COLLECT_SEARCH_RETRIES", "3.9");
    expect(searchRetryCount()).toBe(3);
  });
});
