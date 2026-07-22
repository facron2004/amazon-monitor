import type { CategoryMonitor, KeywordMonitor, KeywordPriority } from "@amazon-monitor/shared";

export interface KeywordRow {
  id: number;
  org_id: number;
  keyword: string;
  marketplace: string;
  priority: string;
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
    orgId: row.org_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    priority: normalizeKeywordPriority(row.priority),
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

function normalizeKeywordPriority(value: string): KeywordPriority {
  return value === "S" || value === "A" || value === "B" ? value : "C";
}

export interface CategoryMonitorRow {
  id: number;
  org_id: number;
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
    orgId: row.org_id,
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
