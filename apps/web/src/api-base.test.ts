import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRequestUrl, request } from "./api-base";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildRequestUrl", () => {
  it("keeps API paths unchanged when no base URL is configured", () => {
    expect(buildRequestUrl("/api/tasks", "")).toBe("/api/tasks");
    expect(buildRequestUrl("api/tasks", "")).toBe("/api/tasks");
  });

  it("does not duplicate /api when the configured base already includes it", () => {
    expect(buildRequestUrl("/api/tasks", "/api")).toBe("/api/tasks");
    expect(buildRequestUrl("/api/tasks", "http://127.0.0.1:4000/api")).toBe("http://127.0.0.1:4000/api/tasks");
  });

  it("joins host-only bases with API paths", () => {
    expect(buildRequestUrl("/api/tasks", "http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000/api/tasks");
  });

  it("uses cookies by default and does not send stored browser session tokens", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => {
        if (key === "amazon_monitor_auth_token") return "legacy-key";
        if (key === "amazon_monitor_session") return "stale-session";
        return null;
      }),
      removeItem: vi.fn()
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await request<{ ok: boolean }>("/dashboard/summary");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/dashboard/summary");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) {
      throw new Error("fetch init was not captured");
    }
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ Authorization: "Bearer legacy-key" });
    expect(init.headers).not.toHaveProperty("x-amazon-monitor-session");
  });
});
