import type { CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar, ProductLink } from "@amazon-monitor/shared";
import { request } from "./api-base";
import type { CompetitorListQuery, ProductActivityCalendarQuery } from "./api-types";

export const competitorApi = {
  competitors: (payload: CompetitorListQuery = {}) => {
    const params = new URLSearchParams();
    if (payload.keywordId) params.set("keywordId", String(payload.keywordId));
    if (payload.sourceType && payload.sourceType !== "all") params.set("sourceType", payload.sourceType);
    if (payload.tier && payload.tier !== "all") params.set("tier", payload.tier);
    const query = params.toString();
    return request<CompetitorPoolItem[]>(`/competitors${query ? `?${query}` : ""}`);
  },
  competitorFolders: () => request<CompetitorFolder[]>("/competitor-folders"),
  productActivityCalendar: (asin: string, payload: ProductActivityCalendarQuery = {}) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.marketplace) params.set("marketplace", payload.marketplace);
    if (payload.limitDays) params.set("limitDays", String(payload.limitDays));
    const query = params.toString();
    return request<ProductActivityCalendar>(`/products/${encodeURIComponent(asin)}/activity-calendar${query ? `?${query}` : ""}`);
  },
  productLink: (asin: string, keywordId?: CompetitorListQuery["keywordId"]) =>
    request<ProductLink>(`/competitors/${asin}/link${keywordId ? `?keywordId=${keywordId}` : ""}`),
  setKeyCompetitor: (asin: string, isKeyCompetitor: boolean) =>
    request<CompetitorPoolItem>(`/competitors/${asin}/key`, {
      method: "PATCH",
      body: JSON.stringify({ isKeyCompetitor })
    })
};
