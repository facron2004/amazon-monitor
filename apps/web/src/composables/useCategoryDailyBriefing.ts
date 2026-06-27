import { computed, ref, type Component } from "vue";
import { storeToRefs } from "pinia";
import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { useCategoryStore } from "../stores/category";
import { compactText, levelWeight, rankPath } from "../utils/category-intelligence";
import {
  changeLabel,
  formatCount,
  formatMoney,
  formatPercent,
  formatSignedCount,
  imgFallback,
  localizeGeneratedText,
  promoText
} from "../utils/formatters";

export interface BattleKpi {
  label: string;
  value: string | number;
  note: string;
  tone: "new" | "rise" | "fall" | "activity" | "price" | "brand";
  icon?: Component;
}

export interface InsightCard {
  key: string;
  event: CompetitorActivityEvent;
  snapshot: BestsellerRankSnapshot | null;
  title: string;
  asin: string | null;
  brand: string;
  tag: string;
  rankBefore: number | null;
  rankAfter: number | null;
  rankDelta: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  promo: string;
  reviewDelta: number | null;
  score: number;
}

export interface OpportunityCard {
  snapshot: BestsellerRankSnapshot;
  score: number;
  reason: string;
}

export type DrawerState =
  | { mode: "event"; item: InsightCard }
  | { mode: "brand"; item: BrandMatrixSnapshot }
  | { mode: "opportunity"; item: OpportunityCard }
  | null;

export interface LaneEvent {
  event: CompetitorActivityEvent;
  asin: string | null;
  brand: string;
  rankDelta: number | null;
  changeLabel: string;
}

export interface ReviewGrowthBrandTotal {
  brand: string;
  totalGrowth: number;
  asinCount: number;
}

export interface KpiDelta {
  movers: number | null;
  promotions: number | null;
  fading: number | null;
  reviewGrowth: number | null;
}

// 集中放这里以便后端"评分规则"对齐和单元测试
function eventScore(event: CompetitorActivityEvent): number {
  const typeScore: Partial<Record<CompetitorActivityEvent["eventType"], number>> = {
    new_entry_top50: 100,
    rank_surge: 92,
    brand_matrix_push: 86,
    new_entry_top100: 82,
    price_drop: 74,
    coupon_start: 70,
    deal_start: 70,
    review_growth: 64,
    activity_end_rank_drop: 62,
    coupon_increase: 58,
    coupon_end: 48,
    deal_end: 48
  };

  return (typeScore[event.eventType] ?? 40) + levelWeight(event.eventLevel) * 8 - (event.rankAfter ?? 120) / 10;
}

function opportunityScore(snapshot: BestsellerRankSnapshot, hasBreakoutSignal: boolean): number {
  const rankScore = Math.max(0, 45 - Math.round(snapshot.rank / 3));
  const reviewScore = snapshot.reviewCount === null ? 10 : snapshot.reviewCount < 100 ? 28 : snapshot.reviewCount < 500 ? 14 : 0;
  const promoScore = promoText(snapshot) !== "-" ? 14 : 0;
  const signalScore = hasBreakoutSignal ? 24 : 0;
  return Math.min(100, rankScore + reviewScore + promoScore + signalScore);
}

function opportunityReason(snapshot: BestsellerRankSnapshot, hasBreakoutSignal: boolean): string {
  if (hasBreakoutSignal) {
    return "系统已识别为新品爆发信号";
  }
  if (snapshot.reviewCount !== null && snapshot.reviewCount < 100) {
    return `Review 仅 ${formatCount(snapshot.reviewCount)}，但已进入 #${snapshot.rank}`;
  }
  if (promoText(snapshot) !== "-") {
    return "排名靠前且存在 Deal/Coupon 活动";
  }
  return "排名靠前，建议继续观察";
}

function brandJudgement(brand: BrandMatrixSnapshot): string {
  if (brand.rankUpCount + brand.newEntryCount >= 3 && brand.couponCount + brand.dealCount >= 2) {
    return "多 ASIN 上升叠加活动，疑似品牌矩阵推进";
  }
  if (brand.rankDownCount >= 3) {
    return "多个链接下滑，建议复核活动是否结束";
  }
  if (brand.newEntryCount > 0) {
    return "有新链接进入榜单，适合观察是否扩大战线";
  }
  return "占位稳定，继续观察 Top50/Top20 份额";
}

