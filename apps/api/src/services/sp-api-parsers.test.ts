import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpApiInventorySummaries } from "./sp-api-inventory-parser.js";
import { parseSpApiSalesTrafficReport } from "./sp-api-sales-traffic-parser.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("SP-API fixture parsers", () => {
  it("normalizes one-day Sales & Traffic totals and ASIN rows", () => {
    const parsed = parseSpApiSalesTrafficReport(readFixture("sp-api-sales-traffic.single-day.json"));

    expect(parsed.storeDaily).toEqual([
      expect.objectContaining({
        businessDate: "2026-07-27",
        sourceAsin: null,
        salesAmount: 120.5,
        currency: "USD",
        orders: 3,
        sessions: 70
      })
    ]);
    expect(parsed.asinDaily).toEqual([
      expect.objectContaining({
        businessDate: "2026-07-27",
        sourceAsin: "B0FIXTURE01",
        unitsSold: 4,
        conversionRate: 5.7
      })
    ]);
  });

  it("normalizes inventory quantities and derives inbound total from components", () => {
    const parsed = parseSpApiInventorySummaries(readFixture("sp-api-inventory.page.json"));

    expect(parsed).toEqual([
      expect.objectContaining({
        sellerSku: "FIXTURE-SKU-1",
        sourceAsin: "B0FIXTURE01",
        inboundQuantity: 12,
        fulfillableQuantity: 8,
        totalQuantity: 23
      })
    ]);
  });
});

function readFixture(fileName: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDirectory, fileName), "utf8")) as unknown;
}
