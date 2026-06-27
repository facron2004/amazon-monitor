import type { CompetitorPoolItem } from "@amazon-monitor/shared";
import { validCouponText, validDealBadge } from "./formatters-promotions";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";

export interface FilterVisibleCompetitorsOptions {
  competitors: CompetitorPoolItem[];
  competitorQuery: string;
  competitorSourceFilter: CompetitorSourceFilter;
  competitorTierFilter: CompetitorTierFilter;
}

export function filterVisibleCompetitors(options: FilterVisibleCompetitorsOptions): CompetitorPoolItem[] {
  const query = options.competitorQuery.trim().toLowerCase();

  return options.competitors.filter((item) => {
    const matchesSource =
      options.competitorSourceFilter === "all" ||
      item.sourceType === options.competitorSourceFilter ||
      (options.competitorSourceFilter === "category" && item.sourceType === "hybrid") ||
      (options.competitorSourceFilter === "keyword" && item.sourceType === "hybrid");
    const matchesTier = options.competitorTierFilter === "all" || item.competitorTier === options.competitorTierFilter;

    if (!query) {
      return matchesSource && matchesTier;
    }

    return (
      matchesSource &&
      matchesTier &&
      (item.asin.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        (item.brand ?? "").toLowerCase().includes(query) ||
        (item.couponText ?? "").toLowerCase().includes(query) ||
        (item.dealBadge ?? "").toLowerCase().includes(query) ||
        item.competitorReasons.some((reason) => reason.toLowerCase().includes(query)))
    );
  });
}

export function findSelectedCompetitor(competitors: CompetitorPoolItem[], selectedCompetitorAsin: string | null): CompetitorPoolItem | null {
  return competitors.find((item) => item.asin === selectedCompetitorAsin) ?? null;
}

// ── KPI 与洞察建议聚合 ─────────────────────────────────────────────────────
// 全部前端本地算,后端无需新增端点。

export interface CompetitorKpi {
  key: "total" | "core" | "new" | "priceActive" | "key";
  label: string;
  value: number;
  delta: number | null;
  tone: "total" | "core" | "new" | "price" | "key";
}

export interface KpiDelta {
  total: number | null;
  core: number | null;
  new: number | null;
  priceActive: number | null;
  key: number | null;
}

export interface CompetitorInsightSuggestion {
  headline: string;
  body: string;
  highlightTier: CompetitorPoolItem["competitorTier"];
  topItems: CompetitorPoolItem[];
  stats: { label: string; value: number; tone: "price" | "activity" | "core" | "neutral" }[];
}

/**
 * 是否"新进竞品":入池 7 天内(firstSeenDate 在最近 7 天)的 core/rising 视为新进。
 * 简化判定:不依赖后端 firstSeenDate 上报,改用 firstSeenDate 与数据日期比较。
 */
function isNewEntry(item: CompetitorPoolItem, today: Date): boolean {
  if (!item.firstSeenDate) return false;
  const first = new Date(item.firstSeenDate).getTime();
  if (!Number.isFinite(first)) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return today.getTime() - first <= sevenDaysMs;
}

/**
 * 是否"价格波动":couponText 或 dealBadge 任一非空(复用 shared formatters 的 allowlist)。
 */
function hasPriceActivity(item: CompetitorPoolItem): boolean {
  return Boolean(validCouponText(item.couponText)) || Boolean(validDealBadge(item.dealBadge));
}

export function buildCompetitorKpis(
  competitors: CompetitorPoolItem[],
  yesterdayDelta: KpiDelta = {
    total: null,
    core: null,
    new: null,
    priceActive: null,
    key: null
  },
  today: Date = new Date()
): CompetitorKpi[] {
  const coreCount = competitors.filter((item) => item.competitorTier === "core").length;
  const newCount = competitors.filter((item) => isNewEntry(item, today)).length;
  const priceActiveCount = competitors.filter((item) => hasPriceActivity(item)).length;
  const keyCount = competitors.filter((item) => item.isKeyCompetitor).length;

  return [
    { key: "total", label: "总竞品数", value: competitors.length, delta: yesterdayDelta.total, tone: "total" },
    { key: "core", label: "核心竞品", value: coreCount, delta: yesterdayDelta.core, tone: "core" },
    { key: "new", label: "新进竞品", value: newCount, delta: yesterdayDelta.new, tone: "new" },
    { key: "priceActive", label: "价格波动", value: priceActiveCount, delta: yesterdayDelta.priceActive, tone: "price" },
    { key: "key", label: "高优先跟进", value: keyCount, delta: yesterdayDelta.key, tone: "key" }
  ];
}

export function buildCompetitorInsightSuggestion(
  competitors: CompetitorPoolItem[],
  today: Date = new Date()
): CompetitorInsightSuggestion {
  const priceActive = competitors.filter((item) => hasPriceActivity(item));
  const promoActive = competitors.filter((item) => Boolean(validCouponText(item.couponText)));
  const coreItems = competitors.filter((item) => item.competitorTier === "core");

  // 头部建议:找出"价格活跃 + 核心分层"重合度最高的 tier
  const priceActiveCore = priceActive.filter((item) => item.competitorTier === "core");
  const headline = priceActiveCore.length > 0 ? "建议优先关注:价格波动 + 促销中 + 核心分层的竞品" : "建议优先关注:核心分层中带价格活动的竞品";
  const body =
    priceActiveCore.length > 0
      ? `已识别 ${priceActiveCore.length} 个核心竞品同时存在 Coupon/Deal 活动,值得 3-7 天内密切观察其排名变化。`
      : "当前核心分层竞品暂未触发价格活动,可继续关注新进与上升队列。";

  return {
    headline,
    body,
    highlightTier: "core",
    topItems: priceActiveCore.slice(0, 4),
    stats: [
      { label: "价格活跃竞品", value: priceActive.length, tone: "price" },
      { label: "促销中竞品", value: promoActive.length, tone: "activity" },
      { label: "核心分层竞品", value: coreItems.length, tone: "core" }
    ]
  };
}