function rankDeltaValue(previousRank: number | null | undefined, currentRank: number | null | undefined): number | null {
  if (!previousRank || !currentRank) {
    return null;
  }
  return previousRank - currentRank;
}

function formatRankDelta(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value > 0 ? `上升 ${value}` : value < 0 ? `下滑 ${Math.abs(value)}` : "持平";
}

function formatPriceDelta(before: number | null, after: number | null): string {
  if (before === null || after === null) {
    return "-";
  }

  const delta = after - before;
  if (delta === 0) {
    return "持平";
  }

  return `${delta > 0 ? "上涨" : "下降"} ${formatMoney(Math.abs(delta))}`;
}

function isAtLowPrice(item: ProductPriceHistory): boolean {
  if (item.currentPrice === null) {
    return false;
  }

  return [item.t30LowPrice, item.t60LowPrice, item.t90LowPrice, item.monitoringLowPrice].some(
    (price) => price !== null && item.currentPrice !== null && item.currentPrice <= price
  );
}

function openExternal(url: string | null | undefined): void {
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// 事件分桶:未知事件类型默认落"other",只显示在 lane 之外(不挤进 movers/promotions/fading 任一 lane)。
const MOVER_EVENT_TYPES = new Set<CompetitorActivityEvent["eventType"]>([
  "new_entry_top50",
  "new_entry_top100",
  "rank_surge",
  "brand_matrix_push",
  "brand_matrix_drop"
]);
const PROMOTION_EVENT_TYPES = new Set<CompetitorActivityEvent["eventType"]>([
  "coupon_start",
  "coupon_increase",
  "deal_start",
  "price_drop"
]);
const FADING_EVENT_TYPES = new Set<CompetitorActivityEvent["eventType"]>([
  "coupon_end",
  "deal_end",
  "activity_end_rank_drop"
]);

function toLaneEvent(event: CompetitorActivityEvent): LaneEvent {
  return {
    event,
    asin: event.asin ?? null,
    brand: event.brand ?? "未知品牌",
    rankDelta: rankDeltaValue(event.rankBefore, event.rankAfter),
    changeLabel: changeLabel(event.eventType)
  };
}

export function useCategoryDailyBriefing(icons?: {
  new?: Component;
  rise?: Component;
  fall?: Component;
  activity?: Component;
  price?: Component;
  brand?: Component;
}) {
  const store = useCategoryStore();
  const {
    categoryDetail,
    selectedCategory,
    categoryDataDate,
    topBrandMatrix,
    categorySignals,
    bsrRankChanges,
    activityEvents,
    priceHistory
  } = storeToRefs(store);

  const drawer = ref<DrawerState>(null);

  const snapshots = computed(() => categoryDetail.value?.snapshots ?? []);
  const snapshotByAsin = computed(
    () => new Map(snapshots.value.map((item) => [item.asin, item]))
  );

  const top100Count = computed(() => snapshots.value.filter((item) => item.rank <= 100).length);
  const top50Count = computed(() => snapshots.value.filter((item) => item.rank <= 50).length);
  const promoActiveCount = computed(() => snapshots.value.filter((item) => promoText(item) !== "-").length);
  const highPriorityCount = computed(() => activityEvents.value.filter((item) => levelWeight(item.eventLevel) >= 3).length);

  const newTop100Count = computed(() => activityEvents.value.filter((item) => item.eventType === "new_entry_top100").length);
  const newTop50Count = computed(() => activityEvents.value.filter((item) => item.eventType === "new_entry_top50").length);
  const droppedTop100Count = computed(() => bsrRankChanges.value.filter((item) => item.changeType === "dropped").length);
  const couponStartCount = computed(() => activityEvents.value.filter((item) => item.eventType === "coupon_start").length);
  const dealStartCount = computed(() => activityEvents.value.filter((item) => item.eventType === "deal_start").length);
  const priceDownCount = computed(() => activityEvents.value.filter((item) => item.eventType === "price_drop").length);
  const priceLowCount = computed(() => priceHistory.value.filter((item) => isAtLowPrice(item)).length);

  const strongestBrand = computed(() => topBrandMatrix.value[0] ?? null);
  const brandConcentration = computed(() => {
    const topFiveCount = topBrandMatrix.value.slice(0, 5).reduce((sum, item) => sum + item.productCountTop100, 0);
    return top100Count.value ? Math.round((topFiveCount / top100Count.value) * 100) : 0;
  });

  // 单次遍历同时算出 maxRise / maxFall,避免对 bsrRankChanges 做两次 clone + 两次 sort。
  // 用 for-of 一次性记录最大值/最小值,O(n) 替代之前的 2×O(n log n)。
  const rankExtremes = computed(() => {
    let maxRiseEntry: { item: BsrRankChange; delta: number } | null = null;
    let maxFallEntry: { item: BsrRankChange; delta: number } | null = null;
    for (const item of bsrRankChanges.value) {
      const delta = rankDeltaValue(item.previousRank, item.currentRank);
      if (delta === null) continue;
      if (delta > 0 && (maxRiseEntry === null || delta > maxRiseEntry.delta)) {
        maxRiseEntry = { item, delta };
      } else if (delta < 0 && (maxFallEntry === null || delta < maxFallEntry.delta)) {
        maxFallEntry = { item, delta };
      }
    }
    return { maxRise: maxRiseEntry, maxFall: maxFallEntry };
  });
  const maxRise = computed(() => rankExtremes.value.maxRise);
  const maxFall = computed(() => rankExtremes.value.maxFall);

  const safeIcons = {
    new: icons?.new,
    rise: icons?.rise,
    fall: icons?.fall,
    activity: icons?.activity,
    price: icons?.price,
    brand: icons?.brand
  } as const;
  const battleKpis = computed<BattleKpi[]>(() => [
    {
      label: "新进 Top100",
      value: newTop100Count.value,
      note: `${formatPercent(top100Count.value ? newTop100Count.value / top100Count.value : 0)} 换血率`,
      tone: "new",
      icon: safeIcons.new
    },
    {
      label: "新进 Top50",
      value: newTop50Count.value,
      note: `Top50 覆盖 ${top50Count.value} 个 ASIN`,
      tone: "rise",
      icon: safeIcons.rise
    },
    {
      label: "跌出 Top100",
      value: droppedTop100Count.value,
      note: "需要复盘掉队对象",
      tone: "fall",
      icon: safeIcons.fall
    },
    {
      label: "最大上升",
      value: maxRise.value ? maxRise.value.item.asin : "-",
      note: maxRise.value ? rankPath(maxRise.value.item.previousRank, maxRise.value.item.currentRank) : "暂无明显上升",
      tone: "rise",
      icon: safeIcons.rise
    },
    {
      label: "新增 Coupon",
      value: couponStartCount.value,
      note: `${promoActiveCount.value} 个商品带活动`,
      tone: "activity",
      icon: safeIcons.activity
    },
    {
      label: "价格新低",
      value: priceLowCount.value,
      note: `${priceDownCount.value} 个价格下降事件`,
      tone: "price",
      icon: safeIcons.price
    },
    {
      label: "品牌集中度",
      value: `${brandConcentration.value}%`,
      note: strongestBrand.value ? `${strongestBrand.value.brand} 占 ${strongestBrand.value.productCountTop100} 席` : "暂无品牌矩阵",
      tone: "brand",
      icon: safeIcons.brand
    }
  ]);

  const aiSummary = computed(() => {
    const riseText = maxRise.value
      ? `${maxRise.value.item.asin} ${rankPath(maxRise.value.item.previousRank, maxRise.value.item.currentRank)}`
      : "暂无单个 ASIN 大幅上升";
    const fallText = maxFall.value
      ? `${maxFall.value.item.asin} ${rankPath(maxFall.value.item.previousRank, maxFall.value.item.currentRank)}`
      : "暂无单个 ASIN 大幅下滑";
    const brandText = strongestBrand.value
      ? `${strongestBrand.value.brand} 以 Top100 ${strongestBrand.value.productCountTop100} 席、Top50 ${strongestBrand.value.productCountTop50} 席保持最高占位`
      : "当前还没有足够品牌矩阵数据";

    return [
      `发生了什么：Top100 新进 ${newTop100Count.value} 个 ASIN，Top50 新进 ${newTop50Count.value} 个，跌出 Top100 ${droppedTop100Count.value} 个；${riseText}，${fallText}。`,
      `可能原因：新增 Coupon ${couponStartCount.value} 个、新增 Deal ${dealStartCount.value} 个、价格下降事件 ${priceDownCount.value} 个，价格新低 ${priceLowCount.value} 个。`,
      `影响判断：${brandText}；Top5 品牌集中度约 ${brandConcentration.value}%，高优事件 ${highPriorityCount.value} 条。`,
      `建议动作：先处理重点异动卡片中的高优 ASIN，再复核新品黑马和价格活动雷达，最后进入完整 BSR 榜单做批量筛选。`
    ];
  });

  // 所有事件 → InsightCard 完整映射(供任意 lane 详情抽屉复用)
  const allInsightCards = computed<InsightCard[]>(() =>
    activityEvents.value.map((event) => {
      const snapshot = event.asin ? snapshotByAsin.value.get(event.asin) ?? null : null;
      const rankAfter = event.rankAfter ?? snapshot?.rank ?? null;
      const rankBefore = event.rankBefore;
      const priceAfter = event.priceAfter ?? snapshot?.currentPrice ?? null;
      const priceBefore = event.priceBefore;
      const delta = rankDeltaValue(rankBefore, rankAfter);
      return {
        key: event.eventKey,
        event,
        snapshot,
        title: event.title || snapshot?.title || localizeGeneratedText(event.eventSummary),
        asin: event.asin,
        brand: event.brand || snapshot?.brand || "未知品牌",
        tag: changeLabel(event.eventType),
        rankBefore,
        rankAfter,
        rankDelta: delta,
        priceBefore,
        priceAfter,
        promo: event.couponAfter || event.dealType || (snapshot ? promoText(snapshot) : "-"),
        reviewDelta: event.reviewCountChange ?? null,
        score: eventScore(event)
      };
    })
  );

  const insightCards = computed<InsightCard[]>(() =>
    [...allInsightCards.value].sort((left, right) => right.score - left.score).slice(0, 6)
  );

  const opportunityCards = computed<OpportunityCard[]>(() => {
    const signalAsins = new Set(categorySignals.value.filter((item) => item.signalType === "new_product_breakout").map((item) => item.asin));
    return snapshots.value
      .filter((item) => {
        const lowReview = item.reviewCount !== null && item.reviewCount < 100;
        return signalAsins.has(item.asin) || (item.rank <= 100 && lowReview) || (item.rank <= 50 && promoText(item) !== "-");
      })
      .map((snapshot) => {
        const score = opportunityScore(snapshot, signalAsins.has(snapshot.asin));
        return {
          snapshot,
          score,
          reason: opportunityReason(snapshot, signalAsins.has(snapshot.asin))
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);
  });

  const priceRadarItems = computed(() => [
    { label: "新增 Coupon", value: couponStartCount.value, note: "活动增强信号" },
    { label: "取消 Coupon", value: activityEvents.value.filter((item) => item.eventType === "coupon_end").length, note: "活动结束风险" },
    { label: "新增 Deal", value: dealStartCount.value, note: "促销节奏变化" },
    { label: "价格下降", value: priceDownCount.value, note: "价格战观察" },
    { label: "价格新低", value: priceLowCount.value, note: "T30/T60/T90 或监控低价" },
    {
      label: "降价后上升",
      value: activityEvents.value.filter((item) => item.eventType === "price_drop" && (rankDeltaValue(item.rankBefore, item.rankAfter) ?? 0) > 0).length,
      note: "可能存在价格驱动"
    }
  ]);

  // ---- 新版 lanes / KPI 支撑字段(追加,不动原有) ----
  const couponEndCount = computed(() => activityEvents.value.filter((item) => item.eventType === "coupon_end").length);
  const dealEndCount = computed(() => activityEvents.value.filter((item) => item.eventType === "deal_end").length);
  const activityEndRankDropCount = computed(() =>
    activityEvents.value.filter((item) => item.eventType === "activity_end_rank_drop").length
  );

  const moversEvents = computed<LaneEvent[]>(() =>
    activityEvents.value
      .filter((item) => MOVER_EVENT_TYPES.has(item.eventType))
      .sort((left, right) => eventScore(right) - eventScore(left))
      .slice(0, 6)
      .map(toLaneEvent)
  );
  const promotionsEvents = computed<LaneEvent[]>(() =>
    activityEvents.value
      .filter((item) => PROMOTION_EVENT_TYPES.has(item.eventType))
      .sort((left, right) => eventScore(right) - eventScore(left))
      .slice(0, 6)
      .map(toLaneEvent)
  );
  const fadingEvents = computed<LaneEvent[]>(() =>
    activityEvents.value
      .filter((item) => FADING_EVENT_TYPES.has(item.eventType))
      .sort((left, right) => eventScore(right) - eventScore(left))
      .slice(0, 6)
      .map(toLaneEvent)
  );

  // Review 增长按 brand 聚合,取总增量 top3。
  const reviewGrowthTopBrands = computed<ReviewGrowthBrandTotal[]>(() => {
    const buckets = new Map<string, { totalGrowth: number; asinCount: number }>();
    for (const event of activityEvents.value) {
      if (event.eventType !== "review_growth") continue;
      const change = event.reviewCountChange ?? 0;
      if (change <= 0) continue;
      const brand = event.brand?.trim() || "未知品牌";
      const current = buckets.get(brand) ?? { totalGrowth: 0, asinCount: 0 };
      current.totalGrowth += change;
      current.asinCount += 1;
      buckets.set(brand, current);
    }
    return Array.from(buckets.entries())
      .map(([brand, info]) => ({ brand, totalGrowth: info.totalGrowth, asinCount: info.asinCount }))
      .sort((left, right) => right.totalGrowth - left.totalGrowth)
      .slice(0, 3);
  });

  // "较昨日"差值:后端尚未提供 compareDate=yesterday 数据,先用 null 占位。
  // TODO(后端):在 /api/categories/:id/detail 包中追加 yesterdayKpiSnapshot,或新增
  //   GET /api/categories/:id/kpi-diff?date= 端点返回 4 项差值,store 层做并发加载。
  const yesterdayKpiDelta = ref<KpiDelta>({
    movers: null,
    promotions: null,
    fading: null,
    reviewGrowth: null
  });

  // 价格下降最多:priceRadarItems 中"价格下降"事件的 Top ASIN。
  const priceDropTopItems = computed(() =>
    [...activityEvents.value]
      .filter((item) => item.eventType === "price_drop")
      .sort((left, right) => {
        const leftRate = left.priceChangeRate ?? 0;
        const rightRate = right.priceChangeRate ?? 0;
        return rightRate - leftRate;
      })
      .slice(0, 3)
      .map(toLaneEvent)
  );

  return {
    battleKpis,
    aiSummary,
    insightCards,
    opportunityCards,
    priceRadarItems,
    highPriorityCount,
    topBrandMatrix,
    selectedCategory,
    categoryDataDate,
    promoActiveCount,
    snapshots,
    drawer,
    formatRankDelta,
    formatPriceDelta,
    brandJudgement,
    openExternal,
    imgFallback,
    rankPath,
    formatSignedCount,
    formatMoney,
    compactText,
    localizeGeneratedText,
    changeLabel,
    promoText,
    // 新增(2026-06-24 重构):lanes / KPI 差值 / 风险计数 / Review 增长聚合
    moversEvents,
    promotionsEvents,
    fadingEvents,
    couponEndCount,
    dealEndCount,
    activityEndRankDropCount,
    reviewGrowthTopBrands,
    yesterdayKpiDelta,
    priceDropTopItems,
    // 全量事件 → InsightCard 映射(供 lane 点击打开详情抽屉使用)
    allInsightCards
  };
}

// Re-export for callers that only need a type (drawer / tests).
export { rankPath, compactText, levelWeight };
