import type {
  AdDailyMetric,
  DataSourceAdsImportResult,
  DataSourceConfig,
  DataSourceImportPayload,
  DataSourceImportError,
  UpsertAdDailyMetricInput
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  emptyToNull,
  finalizeDataSourceImport,
  isIsoDate
} from "./data-source-csv-import.js";
import { parseDataSourceImportRows } from "./data-source-tabular-import.js";

const REQUIRED_HEADERS = ["date", "campaignId", "campaignName"] as const;
const INTEGER_FIELDS = ["impressions", "clicks", "orders", "unitsSold"] as const;
const NUMBER_FIELDS = [
  ...INTEGER_FIELDS,
  "spend", "sales", "acos", "roas", "cpc", "ctr", "cvr", "budget", "budgetUsageRate"
] as const;
const RATE_FIELDS = ["acos", "ctr", "cvr", "budgetUsageRate"] as const;

type NumberField = (typeof NUMBER_FIELDS)[number];

interface ParsedAdsRow {
  row: number;
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  targetText: string;
  searchTerm: string;
  productId?: number | null;
  matchType?: string | null;
  metrics: Partial<Record<NumberField, number | null>>;
}

export async function importDataSourceAds(
  store: Store,
  source: DataSourceConfig,
  input: DataSourceImportPayload
): Promise<DataSourceAdsImportResult> {
  const rows = await parseDataSourceImportRows(input, REQUIRED_HEADERS);
  const validRows: ParsedAdsRow[] = [];
  const errors: DataSourceImportError[] = [];
  for (const row of rows) {
    const parsed = validateRow(store, source, row.row, row.values);
    if ("message" in parsed) errors.push(parsed);
    else validRows.push(parsed);
  }

  let createdMetrics = 0;
  let updatedMetrics = 0;
  const syncedAt = new Date().toISOString();
  store.runInTransaction(() => {
    for (const row of validRows) {
      const identity = {
        orgId: source.orgId,
        date: row.date,
        campaignId: row.campaignId,
        adGroupName: row.adGroupName,
        targetText: row.targetText,
        searchTerm: row.searchTerm
      };
      const existing = store.getAdDailyMetricByIdentity(identity);
      store.upsertAdDailyMetric({
        ...identity,
        campaignName: row.campaignName,
        ...(existing ? metricValues(existing) : {}),
        ...(row.productId !== undefined ? { productId: row.productId } : {}),
        ...(row.matchType !== undefined ? { matchType: row.matchType } : {}),
        ...row.metrics,
        dataSource: source.name,
        lastSyncedAt: syncedAt,
        syncStatus: "success",
        syncError: null
      });
      if (existing) updatedMetrics += 1;
      else createdMetrics += 1;
    }
  });

  const importedRows = validRows.length;
  return {
    source: finalizeDataSourceImport(store, source, syncedAt, importedRows, errors),
    totalRows: rows.length,
    importedRows,
    failedRows: errors.length,
    createdMetrics,
    updatedMetrics,
    errors: errors.slice(0, 20)
  };
}

function validateRow(
  store: Store,
  source: DataSourceConfig,
  row: number,
  values: Record<string, string>
): ParsedAdsRow | DataSourceImportError {
  const date = values.date?.trim();
  const campaignId = values.campaignId?.trim();
  const campaignName = values.campaignName?.trim();
  const missing = Object.entries({ date, campaignId, campaignName })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) return { row, message: `Missing values: ${missing.join(", ")}` };
  if (!isIsoDate(date ?? "")) return { row, message: "date must use YYYY-MM-DD" };

  const csvMarketplace = values.marketplace?.trim();
  const configuredMarketplace = source.marketplace?.trim();
  if (configuredMarketplace && csvMarketplace && configuredMarketplace !== csvMarketplace) {
    return { row, message: `marketplace must match configured source ${configuredMarketplace}` };
  }
  const productResult = resolveProductId(store, source.orgId, values, configuredMarketplace || csvMarketplace);
  if ("message" in productResult) return { row, message: productResult.message };

  const metrics: Partial<Record<NumberField, number | null>> = {};
  for (const field of NUMBER_FIELDS) {
    if (!Object.hasOwn(values, field)) continue;
    const parsed = parseNumber(field, values[field]);
    if (typeof parsed === "string") return { row, message: parsed };
    metrics[field] = parsed;
  }

  return {
    row,
    date: date!,
    campaignId: campaignId!,
    campaignName: campaignName!,
    adGroupName: values.adGroupName?.trim() ?? "",
    targetText: values.targetText?.trim() ?? "",
    searchTerm: values.searchTerm?.trim() ?? "",
    ...productResult,
    ...(Object.hasOwn(values, "matchType") ? { matchType: emptyToNull(values.matchType) } : {}),
    metrics
  };
}

function resolveProductId(
  store: Store,
  orgId: number,
  values: Record<string, string>,
  marketplace: string | undefined
): { productId?: number | null } | { message: string } {
  if (!Object.hasOwn(values, "sku")) return {};
  const sku = values.sku?.trim();
  if (!sku) return { productId: null };
  if (!marketplace) return { message: "marketplace is required when sku is provided" };
  const product = store.getProductBySku(orgId, marketplace, sku);
  return product ? { productId: product.id } : { message: `product not found for sku ${sku} in ${marketplace}` };
}

function parseNumber(field: NumberField, rawValue: string | undefined): number | null | string {
  const raw = rawValue?.trim();
  if (!raw) return null;
  const isPercent = raw.endsWith("%");
  const value = Number(isPercent ? raw.slice(0, -1).trim() : raw);
  if (!Number.isFinite(value) || value < 0) return `${field} must be a non-negative number`;
  if (INTEGER_FIELDS.includes(field as (typeof INTEGER_FIELDS)[number]) && !Number.isInteger(value)) {
    return `${field} must be a non-negative integer`;
  }
  if (isPercent && !RATE_FIELDS.includes(field as (typeof RATE_FIELDS)[number])) {
    return `${field} does not accept percentage values`;
  }
  return isPercent ? value / 100 : value;
}

function metricValues(metric: AdDailyMetric): Partial<UpsertAdDailyMetricInput> {
  return {
    productId: metric.productId,
    matchType: metric.matchType,
    impressions: metric.impressions,
    clicks: metric.clicks,
    spend: metric.spend,
    sales: metric.sales,
    orders: metric.orders,
    unitsSold: metric.unitsSold,
    acos: metric.acos,
    roas: metric.roas,
    cpc: metric.cpc,
    ctr: metric.ctr,
    cvr: metric.cvr,
    budget: metric.budget,
    budgetUsageRate: metric.budgetUsageRate
  };
}
