export function normalizeMarketplaceHost(marketplace: string): string {
  const trimmed = marketplace.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const map: Record<string, string> = {
    US: "www.amazon.com",
    UK: "www.amazon.co.uk",
    DE: "www.amazon.de",
    JP: "www.amazon.co.jp"
  };
  return map[trimmed.toUpperCase()] ?? (trimmed.startsWith("amazon.") ? `www.${trimmed}` : trimmed);
}

export function normalizeLocale(language: string | null): string {
  return (language || "en_US").replace("_", "-");
}

export function acceptLanguage(language: string | null): string {
  const locale = normalizeLocale(language);
  return `${locale},en;q=0.9`;
}

export function timeoutMs(): number {
  return Number(process.env.AMAZON_COLLECT_TIMEOUT_MS ?? 30000);
}

export function searchRetryCount(): number {
  return Number(process.env.AMAZON_COLLECT_SEARCH_RETRIES ?? 3);
}

export function searchRetryDelayMs(): number {
  return Number(process.env.AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS ?? 2500);
}

export function categoryRetryCount(): number {
  return Number(process.env.AMAZON_COLLECT_CATEGORY_RETRIES ?? 2);
}

export function detailTimeoutMs(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_TIMEOUT_MS ?? 15000);
}

export function pageDelayMs(): number {
  return Number(process.env.AMAZON_COLLECT_PAGE_DELAY_MS ?? 5000);
}

export function detailSettleMs(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_SETTLE_MS ?? 300);
}

export function bestSellerPageSize(): number {
  return Number(process.env.AMAZON_BESTSELLER_PAGE_SIZE ?? 50);
}

export function bestSellerExtraPages(): number {
  return Number(process.env.AMAZON_BESTSELLER_EXTRA_PAGES ?? 2);
}

export function bestSellerScrollPasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_SCROLL_PASSES ?? 12);
}

export function bestSellerMinScrollPasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_MIN_SCROLL_PASSES ?? 6);
}

export function bestSellerStablePasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_STABLE_PASSES ?? 4);
}

export function bestSellerScrollDelayMs(): number {
  return Number(process.env.AMAZON_BESTSELLER_SCROLL_DELAY_MS ?? 700);
}

export function bestSellerViewportWidth(): number {
  return Number(process.env.AMAZON_BESTSELLER_VIEWPORT_WIDTH ?? 1920);
}

export function bestSellerViewportHeight(): number {
  return Number(process.env.AMAZON_BESTSELLER_VIEWPORT_HEIGHT ?? 1080);
}

export function bestSellerDetailTopN(): number {
  return Number(process.env.AMAZON_BESTSELLER_DETAIL_TOP_N ?? 50);
}

export function bestSellerPromoDetailTopN(): number {
  return Number(process.env.AMAZON_BESTSELLER_PROMO_DETAIL_TOP_N ?? 30);
}

export function detailConcurrency(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_CONCURRENCY ?? 3);
}

export function maxDetailProducts(): number {
  return Number(process.env.AMAZON_COLLECT_MAX_DETAIL_PRODUCTS ?? 9999);
}

export function detailCacheMaxItems(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_CACHE_ITEMS ?? 0);  // 默认禁用缓存
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
