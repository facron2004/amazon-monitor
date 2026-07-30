export interface ParsedSalesTrafficRow {
  businessDate: string;
  sourceAsin: string | null;
  salesAmount: number;
  currency: string;
  orders: number | null;
  unitsSold: number | null;
  sessions: number | null;
  pageViews: number | null;
  buyBoxPercentage: number | null;
  conversionRate: number | null;
}

export interface ParsedSalesTrafficReport {
  storeDaily: ParsedSalesTrafficRow[];
  asinDaily: ParsedSalesTrafficRow[];
}

export function parseSpApiSalesTrafficReport(document: unknown): ParsedSalesTrafficReport {
  const root = record(document, "Sales & Traffic report");
  const storeDaily = array(root.salesAndTrafficByDate, "salesAndTrafficByDate").map((item) => parseDateRow(record(item, "salesAndTrafficByDate row")));
  if (storeDaily.length === 0) {
    throw new Error("Sales & Traffic report contains no daily totals");
  }
  const defaultAsinDate = storeDaily.length === 1 ? storeDaily[0].businessDate : null;
  const asinDaily = array(root.salesAndTrafficByAsin, "salesAndTrafficByAsin").map((item) => parseAsinRow(record(item, "salesAndTrafficByAsin row"), defaultAsinDate));
  return { storeDaily, asinDaily };
}

function parseDateRow(row: Record<string, unknown>): ParsedSalesTrafficRow {
  const sales = record(row.salesByDate, "salesByDate");
  const traffic = record(row.trafficByDate, "trafficByDate");
  return buildRow(
    requiredDate(row.date),
    null,
    sales,
    traffic,
    ["totalOrderItems", "orders"],
    ["unitsOrdered", "unitsSold"],
    ["sessions", "browserSessions"],
    ["pageViews", "browserPageViews"]
  );
}

function parseAsinRow(row: Record<string, unknown>, defaultBusinessDate: string | null): ParsedSalesTrafficRow {
  const sales = record(row.salesByAsin, "salesByAsin");
  const traffic = record(row.trafficByAsin, "trafficByAsin");
  const asin = optionalText(row.childAsin) ?? optionalText(row.parentAsin);
  if (!asin) throw new Error("Sales & Traffic ASIN row is missing childAsin");
  const businessDate = optionalText(row.date) ?? defaultBusinessDate;
  if (!businessDate) throw new Error("Sales & Traffic ASIN row is missing date");
  return buildRow(
    requiredDate(businessDate),
    asin,
    sales,
    traffic,
    ["totalOrderItems", "orders"],
    ["unitsOrdered", "unitsSold"],
    ["sessions", "browserSessions"],
    ["pageViews", "browserPageViews"]
  );
}

function buildRow(
  businessDate: string,
  sourceAsin: string | null,
  sales: Record<string, unknown>,
  traffic: Record<string, unknown>,
  orderKeys: string[],
  unitKeys: string[],
  sessionKeys: string[],
  pageViewKeys: string[]
): ParsedSalesTrafficRow {
  const amount = money(sales.orderedProductSales, "orderedProductSales");
  return {
    businessDate,
    sourceAsin,
    salesAmount: amount.amount,
    currency: amount.currency,
    orders: optionalNumber(sales, orderKeys),
    unitsSold: optionalNumber(sales, unitKeys),
    sessions: optionalNumber(traffic, sessionKeys),
    pageViews: optionalNumber(traffic, pageViewKeys),
    buyBoxPercentage: optionalNumber(traffic, ["buyBoxPercentage"]),
    conversionRate: optionalNumber(traffic, ["unitSessionPercentage", "conversionRate"])
  };
}

function money(value: unknown, label: string): { amount: number; currency: string } {
  const item = record(value, label);
  const amount = number(item.amount, `${label}.amount`);
  const currency = optionalText(item.currencyCode)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`${label}.currencyCode must be an ISO 4217 code`);
  }
  return { amount, currency };
}

function optionalNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (source[key] === undefined || source[key] === null) continue;
    return number(source[key], key);
  }
  return null;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function requiredDate(value: unknown): string {
  const date = optionalText(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Sales & Traffic date must be YYYY-MM-DD");
  }
  return date;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
