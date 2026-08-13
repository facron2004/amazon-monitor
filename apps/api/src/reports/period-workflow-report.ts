import {
  isoDateOffset,
  type AdDailyMetric,
  type DailyReportCoverageStatus,
  type OwnedProductDailyMetric,
  type OwnedProductListItem,
  type PeriodReportArchive,
  type PeriodReportCoverage,
  type ProductListingHealthItem,
  type ReviewVocSummary,
  type Task,
  type WorkflowReportPeriod
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { buildPeriodInsightReport, type PeriodInsightReport } from "./period-insight-report.js";
import { buildPeriodWorkflowMarkdown } from "./period-workflow-report-formatter.js";

const periodDays: Record<WorkflowReportPeriod, number> = {
  weekly: 7,
  monthly: 30
};

interface GeneratePeriodWorkflowReportInput {
  orgId: number;
  period: WorkflowReportPeriod;
  endDate: string;
  generatedBy: number;
}

export interface MarketplacePerformance {
  marketplace: string;
  sales: number;
  previousSales: number;
  orders: number;
  grossProfit: number | null;
  previousGrossProfit: number | null;
  topSkus: Array<{ sku: string; sales: number; grossProfit: number | null }>;
}

export interface MarketplaceAdsPerformance {
  marketplace: string;
  spend: number;
  sales: number;
  acos: number | null;
  previousSpend: number;
  previousSales: number;
  previousAcos: number | null;
}

export interface PeriodWorkflowEvidence {
  products: OwnedProductListItem[];
  performance: MarketplacePerformance[];
  ads: MarketplaceAdsPerformance[];
  unassignedAdsCount: number;
  listingItems: ProductListingHealthItem[];
  reviewSummaries: ReviewVocSummary[];
  completedTasks: Task[];
  insightReport: PeriodInsightReport;
  coverage: PeriodReportCoverage;
}

export function generatePeriodWorkflowReport(
  store: Store,
  input: GeneratePeriodWorkflowReportInput
): PeriodReportArchive {
  const days = periodDays[input.period];
  const startDate = isoDateOffset(input.endDate, -(days - 1));
  const previousEndDate = isoDateOffset(startDate, -1);
  const previousStartDate = isoDateOffset(previousEndDate, -(days - 1));
  const evidence = collectEvidence(store, input, {
    startDate,
    previousStartDate,
    previousEndDate
  });
  const coverageStatus = resolvePeriodReportCoverageStatus(evidence.coverage);

  return store.savePeriodReportArchive({
    orgId: input.orgId,
    period: input.period,
    startDate,
    endDate: input.endDate,
    markdown: buildPeriodWorkflowMarkdown(input.period, startDate, input.endDate, evidence, coverageStatus),
    coverageStatus,
    coverage: evidence.coverage,
    salesMarketplaceCount: evidence.performance.length,
    insightCount: evidence.insightReport.summary.totalEvents,
    completedTaskCount: evidence.completedTasks.length,
    generatedBy: input.generatedBy
  });
}

function collectEvidence(
  store: Store,
  input: GeneratePeriodWorkflowReportInput,
  dates: { startDate: string; previousStartDate: string; previousEndDate: string }
): PeriodWorkflowEvidence {
  const products = store.listProducts({ orgId: input.orgId, status: "active", date: input.endDate, limit: 1000 });
  const productById = new Map(products.map((product) => [product.id, product]));
  const allMetrics = collectProductMetrics(
    store,
    input.orgId,
    dates.previousStartDate,
    input.endDate
  );
  const currentMetrics = allMetrics.filter((metric) => metric.date >= dates.startDate);
  const previousMetrics = allMetrics.filter((metric) => metric.date <= dates.previousEndDate);
  const allAds = collectAdsMetrics(store, input.orgId, dates.previousStartDate, input.endDate);
  const currentAds = allAds.filter((metric) => metric.date >= dates.startDate);
  const previousAds = allAds.filter((metric) => metric.date <= dates.previousEndDate);
  const listingItems = store.listProductListingHealth({
    orgId: input.orgId,
    date: input.endDate,
    limit: 1000
  });
  const reviewSummaries = store.listReviewVocSummaries({
    orgId: input.orgId,
    startDate: dates.startDate,
    endDate: input.endDate,
    limit: 1000
  });
  const completedTasks = store.listTasks({ orgId: input.orgId, limit: 1000 })
    .filter((task) => timestampDate(task.reviewedAt ?? task.completedAt) >= dates.startDate
      && timestampDate(task.reviewedAt ?? task.completedAt) <= input.endDate)
    .sort((left, right) => (right.reviewedAt ?? right.completedAt ?? "").localeCompare(
      left.reviewedAt ?? left.completedAt ?? ""
    ));
  const insightReport = buildPeriodInsightReport(store, {
    orgId: input.orgId,
    endDate: input.endDate,
    period: input.period
  });
  const performance = buildMarketplacePerformance(products, currentMetrics, previousMetrics);
  const ads = buildMarketplaceAdsPerformance(productById, currentAds, previousAds);

  return {
    products,
    performance,
    ads,
    unassignedAdsCount: currentAds.filter((metric) => !productById.has(metric.productId ?? -1)).length,
    listingItems,
    reviewSummaries,
    completedTasks,
    insightReport,
    coverage: {
      productMetrics: currentMetrics.length,
      marketplaces: performance.length,
      insightEvents: insightReport.summary.totalEvents,
      adsMetrics: currentAds.length,
      listingHealthItems: listingItems.filter((item) => item.snapshotId !== null).length,
      reviews: reviewSummaries.reduce((sum, summary) => sum + summary.reviewCount, 0),
      completedTasks: completedTasks.length
    }
  };
}

function buildMarketplacePerformance(
  products: OwnedProductListItem[],
  currentMetrics: OwnedProductDailyMetric[],
  previousMetrics: OwnedProductDailyMetric[]
): MarketplacePerformance[] {
  const marketplaces = [...new Set(products.map((product) => product.marketplace))].sort();
  return marketplaces.map((marketplace) => {
    const productIds = new Set(products.filter((product) => product.marketplace === marketplace).map((product) => product.id));
    const current = currentMetrics.filter((metric) => productIds.has(metric.productId));
    const previous = previousMetrics.filter((metric) => productIds.has(metric.productId));
    const skuRows = products
      .filter((product) => product.marketplace === marketplace)
      .map((product) => {
        const metrics = current.filter((metric) => metric.productId === product.id);
        return {
          sku: product.sku,
          sales: sum(metrics.map((metric) => metric.salesAmount)),
          grossProfit: sumProfit(metrics)
        };
      })
      .sort((left, right) => right.sales - left.sales || left.sku.localeCompare(right.sku))
      .slice(0, 5);
    return {
      marketplace,
      sales: sum(current.map((metric) => metric.salesAmount)),
      previousSales: sum(previous.map((metric) => metric.salesAmount)),
      orders: sum(current.map((metric) => metric.orders)),
      grossProfit: sumProfit(current),
      previousGrossProfit: sumProfit(previous),
      topSkus: skuRows
    };
  }).filter((item) => item.sales > 0 || item.previousSales > 0 || item.topSkus.some((sku) => sku.grossProfit !== null));
}

function buildMarketplaceAdsPerformance(
  productById: Map<number, OwnedProductListItem>,
  currentMetrics: AdDailyMetric[],
  previousMetrics: AdDailyMetric[]
): MarketplaceAdsPerformance[] {
  const marketplaces = [...new Set(
    [...currentMetrics, ...previousMetrics]
      .map((metric) => metric.productId === null ? null : productById.get(metric.productId)?.marketplace ?? null)
      .filter((marketplace): marketplace is string => marketplace !== null)
  )].sort();
  return marketplaces.map((marketplace) => {
    const current = currentMetrics.filter((metric) => metric.productId !== null
      && productById.get(metric.productId)?.marketplace === marketplace);
    const previous = previousMetrics.filter((metric) => metric.productId !== null
      && productById.get(metric.productId)?.marketplace === marketplace);
    const spend = sum(current.map((metric) => metric.spend));
    const sales = sum(current.map((metric) => metric.sales));
    const previousSpend = sum(previous.map((metric) => metric.spend));
    const previousSales = sum(previous.map((metric) => metric.sales));
    return {
      marketplace,
      spend,
      sales,
      acos: ratio(spend, sales),
      previousSpend,
      previousSales,
      previousAcos: ratio(previousSpend, previousSales)
    };
  });
}

export function resolvePeriodReportCoverageStatus(coverage: PeriodReportCoverage): DailyReportCoverageStatus {
  const values = Object.values(coverage);
  if (values.every((value) => value === 0)) return "empty";
  const coreFeeds = [
    coverage.productMetrics,
    coverage.adsMetrics,
    coverage.listingHealthItems,
    coverage.reviews
  ];
  return coreFeeds.every((value) => value > 0) ? "complete" : "partial";
}

function collectProductMetrics(
  store: Store,
  orgId: number,
  startDate: string,
  endDate: string
): OwnedProductDailyMetric[] {
  return collectPages((offset) => store.listOrganizationProductDailyMetrics(orgId, {
    startDate,
    endDate,
    limit: 1000,
    offset
  }));
}

function collectAdsMetrics(store: Store, orgId: number, startDate: string, endDate: string): AdDailyMetric[] {
  return collectPages((offset) => store.listAdDailyMetrics({
    orgId,
    startDate,
    endDate,
    limit: 1000,
    offset
  }));
}

function collectPages<T>(loadPage: (offset: number) => T[]): T[] {
  const items: T[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const page = loadPage(offset);
    items.push(...page);
    if (page.length < 1000) break;
  }
  return items;
}

function sum(values: Array<number | null>): number {
  return Math.round(values.reduce<number>((total, value) => total + (value ?? 0), 0) * 100) / 100;
}

function sumProfit(metrics: OwnedProductDailyMetric[]): number | null {
  const values = metrics
    .filter((metric) => metric.salesAmount !== null && metric.grossMargin !== null)
    .map((metric) => (metric.salesAmount ?? 0) * (metric.grossMargin ?? 0));
  return values.length > 0 ? sum(values) : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function timestampDate(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}
