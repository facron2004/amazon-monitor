import { gunzipSync } from "node:zlib";
import type { SpApiRegion } from "@amazon-monitor/shared";
import { retryAfterMsFromHeader, SpApiConnectorError } from "./sp-api-errors.js";
import type { SpApiFetch } from "./sp-api-lwa-client.js";

const REPORTS_PATH = "/reports/2021-06-30/reports";
const FBA_INVENTORY_PATH = "/fba/inventory/v1/summaries";
const MAX_FBA_PAGES = 1_000;

const endpoints: Record<SpApiRegion, string> = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
  FE: "https://sellingpartnerapi-fe.amazon.com"
};

const marketplaces = {
  US: { id: "ATVPDKIKX0DER", timeZone: "America/Los_Angeles" },
  UK: { id: "A1F83G8C2ARO7P", timeZone: "Europe/London" },
  DE: { id: "A1PA6795UKMFR9", timeZone: "Europe/Berlin" },
  JP: { id: "A1VC38T7YXB528", timeZone: "Asia/Tokyo" }
} as const;

export type SupportedMarketplaceCode = keyof typeof marketplaces;

export interface SpApiClientOptions {
  region: SpApiRegion;
  accessToken: string;
  request?: SpApiFetch;
  now?: () => Date;
  userAgent?: string;
  onUnauthorized?: () => Promise<string>;
}

export interface CreateSalesTrafficReportInput {
  marketplace: SupportedMarketplaceCode;
  fromDate: string;
  toDate: string;
  signal?: AbortSignal;
}

export interface SpApiReportStatus {
  processingStatus: string;
  reportDocumentId: string | null;
}

export interface SpApiFbaInventoryPage {
  inventorySummaries: unknown[];
  nextToken: string | null;
  pageNumber: number;
}

export interface ListFbaInventoryInput {
  marketplace: SupportedMarketplaceCode;
  startDateTime?: string | null;
  fullReconcile?: boolean;
  nextToken?: string | null;
  pageNumberOffset?: number;
  onPage?: (page: SpApiFbaInventoryPage) => Promise<void> | void;
  signal?: AbortSignal;
}

/**
 * Minimal private-app SP-API client. All calls use an LWA token in the
 * `x-amz-access-token` header; refresh credentials never leave the LWA client.
 */
export class SpApiClient {
  private readonly endpoint: string;
  private readonly request: SpApiFetch;
  private readonly now: () => Date;
  private readonly userAgent: string;
  private readonly onUnauthorized?: () => Promise<string>;
  private unauthorizedRefresh: Promise<string> | null = null;

  constructor(options: SpApiClientOptions) {
    this.endpoint = endpoints[options.region];
    this.request = options.request ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? (() => new Date());
    this.userAgent = options.userAgent ?? "AmazonMonitor/0.7 (Language=Node.js)";
    this.onUnauthorized = options.onUnauthorized;
    this.accessToken = options.accessToken;
  }

  private accessToken: string;

