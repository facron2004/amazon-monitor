export function resolveCollectionDataSource(explicit: string | undefined, hasCustomCollector: boolean): string {
  const configured = explicit?.trim();
  if (configured) return configured;
  return hasCustomCollector ? "collector" : "amazon_playwright";
}
