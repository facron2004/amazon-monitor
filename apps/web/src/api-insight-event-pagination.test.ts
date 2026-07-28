import { describe, expect, it, vi } from "vitest";
import type { InsightEvent } from "@amazon-monitor/shared";
import { fetchAllInsightEventPages } from "./api-insight-event-pagination";

function createEvent(id: string): InsightEvent {
  return { id } as InsightEvent;
}

describe("fetchAllInsightEventPages", () => {
  it("loads every page using stable offsets", async () => {
    const allEvents = Array.from({ length: 501 }, (_value, index) => createEvent(`event-${index}`));
    const fetchPage = vi.fn(async ({ limit = 250, offset = 0 }) =>
      allEvents.slice(offset, offset + limit)
    );

    const result = await fetchAllInsightEventPages(fetchPage, { date: "2026-07-25" });

    expect(result).toHaveLength(501);
    expect(fetchPage.mock.calls.map(([params]) => [params.limit, params.offset])).toEqual([
      [250, 0],
      [250, 250],
      [250, 500]
    ]);
  });

  it("stops when a repeated page makes no progress", async () => {
    const repeatedPage = Array.from({ length: 250 }, (_value, index) => createEvent(`event-${index}`));
    const fetchPage = vi.fn().mockResolvedValue(repeatedPage);

    const result = await fetchAllInsightEventPages(fetchPage);

    expect(result).toHaveLength(250);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
