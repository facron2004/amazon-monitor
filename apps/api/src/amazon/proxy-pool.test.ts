import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyPool } from "./proxy-pool.js";

describe("ProxyPool", () => {
  beforeEach(() => {
    ProxyPool.resetInstance();
    vi.stubEnv("AMAZON_COLLECT_PROXIES", "");
    vi.stubEnv("AMAZON_COLLECT_PROXY_API", "");
    vi.stubEnv("AMAZON_COLLECT_PROXY_MAX_FAILURES", "2");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null if no proxies configured", async () => {
    const pool = ProxyPool.getInstance();
    const proxy = await pool.getProxy();
    expect(proxy).toBeNull();
  });

  it("rotates static proxies in a least-recently-used round robin", async () => {
    vi.stubEnv("AMAZON_COLLECT_PROXIES", "http://proxy1:8080,http://proxy2:8080");
    const pool = ProxyPool.getInstance();

    const p1 = await pool.getProxy();
    const p2 = await pool.getProxy();
    const p3 = await pool.getProxy();

    expect(p1?.server).toBe("http://proxy1:8080");
    expect(p2?.server).toBe("http://proxy2:8080");
    expect(p3?.server).toBe("http://proxy1:8080");
  });

  it("correctly parses credentials", async () => {
    vi.stubEnv("AMAZON_COLLECT_PROXIES", "http://user:pass@proxy1:8080");
    const pool = ProxyPool.getInstance();

    const p = await pool.getProxy();
    expect(p?.server).toBe("http://proxy1:8080");
    expect(p?.username).toBe("user");
    expect(p?.password).toBe("pass");
  });

  it("disables static proxies after max failures is reached", async () => {
    vi.stubEnv("AMAZON_COLLECT_PROXIES", "http://proxy1:8080,http://proxy2:8080");
    const pool = ProxyPool.getInstance();

    // Report 2 failures for proxy1 (max failures is 2)
    pool.reportFailure("http://proxy1:8080");
    pool.reportFailure("http://proxy1:8080");

    // Only proxy2 should be returned now
    const p1 = await pool.getProxy();
    const p2 = await pool.getProxy();

    expect(p1?.server).toBe("http://proxy2:8080");
    expect(p2?.server).toBe("http://proxy2:8080");
  });

  it("handles dynamic proxy from API and discards on failure", async () => {
    vi.stubEnv("AMAZON_COLLECT_PROXY_API", "http://my-proxy-api.com/get");
    
    let fetchCallCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      return {
        ok: true,
        text: async () => `http://dynamic-ip-${fetchCallCount}:8080`
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    const pool = ProxyPool.getInstance();

    const p1 = await pool.getProxy();
    const p2 = await pool.getProxy(); // uses cache

    expect(p1?.server).toBe("http://dynamic-ip-1:8080");
    expect(p2?.server).toBe("http://dynamic-ip-1:8080");
    expect(fetchCallCount).toBe(1);

    // Report failure
    pool.reportFailure("http://dynamic-ip-1:8080");

    const p3 = await pool.getProxy(); // should fetch again
    expect(p3?.server).toBe("http://dynamic-ip-2:8080");
    expect(fetchCallCount).toBe(2);
  });
});
