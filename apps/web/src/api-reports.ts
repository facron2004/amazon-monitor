import type {
  DailyReportArchive,
  DailyReportHistoryResponse,
  DailyReportReadiness,
  PeriodReportArchive,
  PeriodReportHistoryResponse,
  WorkflowReportPeriod
} from "@amazon-monitor/shared";
import { buildRequestUrl, request, withSignal } from "./api-base";
import type {
  CategoryReportResponse,
  DailyReportResponse,
  InsightReportPeriod,
  PeriodInsightReportResponse
} from "./api-types";

export interface PeriodInsightReportQuery {
  date: string;
  period?: InsightReportPeriod;
  includeAiSummary?: boolean;
}

export const reportsApi = {
  daily: (date: string, keyword?: string, signal?: AbortSignal) =>
    request<DailyReportResponse>(
      `/reports/daily?date=${date}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`,
      withSignal(signal)
    ),
  category: (date: string, categoryId?: number | null, signal?: AbortSignal) =>
    request<CategoryReportResponse>(
      `/reports/category?date=${date}${categoryId ? `&categoryId=${categoryId}` : ""}`,
      withSignal(signal)
    ),
  periodInsight: (query: PeriodInsightReportQuery, signal?: AbortSignal) =>
    request<PeriodInsightReportResponse>(
      `/reports/insights/period?${buildPeriodInsightReportQuery(query).toString()}`,
      withSignal(signal)
    ),
  archive: (date: string, signal?: AbortSignal) =>
    request<DailyReportArchive | null>(`/reports/daily/archive?date=${encodeURIComponent(date)}`, withSignal(signal)),
  readiness: (date: string, signal?: AbortSignal) =>
    request<DailyReportReadiness>(`/reports/daily/readiness?date=${encodeURIComponent(date)}`, withSignal(signal)),
  history: (limit = 30, offset = 0, signal?: AbortSignal) =>
    request<DailyReportHistoryResponse>(
      `/reports/daily/history?limit=${limit}&offset=${offset}`,
      withSignal(signal)
    ),
  generateDaily: (date: string) =>
    request<DailyReportArchive>("/reports/daily/generate", {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  periodArchive: (endDate: string, period: WorkflowReportPeriod, signal?: AbortSignal) =>
    request<PeriodReportArchive | null>(
      `/reports/period/archive?period=${period}&endDate=${encodeURIComponent(endDate)}`,
      withSignal(signal)
    ),
  periodHistory: (period: WorkflowReportPeriod, limit = 30, offset = 0, signal?: AbortSignal) =>
    request<PeriodReportHistoryResponse>(
      `/reports/period/history?period=${period}&limit=${limit}&offset=${offset}`,
      withSignal(signal)
    ),
  generatePeriod: (endDate: string, period: WorkflowReportPeriod) =>
    request<PeriodReportArchive>("/reports/period/generate", {
      method: "POST",
      body: JSON.stringify({ endDate, period })
    })
};

export function buildPeriodInsightReportQuery(query: PeriodInsightReportQuery): URLSearchParams {
  const params = new URLSearchParams({
    endDate: query.date,
    period: query.period ?? "weekly"
  });
  if (query.includeAiSummary) {
    params.set("includeAiSummary", "true");
  }
  return params;
}

export function buildDailyReportExcelUrl(date: string, baseUrl = import.meta.env.VITE_API_BASE?.trim() || "/api"): string {
  return buildReportDownloadUrl("daily.xlsx", date, baseUrl);
}

export function buildDailyReportMarkdownUrl(date: string, baseUrl = import.meta.env.VITE_API_BASE?.trim() || "/api"): string {
  return buildReportDownloadUrl("daily.md", date, baseUrl);
}

export function downloadDailyReportExcel(date: string): Promise<void> {
  return downloadReportFile(buildDailyReportExcelUrl(date), `amazon-monitor-${date}.xlsx`);
}

export function downloadDailyReportMarkdown(date: string): Promise<void> {
  return downloadReportFile(buildDailyReportMarkdownUrl(date), `operations-daily-${date}.md`);
}

export function downloadDailyReportPdf(date: string): Promise<void> {
  return downloadReportFile(buildReportDownloadUrl("daily.pdf", date, import.meta.env.VITE_API_BASE?.trim() || "/api"), `operations-daily-${date}.pdf`);
}

export function downloadPeriodReportMarkdown(endDate: string, period: WorkflowReportPeriod): Promise<void> {
  return downloadPeriodReportFile(endDate, period, "md");
}

export function downloadPeriodReportPdf(endDate: string, period: WorkflowReportPeriod): Promise<void> {
  return downloadPeriodReportFile(endDate, period, "pdf");
}

function downloadPeriodReportFile(
  endDate: string,
  period: WorkflowReportPeriod,
  extension: "md" | "pdf"
): Promise<void> {
  const params = new URLSearchParams({ endDate, period });
  const baseUrl = import.meta.env.VITE_API_BASE?.trim() || "/api";
  return downloadReportFile(
    `${baseUrl.replace(/\/+$/, "")}/reports/period.${extension}?${params.toString()}`,
    `operations-${period}-${endDate}.${extension}`
  );
}

function buildReportDownloadUrl(path: string, date: string, baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/reports/${path}?date=${encodeURIComponent(date)}`;
}

async function downloadReportFile(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem("amazon_monitor_auth_token");
  const response = await fetch(buildRequestUrl(url), {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("amazon_monitor_auth_token");
      window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
    }
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }
}
