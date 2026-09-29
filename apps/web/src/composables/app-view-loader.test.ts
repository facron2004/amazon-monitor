import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppViewLoaders } from "./app-view-loader";
import { clearViewCache, loadAppView } from "./app-view-loader";
import { beginSessionBoundary } from "../session-boundary";

function createLoaders(loader: () => Promise<void>): AppViewLoaders {
  return {
    overview: loader,
    categories: loader,
    keywords: loader,
    competitors: loader,
    products: loader,
    inventory: loader,
    profit: loader,
    "listing-health": loader,
    ads: loader,
    "review-voc": loader,
    "action-center": loader,
    "agent-os": loader,
    "ai-agents": loader,
    tasks: loader,
    promotions: loader,
    sops: loader,
    rules: loader,
    "data-sources": loader,
    alerts: loader,
    reports: loader,
    notifications: loader,
    logs: loader
  };
}

afterEach(() => {
  beginSessionBoundary(null);
  clearViewCache();
  vi.restoreAllMocks();
});

describe("loadAppView", () => {
  it("does not cache a loader that resolves after cancellation", async () => {
    const controller = new AbortController();
    const loader = vi.fn(async () => { controller.abort(); });
    const loaders = createLoaders(loader);

    await expect(loadAppView("agent-os", loaders, "2026-07-28", false, controller.signal))
      .rejects.toBeInstanceOf(DOMException);
    await expect(loadAppView("agent-os", loaders, "2026-07-28")).resolves.toEqual({ cached: false });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not start loading with an already cancelled signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const loader = vi.fn(async () => undefined);

    await expect(loadAppView("overview", createLoaders(loader), "2026-07-28", false, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("does not reuse a view cache entry after a session boundary", async () => {
    const loader = vi.fn(async () => undefined);
    const loaders = createLoaders(loader);

    beginSessionBoundary({ organizationId: 1, userId: 10 });
    await expect(loadAppView("overview", loaders, "2026-07-28")).resolves.toEqual({ cached: false });
    await expect(loadAppView("overview", loaders, "2026-07-28")).resolves.toEqual({ cached: true });

    beginSessionBoundary({ organizationId: 2, userId: 20 });
    await expect(loadAppView("overview", loaders, "2026-07-28")).resolves.toEqual({ cached: false });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("bypasses the view cache when a collection has completed", async () => {
    const loader = vi.fn(async () => undefined);
    const loaders = createLoaders(loader);

    beginSessionBoundary({ organizationId: 1, userId: 10 });
    await expect(loadAppView("keywords", loaders, "2026-07-28")).resolves.toEqual({ cached: false });
    await expect(loadAppView("keywords", loaders, "2026-07-28", true)).resolves.toEqual({ cached: false });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("rejects a view that completes after a session boundary", async () => {
    let resolveLoader: () => void = () => undefined;
    const loader = vi.fn(() => new Promise<void>((resolve) => {
      resolveLoader = resolve;
    }));

    beginSessionBoundary({ organizationId: 1, userId: 10 });
    const staleLoad = loadAppView("overview", createLoaders(loader), "2026-07-28");

    beginSessionBoundary({ organizationId: 2, userId: 20 });
    resolveLoader();

    await expect(staleLoad).rejects.toMatchObject({ name: "AbortError" });
    await expect(staleLoad).rejects.toBeInstanceOf(DOMException);
  });
});
