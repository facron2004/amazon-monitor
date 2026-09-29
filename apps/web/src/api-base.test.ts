import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRequestUrl, clearRequestCache, request } from "./api-base";
import { beginSessionBoundary } from "./session-boundary";

afterEach(() => {
  beginSessionBoundary(null);
  clearRequestCache();
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

  it("uses cookies by default without reading browser-accessible credentials", async () => {
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
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).not.toHaveProperty("x-amazon-monitor-session");
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });

  it("does not reuse a cached response after the organization changes", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ organization: "A" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ organization: "B" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    beginSessionBoundary({ organizationId: 1, userId: 10 });
    await expect(request<{ organization: string }>("/dashboard/summary")).resolves.toEqual({ organization: "A" });

    beginSessionBoundary({ organizationId: 2, userId: 20 });
    await expect(request<{ organization: string }>("/dashboard/summary")).resolves.toEqual({ organization: "B" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts stale in-flight work and prevents its response from being returned", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
        requestSignal = init?.signal ?? undefined;
        resolveResponse = resolve;
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    beginSessionBoundary({ organizationId: 1, userId: 10 });
    const staleRequest = request<{ organization: string }>("/dashboard/summary");
    const sharedRequest = request<{ organization: string }>("/dashboard/summary");

    beginSessionBoundary({ organizationId: 2, userId: 20 });
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);

    resolveResponse(new Response(JSON.stringify({ organization: "A" }), { status: 200 }));
    await expect(staleRequest).rejects.toMatchObject({ name: "AbortError" });
    await expect(sharedRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an already cancelled caller even when the response is cached", async () => {
    const fetchMock = vi.fn(async () => Response.json({ value: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await request("/tasks");
    const controller = new AbortController();
    controller.abort();
    await expect(request("/tasks", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a cancelled in-flight request or cache its late response", async () => {
    let resolveOld: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn<() => Promise<Response>>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(Response.json({ value: "new" }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const oldRequest = request("/tasks", { signal: controller.signal });
    controller.abort();
    const nextRequest = request("/tasks");
    resolveOld(Response.json({ value: "old" }));

    await expect(oldRequest).rejects.toMatchObject({ name: "AbortError" });
    await expect(nextRequest).resolves.toEqual({ value: "new" });
    await expect(request("/tasks")).resolves.toEqual({ value: "new" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes the caller abort listener when a request settles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await request("/tasks", { signal: controller.signal });
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
  });
});
