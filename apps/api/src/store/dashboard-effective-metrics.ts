import type { DatabaseSync } from "node:sqlite";
import type { OwnedProductDailyMetric } from "@amazon-monitor/shared";

export interface EffectiveMarketplaceMetricRow {
  marketplace: string;
  currency: string | null;
  metric_date: string;
  metric_product_count: number;
  sales_amount: number | null;
  orders: number | null;
  ad_spend: number | null;
  ad_sales: number | null;
  average_acos: number | null;
  margin_numerator: number | null;
  margin_denominator: number | null;
  average_gross_margin: number | null;
}

interface ProductContextRow {
  id: number;
  marketplace: string;
  store_id: number | null;
}

interface StoreDailyRow {
  commerce_store_id: number;
  marketplace: string;
  business_date: string;
  currency: string;
  sales_amount: number | null;
  orders: number | null;
}

interface SkuCurrencyRow {
  product_id: number;
  metric_date: string;
  currency: string;
}

interface MetricAccumulator {
  marketplace: string;
  metricDate: string;
  productIds: Set<number>;
  currencies: Set<string>;
  salesAmount: number;
  hasSalesAmount: boolean;
  orders: number;
  hasOrders: boolean;
  adSpend: number;
  hasAdSpend: boolean;
  adSales: number;
  hasAdSales: boolean;
  acosTotal: number;
  acosCount: number;
  marginNumerator: number;
  marginDenominator: number;
  grossMarginTotal: number;
  grossMarginCount: number;
}

/**
 * Aggregates the same effective SKU metrics used by product/report surfaces.
 * Store-daily facts remain the higher-level sales authority for their store;
 * effective SKU rows still contribute coverage and non-sales planning fields.
 */
export function loadEffectiveMarketplaceMetricRows(
  db: DatabaseSync,
  orgId: number,
  startDate: string,
  endDate: string,
  metrics: OwnedProductDailyMetric[]
): EffectiveMarketplaceMetricRow[] {
  const products = loadProductContexts(db, orgId);
  const storeDaily = loadStoreDailyRows(db, orgId, startDate, endDate);
  const storeDailyKeys = new Set(storeDaily.map((row) => storeDailyKey(row.commerce_store_id, row.marketplace, row.business_date)));
  const skuCurrencies = loadSkuCurrencies(db, orgId, startDate, endDate);
  const groups = new Map<string, MetricAccumulator>();

  for (const row of storeDaily) {
    const group = getGroup(groups, row.marketplace, row.business_date);
    addCurrency(group, row.currency);
    addNullable(group, "salesAmount", row.sales_amount);
    addNullable(group, "orders", row.orders);
  }

  for (const metric of metrics) {
    const product = products.get(metric.productId);
    if (!product) continue;
    const group = getGroup(groups, product.marketplace, metric.date);
    group.productIds.add(metric.productId);
    const hasStoreDaily = product.store_id !== null
      && storeDailyKeys.has(storeDailyKey(product.store_id, product.marketplace, metric.date));
    if (!hasStoreDaily) {
      addCurrency(group, skuCurrencies.get(`${metric.productId}:${metric.date}`) ?? null);
      addNullable(group, "salesAmount", metric.salesAmount);
      addNullable(group, "orders", metric.orders);
      if (metric.salesAmount !== null && metric.grossMargin !== null) {
        group.marginNumerator += metric.salesAmount * metric.grossMargin;
        group.marginDenominator += metric.salesAmount;
      }
    }
    addNullable(group, "adSpend", metric.adSpend);
    addNullable(group, "adSales", metric.adSales);
    if (metric.acos !== null) {
      group.acosTotal += metric.acos;
      group.acosCount += 1;
    }
    if (!hasStoreDaily && metric.grossMargin !== null) {
      group.grossMarginTotal += metric.grossMargin;
      group.grossMarginCount += 1;
    }
  }

  return [...groups.values()]
    .map(toMetricRow)
    .sort((left, right) => left.marketplace.localeCompare(right.marketplace) || left.metric_date.localeCompare(right.metric_date));
}