  async createSalesTrafficReport(input: CreateSalesTrafficReportInput): Promise<string> {
    assertDate(input.fromDate, "fromDate");
    assertDate(input.toDate, "toDate");
    const market = marketplaces[input.marketplace];
    if (!market) throw new SpApiConnectorError("marketplace_mismatch", "Unsupported SP-API marketplace", false);
    const payload = await this.apiJson(REPORTS_PATH, {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        reportType: "GET_SALES_AND_TRAFFIC_REPORT",
        marketplaceIds: [market.id],
        dataStartTime: marketplaceDayBoundary(input.fromDate, input.marketplace, false),
        dataEndTime: marketplaceDayBoundary(input.toDate, input.marketplace, true),
        reportOptions: { dateGranularity: "DAY", asinGranularity: "CHILD" }
      })
    });
    const reportId = text(payload.reportId);
    if (!reportId) throw new SpApiConnectorError("schema_invalid", "SP-API createReport response has no reportId", false);
    return reportId;
  }

  async getReportStatus(reportId: string, signal?: AbortSignal): Promise<SpApiReportStatus> {
    if (!reportId.trim()) throw new SpApiConnectorError("schema_invalid", "SP-API reportId is required", false);
    const payload = await this.apiJson(`${REPORTS_PATH}/${encodeURIComponent(reportId)}`, { signal });
    const processingStatus = text(payload.processingStatus);
    if (!processingStatus) throw new SpApiConnectorError("schema_invalid", "SP-API report response has no processingStatus", false);
    return { processingStatus, reportDocumentId: text(payload.reportDocumentId) };
  }

  async downloadJsonReportDocument(reportDocumentId: string, signal?: AbortSignal): Promise<unknown> {
    if (!reportDocumentId.trim()) {
      throw new SpApiConnectorError("schema_invalid", "SP-API reportDocumentId is required", false);
    }
    const details = await this.apiJson(
      `${REPORTS_PATH}/documents/${encodeURIComponent(reportDocumentId)}`,
      { signal }
    );
    const url = text(details.url);
    if (!url) throw new SpApiConnectorError("schema_invalid", "SP-API report document response has no URL", false);
    let documentUrl: URL;
    try {
      documentUrl = new URL(url);
    } catch {
      throw new SpApiConnectorError("schema_invalid", "SP-API report document URL is invalid", false);
    }
    if (documentUrl.protocol !== "https:") {
      throw new SpApiConnectorError("schema_invalid", "SP-API report document URL must use HTTPS", false);
    }

    let response: Response;
    try {
      response = await this.request(documentUrl, { signal });
    } catch (error) {
      throw requestError(error, "document_download_failed", "SP-API report document could not be downloaded");
    }
    if (!response.ok) {
      throw new SpApiConnectorError(
        "document_download_failed",
        "SP-API report document download failed",
        response.status >= 500 || response.status === 429,
        retryAfterMsFromHeader(response.headers.get("retry-after"), this.now().getTime())
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
      if (text(details.compressionAlgorithm) === "GZIP") bytes = gunzipSync(bytes);
    } catch {
      throw new SpApiConnectorError("document_download_failed", "SP-API report document could not be decoded", false);
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new SpApiConnectorError("schema_invalid", "SP-API report document is not valid JSON", false);
    }
  }

  async listFbaInventorySummaries(input: ListFbaInventoryInput): Promise<unknown> {
    const market = marketplaces[input.marketplace];
    if (!market) throw new SpApiConnectorError("marketplace_mismatch", "Unsupported SP-API marketplace", false);
    const summaries: unknown[] = [];
    let nextToken = text(input.nextToken);
    let pages = 0;
    const requestedPageNumberOffset = input.pageNumberOffset ?? 0;
    const pageNumberOffset = Number.isFinite(requestedPageNumberOffset)
      ? Math.max(0, Math.floor(requestedPageNumberOffset))
      : 0;
    do {
      if (pages >= MAX_FBA_PAGES) {
        throw new SpApiConnectorError("schema_invalid", "SP-API inventory pagination exceeded the safety limit", false);
      }
      const query = new URLSearchParams({
        details: "true",
        granularityType: "Marketplace",
        granularityId: market.id,
        marketplaceIds: market.id
      });
      if (!input.fullReconcile && input.startDateTime) query.set("startDateTime", input.startDateTime);
      if (nextToken) query.set("nextToken", nextToken);
      const response = await this.apiJson(`${FBA_INVENTORY_PATH}?${query.toString()}`, { signal: input.signal });
      const payload = record(response.payload ?? response, "FBA Inventory response");
      if (!Array.isArray(payload.inventorySummaries)) {
        throw new SpApiConnectorError("schema_invalid", "SP-API inventory response has no inventorySummaries", false);
      }
      const pageSummaries = payload.inventorySummaries;
      nextToken = text(payload.nextToken);
      pages += 1;
      if (input.onPage) {
        await input.onPage({
          inventorySummaries: pageSummaries,
          nextToken,
          pageNumber: pageNumberOffset + pages
        });
      } else {
        summaries.push(...pageSummaries);
      }
    } while (nextToken);
    return { payload: { inventorySummaries: summaries } };
  }

  private async apiJson(path: string, init: { method?: "GET" | "POST"; body?: string; signal?: AbortSignal }): Promise<Record<string, unknown>> {
    let refreshedAfterUnauthorized = false;
    while (true) {
      let response: Response;
      try {
        response = await this.request(new URL(path, this.endpoint), {
          method: init.method ?? "GET",
          signal: init.signal,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": this.userAgent,
            "x-amz-access-token": this.accessToken,
            "x-amz-date": amzDate(this.now())
          },
          body: init.body
        });
      } catch (error) {
        throw requestError(error, "network_timeout", "SP-API request could not be completed");
      }
      if (response.status === 401 && this.onUnauthorized && !refreshedAfterUnauthorized) {
        refreshedAfterUnauthorized = true;
        this.accessToken = await this.refreshAccessToken();
        continue;
      }
      if (!response.ok) throw responseError(response, this.now().getTime());
      try {
        return record(await response.json(), "SP-API response");
      } catch {
        throw new SpApiConnectorError("schema_invalid", "SP-API response is not valid JSON", false);
      }
    }
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.onUnauthorized) {
      throw new SpApiConnectorError("credentials_invalid", "SP-API access token was rejected", false);
    }
    if (!this.unauthorizedRefresh) {
      this.unauthorizedRefresh = this.onUnauthorized()
        .then((accessToken) => {
          const normalized = accessToken.trim();
          if (!normalized) {
            throw new SpApiConnectorError("credentials_invalid", "SP-API token refresh returned an empty token", false);
          }
          return normalized;
        })
        .finally(() => {
          this.unauthorizedRefresh = null;
        });
    }
    return this.unauthorizedRefresh;
  }
}

