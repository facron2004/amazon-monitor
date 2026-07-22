import type {
  DataSourceConfig,
  DataSourceImportPayload,
  DataSourceImportError,
  DataSourceProductImportResult,
  UpsertOwnedProductDailyMetricInput
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  emptyToNull,
  finalizeDataSourceImport,
  isIsoDate
} from "./data-source-csv-import.js";
import { parseDataSourceImportRows } from "./data-source-tabular-import.js";

const REQUIRED_HEADERS = ["sku", "asin", "title", "date"] as const;
const INTEGER_FIELDS = [
  "sessions", "pageViews", "orders", "unitsSold", "reviewCount", "bsrRank",
  "inventoryAvailable", "keywordRank"
] as const;
const NUMBER_FIELDS = [
  ...INTEGER_FIELDS, "salesAmount", "buyBoxPercentage", "conversionRate", "rating",
  "inventoryDays", "adSpend", "adSales", "acos", "tacos", "grossMargin"
] as const;

type MetricField = (typeof NUMBER_FIELDS)[number];

interface ParsedProductRow {
  row: number;
  sku: string;
  asin: string;
  title: string;
  marketplace: string;
  date: string;
  brand?: string | null;
  category?: string | null;
  metrics: Partial<Record<MetricField, number | null>>;
}

export async function importDataSourceProducts(
  store: Store,
  source: DataSourceConfig,
  input: DataSourceImportPayload
): Promise<DataSourceProductImportResult> {
  const requiredHeaders = source.marketplace ? REQUIRED_HEADERS : [...REQUIRED_HEADERS, "marketplace"];
  const rows = await parseDataSourceImportRows(input, requiredHeaders);
  const validRows: ParsedProductRow[] = [];
  const errors: DataSourceImportError[] = [];

  for (const row of rows) {
    const parsed = validateRow(row.row, row.values, source.marketplace);
    if ("message" in parsed) errors.push(parsed);
    else validRows.push(parsed);
  }

  let createdProducts = 0;
  let updatedProducts = 0;
  const syncedAt = new Date().toISOString();
  store.runInTransaction(() => {
    for (const row of validRows) {
      let product = store.getProductBySku(source.orgId, row.marketplace, row.sku);
      if (product) {
        product = store.updateProduct(product.id, {
          asin: row.asin,
          title: row.title,
          ...(row.brand !== undefined ? { brand: row.brand } : {}),
          ...(row.category !== undefined ? { category: row.category } : {}),
          dataSource: source.name,
          lastSyncedAt: syncedAt,
          syncStatus: "success",
          syncError: null
        });
        updatedProducts += 1;
      } else {
        product = store.createProduct({
          orgId: source.orgId,
          marketplace: row.marketplace,
          sku: row.sku,
          asin: row.asin,
          title: row.title,
          brand: row.brand ?? null,
          category: row.category ?? null,
          dataSource: source.name,
          lastSyncedAt: syncedAt,
          syncStatus: "success"
        });
        createdProducts += 1;
      }
      const existingMetric = store.listProductDailyMetrics(product.id, {
        startDate: row.date,
        endDate: row.date,
        limit: 1
      })[0];
      store.upsertProductDailyMetric({
        productId: product.id,
        date: row.date,
        ...(existingMetric ? metricValues(existingMetric) : {}),
        ...row.metrics,
        dataSource: source.name,
        lastSyncedAt: syncedAt,
        syncStatus: "success",
        syncError: null
      } satisfies UpsertOwnedProductDailyMetricInput);
    }
  });

  const importedRows = validRows.length;
  const updatedSource = finalizeDataSourceImport(store, source, syncedAt, importedRows, errors);

  return {
    source: updatedSource,
    totalRows: rows.length,
    importedRows,
    failedRows: errors.length,
    createdProducts,
    updatedProducts,
    errors: errors.slice(0, 20)
  };
}

function metricValues(metric: UpsertOwnedProductDailyMetricInput): Partial<UpsertOwnedProductDailyMetricInput> {
  return {
    sessions: metric.sessions,
    pageViews: metric.pageViews,
    orders: metric.orders,
    unitsSold: metric.unitsSold,
    salesAmount: metric.salesAmount,
    buyBoxPercentage: metric.buyBoxPercentage,
    conversionRate: metric.conversionRate,
    rating: metric.rating,
    reviewCount: metric.reviewCount,
    bsrRank: metric.bsrRank,
    inventoryAvailable: metric.inventoryAvailable,
    inventoryDays: metric.inventoryDays,
    adSpend: metric.adSpend,
    adSales: metric.adSales,
    acos: metric.acos,
    tacos: metric.tacos,
    grossMargin: metric.grossMargin,
    keywordRank: metric.keywordRank
  };
}

function validateRow(
  row: number,
  values: Record<string, string>,
  fallbackMarketplace: string | null
): ParsedProductRow | DataSourceImportError {
  const csvMarketplace = values.marketplace?.trim();
  const configuredMarketplace = fallbackMarketplace?.trim();
  if (configuredMarketplace && csvMarketplace && csvMarketplace !== configuredMarketplace) {
    return { row, message: `marketplace must match configured source ${configuredMarketplace}` };
  }
  const requiredValues = {
    sku: values.sku?.trim(),
    asin: values.asin?.trim(),
    title: values.title?.trim(),
    date: values.date?.trim(),
    marketplace: configuredMarketplace || csvMarketplace
  };
  const missing = Object.entries(requiredValues).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) return { row, message: `Missing values: ${missing.join(", ")}` };
  if (!isIsoDate(requiredValues.date ?? "")) {
    return { row, message: "date must use YYYY-MM-DD" };
  }

  const metrics: Partial<Record<MetricField, number | null>> = {};
  for (const field of NUMBER_FIELDS) {
    if (!(field in values)) continue;
    const raw = values[field]?.trim();
    if (!raw) {
      metrics[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return { row, message: `${field} must be a number` };
    if (INTEGER_FIELDS.includes(field as (typeof INTEGER_FIELDS)[number]) && !Number.isInteger(value)) {
      return { row, message: `${field} must be an integer` };
    }
    metrics[field] = value;
  }

  return {
    row,
    sku: requiredValues.sku!,
    asin: requiredValues.asin!,
    title: requiredValues.title!,
    marketplace: requiredValues.marketplace!,
    date: requiredValues.date!,
    ...(Object.hasOwn(values, "brand") ? { brand: emptyToNull(values.brand) } : {}),
    ...(Object.hasOwn(values, "category") ? { category: emptyToNull(values.category) } : {}),
    metrics
  };
}
