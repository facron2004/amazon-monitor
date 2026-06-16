import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  BsrSnapshotQuality,
  CategorySignalLog,
  CompetitorActionInsight,
  CompetitorActivityEvent
} from "@amazon-monitor/shared";
import { categoryLabel, changeLabel, promoText } from "./formatters";
import { levelWeight, rankMovementMagnitude, rankPath } from "./category-intelligence";

export interface CategoryOverviewBand {
  label: string;
  value: number | string;
  note: string;
  width: number;
  tone: string;
}

export interface CategoryOverviewStory {
  kicker: string;
  title: string;
  detail: string;
  tone: string;
}

export interface CategoryOverviewFlowSection {
  id: string;
  label: string;
  meta: string;
  note: string;
}

export function findStrongestBrand(topBrandMatrix: BrandMatrixSnapshot[]): BrandMatrixSnapshot | null {
  return topBrandMatrix[0] ?? null;
}

export function countPromoActive(topCategorySnapshots: BestsellerRankSnapshot[]): number {
  return topCategorySnapshots.filter((item) => promoText(item) !== "-").length;
}

export function countHighPrioritySignals(categorySignals: CategorySignalLog[]): number {
  return categorySignals.filter((item) => levelWeight(item.alertLevel) >= 3).length;
}

export function countHighPriorityItems(
  filteredActivityEvents: CompetitorActivityEvent[],
  visibleActionInsights: CompetitorActionInsight[]
): number {
  return (
    filteredActivityEvents.filter((item) => levelWeight(item.eventLevel) >= 3).length +
    visibleActionInsights.filter((item) => levelWeight(item.confidence) >= 3).length
  );
}

export function findSteepestRankMove(bsrRankChanges: BsrRankChange[]): BsrRankChange | null {
  return (
    [...bsrRankChanges]
      .sort((left, right) => rankMovementMagnitude(right) - rankMovementMagnitude(left))
      .find((item) => rankMovementMagnitude(item) > 0) ?? null
  );
}

interface BuildOverviewBandsOptions {
  trackedCount: number;
  promoActiveCount: number;
  strongestBrand: BrandMatrixSnapshot | null;
  highestPrioritySignals: number;
  highestPriorityItems: number;
  filteredActivityEventCount: number;
  visibleActionInsightCount: number;
  bsrQuality: BsrSnapshotQuality[];
  badBsrQuality: BsrSnapshotQuality[];
}

export function buildOverviewBands(options: BuildOverviewBandsOptions): CategoryOverviewBand[] {
  const totalTracked = options.trackedCount || 1;
  const strongestShare = options.strongestBrand
    ? Math.round((options.strongestBrand.productCountTop100 / totalTracked) * 100)
    : 0;
  const promoShare = Math.round((options.promoActiveCount / totalTracked) * 100);
  const qualityScore = options.bsrQuality.length
    ? Math.round((options.bsrQuality.filter((item) => item.qualityStatus === "ok").length / options.bsrQuality.length) * 100)
    : 100;
  const highPriorityShare = Math.min(
    100,
    Math.round(
      (options.highestPriorityItems / Math.max(options.filteredActivityEventCount + options.visibleActionInsightCount, 1)) * 100
    )
  );

  return [
    {
      label: "品牌集中度",
      value: options.strongestBrand ? `${strongestShare}%` : "-",
      note: options.strongestBrand
        ? `${options.strongestBrand.brand} 在 Top 100 里占 ${options.strongestBrand.productCountTop100} 席`
        : "当前还没有稳定的品牌占位数据",
      width: strongestShare,
      tone: "brand"
    },
    {
      label: "Deal/Coupon 渗透",
      value: `${promoShare}%`,
      note: `${options.promoActiveCount} / ${totalTracked} 个在榜商品带 Deal/Coupon`,
      width: promoShare,
      tone: "activity"
    },
    {
      label: "高优对象",
      value: options.highestPriorityItems,
      note: `${options.highestPrioritySignals} 条高优信号，建议先看重点对象队列`,
      width: highPriorityShare,
      tone: "alert"
    },
    {
      label: "数据完整度",
      value: `${qualityScore}%`,
      note: options.badBsrQuality.length ? `${options.badBsrQuality.length} 条快照仍待复核` : "当前榜单快照质量稳定",
      width: qualityScore,
      tone: "quality"
    }
  ];
}

