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
  });
});
