export type KeywordStatus = "enabled" | "disabled";
export const keywordPriorities = ["S", "A", "B", "C"] as const;
export type KeywordPriority = (typeof keywordPriorities)[number];

export interface KeywordMonitor {
  id: number;
  orgId: number;
  keyword: string;
  marketplace: string;
  priority: KeywordPriority;
  zipCode: string | null;
  language: string | null;
  categoryTag: string | null;
  crawlPages: number;
  status: KeywordStatus;
  createdAt: string;
  updatedAt: string;
  lastCollectedAt: string | null;
  todayStatus: "success" | "failed" | "pending";
}

export interface KeywordMonitorInput {
  orgId?: number;
  keyword: string;
  marketplace: string;
  priority?: KeywordPriority;
  zipCode?: string | null;
  language?: string | null;
  categoryTag?: string | null;
  crawlPages?: number;
  status?: KeywordStatus;
}

export type CategoryStatus = "enabled" | "disabled";

export interface CategoryMonitor {
  id: number;
  orgId: number;
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath: string | null;
  crawlTopN: number;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
  lastCollectedAt: string | null;
  todayStatus: "success" | "failed" | "pending";
}

export interface CategoryMonitorInput {
  orgId?: number;
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath?: string | null;
  crawlTopN?: number;
  status?: CategoryStatus;
}
