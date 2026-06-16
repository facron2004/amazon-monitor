import type { CategoryMonitor, KeywordMonitor } from "@amazon-monitor/shared";

export interface KeywordRow {
  id: number;
  keyword: string;
  marketplace: string;
  zip_code: string | null;
  language: string | null;
  category_tag: string | null;
  crawl_pages: number;
  status: number;
  last_collected_at: string | null;
  today_status: "success" | "failed" | "pending";
  created_at: string;
  updated_at: string;
}

export function mapKeyword(row: KeywordRow): KeywordMonitor {
  return {
    id: row.id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    zipCode: row.zip_code,
    language: row.language,
    categoryTag: row.category_tag,
    crawlPages: row.crawl_pages,
    status: row.status === 1 ? "enabled" : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCollectedAt: row.last_collected_at,
    todayStatus: row.today_status
  };
}

export interface CategoryMonitorRow {
  id: number;
  name: string;
  marketplace: string;
  category_url: string;
  category_path: string | null;
  crawl_top_n: number;
  status: number;
  last_collected_at: string | null;
  today_status: "success" | "failed" | "pending";
  created_at: string;
  updated_at: string;
}

export function mapCategoryMonitor(row: CategoryMonitorRow): CategoryMonitor {
  return {
    id: row.id,
    name: row.name,
    marketplace: row.marketplace,
    categoryUrl: row.category_url,
    categoryPath: row.category_path,
    crawlTopN: row.crawl_top_n,
    status: row.status === 1 ? "enabled" : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCollectedAt: row.last_collected_at,
    todayStatus: row.today_status
  };
}