export function isSupportedMarketplaceCode(value: string): value is SupportedMarketplaceCode {
  return value in marketplaces;
}

export function marketplaceDayBoundary(date: string, marketplace: SupportedMarketplaceCode, endOfDay: boolean): string {
  assertDate(date, "date");
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  const offset = timeZoneOffsetMs(utcGuess, marketplaces[marketplace].timeZone);
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function responseError(response: Response, nowMs: number): SpApiConnectorError {
  const status = response.status;
  const retryAfterMs = status === 429 || status >= 500
    ? retryAfterMsFromHeader(response.headers.get("retry-after"), nowMs)
    : undefined;
  if (status === 401) return new SpApiConnectorError("credentials_invalid", "SP-API access token was rejected", false);
  if (status === 403) return new SpApiConnectorError("permission_missing", "SP-API permission is missing", false);
  if (status === 404) return new SpApiConnectorError("marketplace_mismatch", "SP-API resource was not found", false);
  if (status === 429) return new SpApiConnectorError("rate_limited", "SP-API is rate limited", true, retryAfterMs);
  if (status >= 500) return new SpApiConnectorError("amazon_5xx", "SP-API is temporarily unavailable", true, retryAfterMs);
  return new SpApiConnectorError("unknown", "SP-API request was rejected", false);
}

function requestError(error: unknown, category: "network_timeout" | "document_download_failed", message: string): SpApiConnectorError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new SpApiConnectorError("network_timeout", "SP-API request timed out", true);
  }
  return new SpApiConnectorError(category, message, true);
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset"
  }).formatToParts(date);
  const offset = formatted.find((part) => part.type === "timeZoneName")?.value;
  if (offset === "GMT") return 0;
  const match = offset?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new SpApiConnectorError("marketplace_mismatch", "SP-API marketplace time zone is invalid", false);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return minutes * 60_000 * (match[1] === "+" ? 1 : -1);
}

function assertDate(value: string, label: string): void {
  if (!isIsoCalendarDate(value)) {
    throw new SpApiConnectorError("schema_invalid", `SP-API ${label} must be YYYY-MM-DD`, false);
  }
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SpApiConnectorError("schema_invalid", `${label} must be an object`, false);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
