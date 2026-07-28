import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Sop, SopListResponse } from "@amazon-monitor/shared";
import * as sopApi from "../api-sops";
import { useSopStore } from "./sops";

describe("useSopStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("keeps pagination, status counts, and selection from the server page", async () => {
    const first = sampleSop(1);
    vi.spyOn(sopApi, "listSopPage").mockResolvedValue(
      page([first], 205, 0),
    );
    const store = useSopStore();

    await store.fetchSops();

    expect(store.total).toBe(205);
    expect(store.pageCount).toBe(9);
    expect(store.selectedSop?.id).toBe(1);
    expect(store.statusCounts).toEqual({
      all: 205,
      draft: 120,
      published: 80,
      archived: 5,
    });
  });

  it("clamps page changes and preserves active server filters", async () => {
    const listSopPage = vi
      .spyOn(sopApi, "listSopPage")
      .mockResolvedValue(page([], 205, 200));
    const store = useSopStore();
    store.status = "published";
    store.category = "price_action";
    store.query = "coupon";
    store.total = 205;

    await store.goToPage(99);

    expect(listSopPage).toHaveBeenCalledWith({
      status: "published",
      category: "price_action",
      q: "coupon",
      limit: 25,
      offset: 200,
    });
    expect(store.currentPage).toBe(9);
  });

  it("connects draft editing and refreshes the selected SOP", async () => {
    const updated = sampleSop(7, { title: "Updated SOP" });
    const updateSop = vi.spyOn(sopApi, "updateSop").mockResolvedValue(updated);
    vi.spyOn(sopApi, "listSopPage").mockResolvedValue(page([updated], 1, 0));
    const store = useSopStore();

    await store.update(7, {
      title: "Updated SOP",
      category: "price_action",
      bodyMd: "# Updated",
      tags: ["price"],
    });

    expect(updateSop).toHaveBeenCalledWith(7, {
      title: "Updated SOP",
      category: "price_action",
      bodyMd: "# Updated",
      tags: ["price"],
    });
    expect(store.selectedSop?.title).toBe("Updated SOP");
  });
});

function page(
  sops: Sop[],
  total: number,
  offset: number,
): SopListResponse {
  return {
    sops,
    total,
    limit: 25,
    offset,
    statusCounts: {
      all: 205,
      draft: 120,
      published: 80,
      archived: 5,
    },
  };
}

function sampleSop(id: number, overrides: Partial<Sop> = {}): Sop {
  return {
    id,
    orgId: 1,
    title: `SOP ${id}`,
    category: "general",
    bodyMd: "# Steps",
    sourceTaskId: null,
    status: "draft",
    tags: [],
    createdBy: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}
