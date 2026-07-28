import {
  hasBusinessCapability,
  isoDate,
  type AiRun,
  type OwnedProductDailyMetric,
  type OwnedProductDetail,
  type OwnedProductOperationsDetail,
  type ProductOperationsAccessLevel,
  type ProductOperationsAgentRun,
  type ProductOperationsCompetitor,
  type UserRole,
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { toAdsFull, toAdsSummary, toProfitSummary } from "./domain-access.js";

interface ProductOperationsInput {
  productId: number;
  orgId: number;
  role: UserRole;
  date?: string;
}

export function buildProductOperationsDetail(
  store: Store,
  input: ProductOperationsInput,
): OwnedProductOperationsDetail | null {
  const product = store.getProductDetail(input.productId, input.date);
  if (!product || product.orgId !== input.orgId) return null;

  const asOfDate = input.date ?? product.latestMetric?.date ?? isoDate();
  const access = {
    ads: accessLevel(input.role, "view_ads", "view_ads_details"),
    profit: accessLevel(input.role, "view_profit", "view_profit_details"),
  };
  const tasks = store.listTasks({
    orgId: input.orgId,
    relatedAsin: product.asin,
    limit: 1000,
  });

  return {
    asOfDate,
    generatedAt: new Date().toISOString(),
    product: redactProductMetrics(product, access.ads, access.profit),
    access,
    ads: buildAdsSummary(store, input, asOfDate, access.ads),
    profit: buildProfitPlan(store, input, asOfDate, access.profit),
    inventory: store.getInventoryPlan(input.productId, {
      orgId: input.orgId,
      date: asOfDate,
    }),
    listingHealth: organizationValue(
      store.getProductListingHealth(input.productId, asOfDate),
      input.orgId,
    ),
    reviewVoc: store.getReviewVocSummary(input.productId, {
      orgId: input.orgId,
      date: asOfDate,
    }),
    competitors: relatedCompetitors(store, product, input.orgId),
    agentRuns: relatedAgentRuns(store, input, tasks),
    events: store
      .listInsightEvents({
        orgId: input.orgId,
        asin: product.asin,
        limit: 1000,
      })
      .filter((event) => event.eventDate <= asOfDate)
      .slice(0, 20),
    tasks,
  };
}

function accessLevel(
  role: UserRole,
  baseCapability: "view_ads" | "view_profit",
  detailCapability: "view_ads_details" | "view_profit_details",
): ProductOperationsAccessLevel {
  if (!hasBusinessCapability(role, baseCapability)) return "denied";
  return hasBusinessCapability(role, detailCapability) ? "full" : "summary";
}

function buildAdsSummary(
  store: Store,
  input: ProductOperationsInput,
  date: string,
  access: ProductOperationsAccessLevel,
) {
  if (access === "denied") return null;
  const summary = store.getAdsWorkflowSummary({
    orgId: input.orgId,
    productId: input.productId,
    date,
    limit: 1000,
  });
  return access === "full" ? toAdsFull(summary) : toAdsSummary(summary);
}

function buildProfitPlan(
  store: Store,
  input: ProductOperationsInput,
  date: string,
  access: ProductOperationsAccessLevel,
) {
  if (access === "denied") return null;
  const plan = store.getProfitPlan(input.productId, {
    orgId: input.orgId,
    date,
  });
  if (!plan) return null;
  return access === "full" ? plan : toProfitSummary(plan);
}

function redactProductMetrics(
  product: OwnedProductDetail,
  adsAccess: ProductOperationsAccessLevel,
  profitAccess: ProductOperationsAccessLevel,
): OwnedProductDetail {
  const redact = (metric: OwnedProductDailyMetric): OwnedProductDailyMetric => ({
    ...metric,
    adSpend: adsAccess === "full" ? metric.adSpend : null,
    adSales: adsAccess === "full" ? metric.adSales : null,
    acos: adsAccess === "denied" ? null : metric.acos,
    tacos: adsAccess === "denied" ? null : metric.tacos,
    grossMargin: profitAccess === "denied" ? null : metric.grossMargin,
  });
  return {
    ...product,
    latestMetric: product.latestMetric ? redact(product.latestMetric) : null,
    metrics: product.metrics.map(redact),
  };
}

function organizationValue<T extends { orgId: number }>(
  value: T | null,
  orgId: number,
): T | null {
  return value?.orgId === orgId ? value : null;
}

function relatedAgentRuns(
  store: Store,
  input: ProductOperationsInput,
  tasks: OwnedProductOperationsDetail["tasks"],
): ProductOperationsAgentRun[] {
  const linkedRunIds = new Set(
    tasks
      .filter((task) => task.sourceType === "ai_run" && task.sourceId)
      .map((task) => Number(task.sourceId))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  return store
    .listAiRuns({ orgId: input.orgId, limit: 500 })
    .filter((run) => linkedRunIds.has(run.id) || runReferencesProduct(run, input.productId))
    .slice(0, 8)
    .map(toAgentRunSummary);
}

function runReferencesProduct(run: AiRun, productId: number): boolean {
  try {
    const context: unknown = JSON.parse(run.inputContextJson);
    return isRecord(context) && context.productId === productId;
  } catch {
    return false;
  }
}

function toAgentRunSummary(run: AiRun): ProductOperationsAgentRun {
  return {
    id: run.id,
    agentType: run.agentType,
    model: run.model,
    status: run.status,
    summary: run.output?.summary ?? null,
    confidence: run.output?.confidence ?? null,
    actionCount: run.output?.recommended_actions.length ?? 0,
    createdAt: run.createdAt,
  };
}

function relatedCompetitors(
  store: Store,
  product: OwnedProductDetail,
  orgId: number,
): ProductOperationsCompetitor[] {
  const category = normalized(product.category);
  if (!category) return [];
  return store
    .listCompetitors({ orgId })
    .filter((item) => (
      item.marketplace.toLowerCase() === product.marketplace.toLowerCase()
      && (
        normalized(item.latestCategoryName) === category
        || normalized(item.latestBsrCategory) === category
      )
    ))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      asin: item.asin,
      title: item.title,
      brand: item.brand,
      imageUrl: item.imageUrl,
      latestPrice: item.latestPrice,
      latestRank: item.latestCategoryRank ?? item.latestBsrRank ?? item.latestRank,
      latestReviewCount: item.latestReviewCount ?? null,
      couponText: item.couponText,
      dealBadge: item.dealBadge,
      competitorTier: item.competitorTier,
      isKeyCompetitor: item.isKeyCompetitor,
      comparisonBasis: "same_category",
      updatedAt: item.updatedAt,
    }));
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
