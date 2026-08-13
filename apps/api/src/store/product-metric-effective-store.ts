import type {
  OwnedProductDailyMetric,
  OwnedProductDailyMetricField,
  OwnedProductDailyMetricFieldSource
} from "@amazon-monitor/shared";
import type { DatabaseSync } from "node:sqlite";

interface OverrideAuditRow {
  product_id?: number;
  field_name: string;
  restore_on_sp_api_success: number;
  created_at: string;
}

type OverrideAuditsByDate = Map<string, Map<string, OverrideAuditRow>>;
type OverrideAuditsByProduct = Map<number, OverrideAuditsByDate>;

export interface EffectiveProductMetricInput {
  productId: number;
  manualMetrics: OwnedProductDailyMetric[];
  spApiMetrics: OwnedProductDailyMetric[];
}

export const MAX_EFFECTIVE_METRIC_ROWS = 100_000;

export const SP_API_METRIC_FIELDS = [
  "sessions",
  "pageViews",
  "orders",
  "unitsSold",
  "salesAmount",
  "buyBoxPercentage",
  "conversionRate"
] as const satisfies readonly OwnedProductDailyMetricField[];

const ALL_METRIC_FIELDS = [
  ...SP_API_METRIC_FIELDS,
  "rating",
  "reviewCount",
  "bsrRank",
  "inventoryAvailable",
  "inventoryDays",
  "adSpend",
  "adSales",
  "acos",
  "tacos",
  "grossMargin",
  "keywordRank"
] as const satisfies readonly OwnedProductDailyMetricField[];

/**
 * Builds effective metrics without rewriting the legacy manual row or the
 * independent SP-API fact table. Sales & Traffic fields use successful
 * SP-API facts by default; an audited override can remain in effect until a
 * newer SP-API fact arrives when restoration is enabled.
 */
export function resolveEffectiveProductMetrics(
  db: DatabaseSync,
  productId: number,
  manualMetrics: OwnedProductDailyMetric[],
  spApiMetrics: OwnedProductDailyMetric[],
  limit = 30
): OwnedProductDailyMetric[] {
  return resolveEffectiveProductMetricsForProducts(db, [{ productId, manualMetrics, spApiMetrics }], limit)
    .get(productId) ?? [];
}

/** Resolves many products with one bounded override-audit read per query chunk. */
export function resolveEffectiveProductMetricsForProducts(
  db: DatabaseSync,
  inputs: readonly EffectiveProductMetricInput[],
  limit = 30,
  orgId?: number
): Map<number, OwnedProductDailyMetric[]> {
  const prepared = inputs.map((input) => {
    const manualByDate = new Map(input.manualMetrics.map((metric) => [metric.date, metric]));
    const spApiByDate = new Map(input.spApiMetrics.map((metric) => [metric.date, metric]));
    const dates = new Set([...manualByDate.keys(), ...spApiByDate.keys()]);
    return {
      ...input,
      manualByDate,
      spApiByDate,
      dates
    };
  });
  const auditKeys = new Map<string, OverrideAuditKey>();
  for (const input of prepared) {
    for (const date of input.dates) {
      if (input.manualByDate.has(date) && input.spApiByDate.has(date)) {
        auditKeys.set(`${input.productId}:${date}`, { productId: input.productId, effectiveDate: date });
      }
    }
  }
  const auditsByProduct = latestOverrideAudits(db, [...auditKeys.values()], orgId);
  const resolved = new Map<number, OwnedProductDailyMetric[]>();
  for (const input of prepared) {
    const auditsByDate = auditsByProduct.get(input.productId) ?? new Map();
    const effective = [...input.dates].map((date) => {
      const manual = input.manualByDate.get(date);
      const spApi = input.spApiByDate.get(date);
      if (!manual || !spApi) return manual ?? spApi!;
      return resolveMetricForDate(auditsByDate.get(date) ?? new Map(), manual, spApi);
    });
    resolved.set(input.productId, effective
      .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
      .slice(0, Math.max(1, Math.min(limit, MAX_EFFECTIVE_METRIC_ROWS))));
  }
  return resolved;
}

