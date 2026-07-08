import { normalizeAmazonMarketplaceHost } from "@amazon-monitor/shared";

export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizeMarketplaceHost(marketplace: string): string {
  return normalizeAmazonMarketplaceHost(marketplace);
}

export function normalizeLocale(language: string | null): string {
  return (language || "en_US").replace("_", "-");
}

export function acceptLanguage(language: string | null): string {
  const locale = normalizeLocale(language);
  return `${locale},en;q=0.9`;
}

export function timeoutMs(): number {
  return intEnv("AMAZON_COLLECT_TIMEOUT_MS", 30000, 1000, 120000);
}

export function searchRetryCount(): number {
  return intEnv("AMAZON_COLLECT_SEARCH_RETRIES", 3, 1, 10);
}

export function searchRetryDelayMs(): number {
  return intEnv("AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS", 2500, 0, 60000);
}

export function categoryRetryCount(): number {
  return intEnv("AMAZON_COLLECT_CATEGORY_RETRIES", 2, 1, 10);
}

export function detailTimeoutMs(): number {
  return intEnv("AMAZON_COLLECT_DETAIL_TIMEOUT_MS", 15000, 1000, 120000);
}

export function pageDelayMs(): number {
  return intEnv("AMAZON_COLLECT_PAGE_DELAY_MS", 5000, 0, 60000);
}

export function detailSettleMs(): number {
  return intEnv("AMAZON_COLLECT_DETAIL_SETTLE_MS", 300, 0, 10000);
}

export function bestSellerPageSize(): number {
  return intEnv("AMAZON_BESTSELLER_PAGE_SIZE", 50, 1, 100);
}

export function bestSellerExtraPages(): number {
  return intEnv("AMAZON_BESTSELLER_EXTRA_PAGES", 2, 0, 10);
}

export function bestSellerScrollPasses(): number {
  return intEnv("AMAZON_BESTSELLER_SCROLL_PASSES", 12, 1, 100);
}

export function bestSellerMinScrollPasses(): number {
  return intEnv("AMAZON_BESTSELLER_MIN_SCROLL_PASSES", 6, 0, 100);
}

export function bestSellerStablePasses(): number {
  return intEnv("AMAZON_BESTSELLER_STABLE_PASSES", 4, 1, 50);
}

export function bestSellerScrollDelayMs(): number {
  return intEnv("AMAZON_BESTSELLER_SCROLL_DELAY_MS", 700, 0, 10000);
}

export function bestSellerViewportWidth(): number {
  return intEnv("AMAZON_BESTSELLER_VIEWPORT_WIDTH", 1920, 320, 3840);
}

export function bestSellerViewportHeight(): number {
  return intEnv("AMAZON_BESTSELLER_VIEWPORT_HEIGHT", 1080, 320, 2160);
}

export function bestSellerDetailTopN(): number {
  return intEnv("AMAZON_BESTSELLER_DETAIL_TOP_N", 50, 0, 1000);
}

export function bestSellerPromoDetailTopN(): number {
  return intEnv("AMAZON_BESTSELLER_PROMO_DETAIL_TOP_N", 30, 0, 1000);
}

export function detailConcurrency(): number {
  return intEnv("AMAZON_COLLECT_DETAIL_CONCURRENCY", 3, 1, 10);
}

export function maxDetailProducts(): number {
  return intEnv("AMAZON_COLLECT_MAX_DETAIL_PRODUCTS", 9999, 0, 10000);
}

export function detailCacheMaxItems(): number {
  // Default 1000: cache is keyed by (parserVersion|date|marketplace|asin) and
  // the same ASIN reappears across multiple keywords/categories on the same
  // day — re-opening the detail page for it is pure waste. Collector
  // instances are module-level singletons, so the cache survives across
  // jobs within a worker run. Set to 0 to disable.
  return intEnv("AMAZON_COLLECT_DETAIL_CACHE_ITEMS", 1000, 0, 50000);
}

export function blockHeavyResources(): boolean {
  return process.env.AMAZON_COLLECT_BLOCK_RESOURCES !== "false";
}

export function blockCategoryResources(): boolean {
  return process.env.AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES !== "false";
}

export function blockCategoryImages(): boolean {
  return process.env.AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES === "true";
}

export function waitForNetworkIdle(): boolean {
  return process.env.AMAZON_COLLECT_WAIT_NETWORK_IDLE === "true";
}

export function includeLanguageQuery(): boolean {
  return process.env.AMAZON_COLLECT_INCLUDE_LANGUAGE_PARAM === "true";
}

export function defaultZipCode(zipCode?: string | null): string {
  return zipCode?.trim() || process.env.AMAZON_ZIP_CODE?.trim() || "97201";
}
