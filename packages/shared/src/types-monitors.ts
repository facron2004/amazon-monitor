import type { NullableNumber } from "./types-common.js";

export type KeywordStatus = "enabled" | "disabled";

export interface KeywordMonitor {
  id: number;
  keyword: string;
  marketplace: string;
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
  keyword: string;
  marketplace: string;
  zipCode?: string | null;
  language?: string | null;
  categoryTag?: string | null;
  crawlPages?: number;
  status?: KeywordStatus;
}

export type CategoryStatus = "enabled" | "disabled";

export interface CategoryMonitor {
  id: number;
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
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath?: string | null;
  crawlTopN?: number;
  status?: CategoryStatus;
}