function resolveMetricForDate(
  audits: Map<string, OverrideAuditRow>,
  manual: OwnedProductDailyMetric,
  spApi: OwnedProductDailyMetric
): OwnedProductDailyMetric {
  const fieldSources: Partial<Record<OwnedProductDailyMetricField, OwnedProductDailyMetricFieldSource>> = {};
  const selectedSources = new Map<string, OwnedProductDailyMetricFieldSource>();
  const effective = { ...manual };
  for (const field of ALL_METRIC_FIELDS) {
    const override = audits.get(field);
    const overrideActive = override !== undefined
      && (override.restore_on_sp_api_success !== 1 || !isSpApiFactAfter(spApi.lastSyncedAt, override.created_at));
    const useSpApi = isSpApiMetricField(field) && !overrideActive;
    const selected = useSpApi ? spApi : manual;
    effective[field] = selected[field];
    const source = selected.fieldSources?.[field] ?? metricSource(selected);
    fieldSources[field] = source;
    selectedSources.set(field, source);
  }
  const populatedFields = ALL_METRIC_FIELDS.filter((field) => effective[field] !== null);
  const valueSources = new Set(
    populatedFields
      .map((field) => selectedSources.get(field)?.dataSource)
      .filter((source): source is string => source !== undefined)
  );
  const mixed = valueSources.size > 1;
  const freshnessSources = populatedFields.length > 0
    ? populatedFields.map((field) => selectedSources.get(field)!).filter(Boolean)
    : [...selectedSources.values()];
  effective.dataSource = mixed ? "mixed" : freshnessSources[0]?.dataSource ?? manual.dataSource;
  effective.lastSyncedAt = latestSyncedAt(freshnessSources);
  effective.syncStatus = mixed ? "partial" : (freshnessSources[0]?.syncStatus ?? manual.syncStatus);
  effective.syncError = freshnessSources.find((source) => source.syncError)?.syncError ?? null;
  if (mixed) effective.fieldSources = fieldSources;
  else delete effective.fieldSources;
  return effective;
}

function isSpApiMetricField(field: OwnedProductDailyMetricField): field is (typeof SP_API_METRIC_FIELDS)[number] {
  return (SP_API_METRIC_FIELDS as readonly string[]).includes(field);
}

interface OverrideAuditKey {
  productId: number;
  effectiveDate: string;
}

function latestOverrideAudits(
  db: DatabaseSync,
  keys: OverrideAuditKey[],
  orgId?: number
): OverrideAuditsByProduct {
  const latestByProduct: OverrideAuditsByProduct = new Map();
  for (let offset = 0; offset < keys.length; offset += 250) {
    const chunk = keys.slice(offset, offset + 250);
    const placeholders = chunk.map(() => "(?, ?)").join(", ");
    const params = chunk.flatMap((key) => [key.productId, key.effectiveDate]);
    const orgCondition = orgId === undefined ? "" : "org_id = ? AND ";
    const rows = db.prepare(`
      SELECT product_id, field_name, restore_on_sp_api_success, created_at, effective_date
      FROM data_source_override_audits
      WHERE ${orgCondition}domain = 'sales_traffic' AND (product_id, effective_date) IN (${placeholders})
      ORDER BY product_id ASC, effective_date ASC, created_at DESC, id DESC
    `).all(...(orgId === undefined ? params : [orgId, ...params])) as unknown as Array<OverrideAuditRow & { product_id: number; effective_date: string }>;
    for (const row of rows) {
      const productAudits = latestByProduct.get(row.product_id) ?? new Map();
      const audits = productAudits.get(row.effective_date) ?? new Map<string, OverrideAuditRow>();
      if (!audits.has(row.field_name)) audits.set(row.field_name, row);
      productAudits.set(row.effective_date, audits);
      latestByProduct.set(row.product_id, productAudits);
    }
  }
  return latestByProduct;
}

function isSpApiFactAfter(spApiSyncedAt: string | null, overrideCreatedAt: string): boolean {
  if (!spApiSyncedAt) return false;
  const spApiTime = Date.parse(spApiSyncedAt);
  const overrideTime = Date.parse(overrideCreatedAt);
  return Number.isFinite(spApiTime) && Number.isFinite(overrideTime) && spApiTime > overrideTime;
}

function metricSource(metric: OwnedProductDailyMetric): OwnedProductDailyMetricFieldSource {
  return {
    dataSource: metric.dataSource,
    lastSyncedAt: metric.lastSyncedAt,
    syncStatus: metric.syncStatus,
    syncError: metric.syncError
  };
}

function latestSyncedAt(sources: OwnedProductDailyMetricFieldSource[]): string | null {
  return sources
    .map((source) => source.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}
