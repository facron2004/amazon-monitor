import type {
  CompetitorCsvImportResult,
  CompetitorFolder,
  CompetitorKpiComparison,
  CompetitorPoolItem,
  CompetitorSnapshotEvidence,
  CreateManualCompetitorInput,
  ProductActivityCalendar,
  ProductLink,
} from "@amazon-monitor/shared";
import { request } from "./api-base";
import type {
  CompetitorListQuery,
  ProductActivityCalendarQuery,
} from "./api-types";

export const competitorApi = {
  createManualCompetitor: (payload: CreateManualCompetitorInput) =>
    request<CompetitorPoolItem>("/competitors", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addCategoryCompetitor: (asin: string, categoryId: number) =>
    request<CompetitorPoolItem>("/competitors/from-category", {
      method: "POST",
      body: JSON.stringify({ asin, categoryId }),
    }),
  importCsv: (source: string) =>
    request<CompetitorCsvImportResult>("/competitors/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: source,
    }),
  competitors: (payload: CompetitorListQuery = {}) => {
    const params = new URLSearchParams();
    if (payload.keywordId) params.set("keywordId", String(payload.keywordId));
    if (payload.sourceType && payload.sourceType !== "all")
      params.set("sourceType", payload.sourceType);
    if (payload.tier && payload.tier !== "all")
      params.set("tier", payload.tier);
    const query = params.toString();
    return request<CompetitorPoolItem[]>(
      `/competitors${query ? `?${query}` : ""}`,
    );
  },
  competitorKpis: () => request<CompetitorKpiComparison>("/competitors/kpis"),
  competitor: (id: number) => request<CompetitorPoolItem>(`/competitors/${id}`),
  competitorSnapshots: (
    id: number,
    payload: {
      date?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.startDate) params.set("startDate", payload.startDate);
    if (payload.endDate) params.set("endDate", payload.endDate);
    if (payload.limit) params.set("limit", String(payload.limit));
    if (payload.offset) params.set("offset", String(payload.offset));
    const query = params.toString();
    return request<CompetitorSnapshotEvidence[]>(
      `/competitors/${id}/snapshots${query ? `?${query}` : ""}`,
    );
  },
  competitorTimeline: (
    id: number,
    payload: ProductActivityCalendarQuery = {},
  ) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.limitDays) params.set("limitDays", String(payload.limitDays));
    const query = params.toString();
    return request<ProductActivityCalendar>(
      `/competitors/${id}/timeline${query ? `?${query}` : ""}`,
    );
  },
  competitorFolders: () => request<CompetitorFolder[]>("/competitor-folders"),
  productActivityCalendar: (
    asin: string,
    payload: ProductActivityCalendarQuery = {},
  ) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.marketplace) params.set("marketplace", payload.marketplace);
    if (payload.limitDays) params.set("limitDays", String(payload.limitDays));
    const query = params.toString();
    return request<ProductActivityCalendar>(
      `/products/${encodeURIComponent(asin)}/activity-calendar${query ? `?${query}` : ""}`,
    );
  },
  productLink: (asin: string, keywordId?: CompetitorListQuery["keywordId"]) =>
    request<ProductLink>(
      `/competitors/${asin}/link${keywordId ? `?keywordId=${keywordId}` : ""}`,
    ),
  setKeyCompetitor: (asin: string, isKeyCompetitor: boolean) =>
    request<CompetitorPoolItem>(`/competitors/${asin}/key`, {
      method: "PATCH",
      body: JSON.stringify({ isKeyCompetitor }),
    }),
};
