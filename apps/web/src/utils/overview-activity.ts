import type { InsightEvent, InsightEventType } from "@amazon-monitor/shared";

export const overviewActivityDomains = ["all", "ranking", "pricing", "listing", "review"] as const;
export type OverviewActivityDomain = (typeof overviewActivityDomains)[number];

const pricingTypes = new Set<InsightEventType>([
  "PRICE_DROP",
  "PRICE_NEW_LOW",
  "COUPON_ADDED",
  "COUPON_REMOVED",
  "DEAL_ADDED",
  "DEAL_REMOVED"
]);

const reviewTypes = new Set<InsightEventType>([
  "REVIEW_SPIKE",
  "RATING_DROP",
  "OWNED_RATING_DROP",
  "REVIEW_NEGATIVE_CLUSTER",
  "LOW_REVIEW_HIGH_RANK"
]);

export function overviewActivityDomainForEvent(event: InsightEvent): Exclude<OverviewActivityDomain, "all"> {
  if (pricingTypes.has(event.eventType)) return "pricing";
  if (event.eventType === "LISTING_CHANGED") return "listing";
  if (reviewTypes.has(event.eventType)) return "review";
  return "ranking";
}

export function prepareOverviewActivityEvents(events: InsightEvent[]): InsightEvent[] {
  const byId = new Map<string, InsightEvent>();
  for (const event of events) {
    if (event.eventLevel === "P0" || event.eventLevel === "P1") {
      byId.set(event.id, event);
    }
  }
  return Array.from(byId.values()).sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt)
    || right.scoreTotal - left.scoreTotal
    || left.id.localeCompare(right.id)
  ));
}

export function filterOverviewActivityEvents(
  events: InsightEvent[],
  domain: OverviewActivityDomain
): InsightEvent[] {
  if (domain === "all") return events;
  return events.filter((event) => overviewActivityDomainForEvent(event) === domain);
}
