import type { InsightEvent } from "@amazon-monitor/shared";
import type { InsightEventQuery } from "./api-insight-events";

const INSIGHT_EVENT_PAGE_SIZE = 250;

export type InsightEventPageFetcher = (params: InsightEventQuery) => Promise<InsightEvent[]>;

export async function fetchAllInsightEventPages(
  fetchPage: InsightEventPageFetcher,
  params: InsightEventQuery = {}
): Promise<InsightEvent[]> {
  const events: InsightEvent[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await fetchPage({
      ...params,
      limit: INSIGHT_EVENT_PAGE_SIZE,
      offset
    });
    let added = 0;
    for (const event of page) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      events.push(event);
      added += 1;
    }
    if (page.length < INSIGHT_EVENT_PAGE_SIZE || added === 0) break;
    offset += page.length;
  }

  return events;
}
