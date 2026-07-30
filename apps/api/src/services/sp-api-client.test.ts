import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { SpApiConnectorError } from "./sp-api-errors.js";
import { marketplaceDayBoundary, SpApiClient } from "./sp-api-client.js";

describe("SP-API HTTP client", () => {
  it("requests a Sales & Traffic report with private-app headers and marketplace-local dates", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ reportId: "report-123" }, 202));
    const client = new SpApiClient({
      region: "NA",
      accessToken: "access-token",
      request,
      now: () => new Date("2026-07-28T08:00:00.000Z")
    });

    await expect(client.createSalesTrafficReport({
      marketplace: "US",
      fromDate: "2026-07-27",
      toDate: "2026-07-27"
    })).resolves.toBe("report-123");

    const [url, init] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports");
    expect(init.headers).toMatchObject({
      "User-Agent": "AmazonMonitor/0.7 (Language=Node.js)",
      "x-amz-access-token": "access-token",
      "x-amz-date": "20260728T080000Z"
    });
    expect(JSON.parse(String(init.body))).toEqual({
      reportType: "GET_SALES_AND_TRAFFIC_REPORT",
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-07-27T07:00:00.000Z",
      dataEndTime: "2026-07-28T06:59:59.999Z",
      reportOptions: { dateGranularity: "DAY", asinGranularity: "CHILD" }
    });
  });

  it("downloads and decodes a gzip report document without passing the LWA token to its pre-signed URL", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ url: "https://example.s3.amazonaws.com/report", compressionAlgorithm: "GZIP" }))
      .mockResolvedValueOnce(new Response(gzipSync(JSON.stringify({ salesAndTrafficByDate: [] }))));
    const client = new SpApiClient({ region: "NA", accessToken: "secret-token", request });

    await expect(client.downloadJsonReportDocument("document-1")).resolves.toEqual({ salesAndTrafficByDate: [] });

    expect(request.mock.calls[1][0]).toEqual(new URL("https://example.s3.amazonaws.com/report"));
    expect(request.mock.calls[1][1]).toEqual({ signal: undefined });
    expect(JSON.stringify(request.mock.calls[1])).not.toContain("secret-token");
  });

  it("preserves startDateTime on every FBA inventory page", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ payload: { inventorySummaries: [{ sellerSku: "A" }], nextToken: "next-token" } }))
      .mockResolvedValueOnce(jsonResponse({ payload: { inventorySummaries: [{ sellerSku: "B" }] } }));
    const client = new SpApiClient({ region: "EU", accessToken: "access-token", request });

    await expect(client.listFbaInventorySummaries({
      marketplace: "DE",
      startDateTime: "2026-07-28T00:00:00.000Z"
    })).resolves.toEqual({ payload: { inventorySummaries: [{ sellerSku: "A" }, { sellerSku: "B" }] } });

    const first = new URL(request.mock.calls[0][0] as URL);
    const second = new URL(request.mock.calls[1][0] as URL);
    expect(first.searchParams.get("marketplaceIds")).toBe("A1PA6795UKMFR9");
    expect(first.searchParams.get("startDateTime")).toBe("2026-07-28T00:00:00.000Z");
    expect(second.searchParams.get("nextToken")).toBe("next-token");
    expect(second.searchParams.get("startDateTime")).toBe("2026-07-28T00:00:00.000Z");
  });

  it("classifies permission and rate-limit responses without exposing response bodies", async () => {
    const permissionClient = new SpApiClient({
      region: "NA",
      accessToken: "access-token",
      request: vi.fn().mockResolvedValue(new Response("secret body", { status: 403 }))
    });
    await expect(permissionClient.getReportStatus("report-1")).rejects.toMatchObject<Partial<SpApiConnectorError>>({
      category: "permission_missing",
      retryable: false
    });

    const rateLimitedClient = new SpApiClient({
      region: "NA",
      accessToken: "access-token",
      request: vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    });
    await expect(rateLimitedClient.getReportStatus("report-1")).rejects.toMatchObject<Partial<SpApiConnectorError>>({
      category: "rate_limited",
      retryable: true
    });
  });

  it("converts local marketplace dates across time zones", () => {
    expect(marketplaceDayBoundary("2026-07-27", "DE", false)).toBe("2026-07-26T22:00:00.000Z");
    expect(marketplaceDayBoundary("2026-07-27", "JP", true)).toBe("2026-07-27T14:59:59.999Z");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