function loadProductContexts(db: DatabaseSync, orgId: number): Map<number, ProductContextRow> {
  const rows = db.prepare(`
    SELECT id, marketplace, store_id
    FROM own_products
    WHERE org_id = ? AND status = 'active'
  `).all(orgId) as unknown as ProductContextRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

function loadStoreDailyRows(db: DatabaseSync, orgId: number, startDate: string, endDate: string): StoreDailyRow[] {
  return db.prepare(`
    SELECT commerce_store_id, marketplace, business_date, MIN(currency) AS currency,
           SUM(sales_amount) AS sales_amount, SUM(orders) AS orders
    FROM sp_api_sales_traffic_daily
    WHERE org_id = ? AND scope = 'store_daily' AND status = 'success'
      AND business_date BETWEEN ? AND ?
    GROUP BY commerce_store_id, marketplace, business_date
  `).all(orgId, startDate, endDate) as unknown as StoreDailyRow[];
}

function loadSkuCurrencies(db: DatabaseSync, orgId: number, startDate: string, endDate: string): Map<string, string> {
  const rows = db.prepare(`
    SELECT s.product_id, s.business_date AS metric_date, MAX(s.currency) AS currency
    FROM sp_api_sales_traffic_daily s
    JOIN own_products p ON p.id = s.product_id
    WHERE s.org_id = ? AND p.org_id = ? AND p.status = 'active'
      AND s.scope = 'sku_daily' AND s.status = 'success'
      AND s.business_date BETWEEN ? AND ?
    GROUP BY s.product_id, s.business_date
  `).all(orgId, orgId, startDate, endDate) as unknown as SkuCurrencyRow[];
  return new Map(rows.map((row) => [`${row.product_id}:${row.metric_date}`, row.currency]));
}

function getGroup(groups: Map<string, MetricAccumulator>, marketplace: string, metricDate: string): MetricAccumulator {
  const key = `${marketplace}:${metricDate}`;
  const existing = groups.get(key);
  if (existing) return existing;
  const group: MetricAccumulator = {
    marketplace,
    metricDate,
    productIds: new Set(),
    currencies: new Set(),
    salesAmount: 0,
    hasSalesAmount: false,
    orders: 0,
    hasOrders: false,
    adSpend: 0,
    hasAdSpend: false,
    adSales: 0,
    hasAdSales: false,
    acosTotal: 0,
    acosCount: 0,
    marginNumerator: 0,
    marginDenominator: 0,
    grossMarginTotal: 0,
    grossMarginCount: 0
  };
  groups.set(key, group);
  return group;
}

function addCurrency(group: MetricAccumulator, currency: string | null): void {
  if (currency) group.currencies.add(currency);
}

function addNullable(group: MetricAccumulator, field: "salesAmount" | "orders" | "adSpend" | "adSales", value: number | null): void {
  if (value === null) return;
  group[field] += value;
  group[`has${field[0].toUpperCase()}${field.slice(1)}` as "hasSalesAmount" | "hasOrders" | "hasAdSpend" | "hasAdSales"] = true;
}

function toMetricRow(group: MetricAccumulator): EffectiveMarketplaceMetricRow {
  return {
    marketplace: group.marketplace,
    currency: group.currencies.size === 1 ? [...group.currencies][0] : null,
    metric_date: group.metricDate,
    metric_product_count: group.productIds.size,
    sales_amount: group.hasSalesAmount ? group.salesAmount : null,
    orders: group.hasOrders ? group.orders : null,
    ad_spend: group.hasAdSpend ? group.adSpend : null,
    ad_sales: group.hasAdSales ? group.adSales : null,
    average_acos: group.acosCount > 0 ? group.acosTotal / group.acosCount : null,
    margin_numerator: group.marginDenominator > 0 ? group.marginNumerator : null,
    margin_denominator: group.marginDenominator > 0 ? group.marginDenominator : null,
    average_gross_margin: group.grossMarginCount > 0 ? group.grossMarginTotal / group.grossMarginCount : null
  };
}

function storeDailyKey(commerceStoreId: number, marketplace: string, date: string): string {
  return `${commerceStoreId}:${marketplace}:${date}`;
}
