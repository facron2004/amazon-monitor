import type { KeywordMonitor } from "@amazon-monitor/shared";
import { includeLanguageQuery, normalizeLocale, normalizeMarketplaceHost } from "./config.js";

export function buildSearchUrl(keyword: KeywordMonitor, pageNo: number): string {
  const host = normalizeMarketplaceHost(keyword.marketplace);
  const search = new URL(`https://${host}/s`);
  search.searchParams.set("k", keyword.keyword);
  search.searchParams.set("page", String(pageNo));
  if (includeLanguageQuery() && keyword.language) {
    search.searchParams.set("language", normalizeLocale(keyword.language));
  }
  return search.toString();
}

export function buildBestSellerPageUrl(categoryUrl: string, pageNo: number): string {
  const url = new URL(categoryUrl);
  if (pageNo > 1) {
    url.searchParams.set("pg", String(pageNo));
  } else {
    url.searchParams.delete("pg");
  }
  return url.toString();
}