export function buildHeroDetail(strongestBrand: BrandMatrixSnapshot | null): string {
  if (strongestBrand) {
    return `Top 100 占 ${strongestBrand.productCountTop100} 席，Top 20 占 ${strongestBrand.productCountTop20} 席，最佳排名 ${
      strongestBrand.bestRank ? `#${strongestBrand.bestRank}` : "-"
    }`;
  }

  return "先从品牌压力、榜单波动和高优对象开始，避免一头扎进长表格里丢掉上下文。";
}

interface BuildCommandStoriesOptions {
  steepestRankMove: BsrRankChange | null;
  promoActiveCount: number;
  trackedCount: number;
  badBsrQualityCount: number;
}

export function buildCommandStories(options: BuildCommandStoriesOptions): CategoryOverviewStory[] {
  const stories: CategoryOverviewStory[] = [];

  if (options.steepestRankMove) {
    stories.push({
      kicker: "今日最大波动",
      title: `${options.steepestRankMove.asin} ${changeLabel(options.steepestRankMove.changeType)}`,
      detail: `${categoryLabel(options.steepestRankMove.category)} · ${rankPath(
        options.steepestRankMove.previousRank,
        options.steepestRankMove.currentRank
      )} · 波动 ${rankMovementMagnitude(options.steepestRankMove)} 名`,
      tone: "alert"
    });
  }

  stories.push({
    kicker: "Deal/Coupon 面",
    title: options.promoActiveCount ? `${options.promoActiveCount} 个在榜商品带 Deal/Coupon` : "当前榜单 Deal/Coupon 信号不强",
    detail: options.promoActiveCount
      ? `Deal/Coupon 渗透率约 ${Math.round((options.promoActiveCount / Math.max(options.trackedCount, 1)) * 100)}%，适合先对照价格与排名联动`
      : "可以优先转向品牌压力、新进榜和掉榜事件",
    tone: "activity"
  });

  stories.push({
    kicker: "复盘风险",
    title: options.badBsrQualityCount ? `还有 ${options.badBsrQualityCount} 条快照待复核` : "当前快照质量稳定，可直接复盘",
    detail: options.badBsrQualityCount
      ? "先排掉缺失与空数据，再对榜单波动和动作洞察做判断"
      : "当前更适合直接处理品牌压力、活动事件和重点对象",
    tone: options.badBsrQualityCount ? "quality" : "signal"
  });

  return stories.slice(0, 3);
}

interface BuildFlowSectionsOptions {
  categoryCount: number;
  topBrandCount: number;
  signalCount: number;
  trackedCount: number;
  badBsrQualityCount: number;
  activityEventCount: number;
  priceHistoryCount: number;
}

export function buildFlowSections(options: BuildFlowSectionsOptions): CategoryOverviewFlowSection[] {
  return [
    {
      id: "category-monitor",
      label: "监控配置",
      meta: `${options.categoryCount} 个类目`,
      note: "切换类目、范围与采集动作"
    },
    {
      id: "category-signal",
      label: "品牌与信号",
      meta: `${options.topBrandCount} 个品牌 · ${options.signalCount} 条信号`,
      note: "先看品牌压力，再看异常信号"
    },
    {
      id: "category-board",
      label: "BSR 榜单",
      meta: `${options.trackedCount} 个商品`,
      note: "按品牌和排名快速筛读"
    },
    {
      id: "category-quality",
      label: "质量诊断",
      meta: `${options.badBsrQualityCount} 条待复核`,
      note: "避免基于缺失快照做判断"
    },
    {
      id: "category-activity",
      label: "活动事件",
      meta: `${options.activityEventCount} 条事件`,
      note: "把排名、价格与 Review 轨迹放在一起看"
    },
    {
      id: "category-price-history",
      label: "价格窗口",
      meta: `${options.priceHistoryCount} 条价格样本`,
      note: "快速判断是否接近低价区间"
    }
  ];
}
