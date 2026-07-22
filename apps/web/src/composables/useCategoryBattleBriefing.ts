import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category.js";
import type {
  BattleKpi,
  CategoryBriefingIcons,
} from "../types/category-daily-briefing.js";
import { levelWeight } from "../utils/category-intelligence.js";
import {
  isAtLowPrice,
  rankDeltaValue,
  rankExtremeEntries,
  rankPath,
} from "../utils/categoryDailyBriefing.js";
import { formatPercent, promoText } from "../utils/formatters.js";

export function useCategoryBattleBriefing(icons?: CategoryBriefingIcons) {
  const store = useCategoryStore();
  const {
    categoryDetail,
    topBrandMatrix,
    bsrRankChanges,
    activityEvents,
    priceHistory,
  } = storeToRefs(store);
  const snapshots = computed(() => categoryDetail.value?.snapshots ?? []);
  const top100Count = computed(
    () => snapshots.value.filter((item) => item.rank <= 100).length,
  );
  const top50Count = computed(
    () => snapshots.value.filter((item) => item.rank <= 50).length,
  );
  const promoActiveCount = computed(
    () => snapshots.value.filter((item) => promoText(item) !== "-").length,
  );
  const highPriorityCount = computed(
    () =>
      activityEvents.value.filter((item) => levelWeight(item.eventLevel) >= 3)
        .length,
  );
  const countEvents = (
    eventType: (typeof activityEvents.value)[number]["eventType"],
  ) =>
    activityEvents.value.filter((item) => item.eventType === eventType).length;
  const newTop100Count = computed(() => countEvents("new_entry_top100"));
  const newTop50Count = computed(() => countEvents("new_entry_top50"));
  const droppedTop100Count = computed(
    () =>
      bsrRankChanges.value.filter((item) => item.changeType === "dropped")
        .length,
  );
  const couponStartCount = computed(() => countEvents("coupon_start"));
  const dealStartCount = computed(() => countEvents("deal_start"));
  const priceDownCount = computed(() => countEvents("price_drop"));
  const priceLowCount = computed(
    () => priceHistory.value.filter(isAtLowPrice).length,
  );
  const strongestBrand = computed(() => topBrandMatrix.value[0] ?? null);
  const brandConcentration = computed(() => {
    const topFiveCount = topBrandMatrix.value
      .slice(0, 5)
      .reduce((sum, item) => sum + item.productCountTop100, 0);
    return top100Count.value
      ? Math.round((topFiveCount / top100Count.value) * 100)
      : 0;
  });
  const rankExtremes = computed(() => rankExtremeEntries(bsrRankChanges.value));
  const maxRise = computed(() => rankExtremes.value.maxRise);
  const maxFall = computed(() => rankExtremes.value.maxFall);

  const battleKpis = computed<BattleKpi[]>(() => [
    {
      label: "新进 Top100",
      value: newTop100Count.value,
      note: `${formatPercent(top100Count.value ? newTop100Count.value / top100Count.value : 0)} 换血率`,
      tone: "new",
      icon: icons?.new,
    },
    {
      label: "新进 Top50",
      value: newTop50Count.value,
      note: `Top50 覆盖 ${top50Count.value} 个 ASIN`,
      tone: "rise",
      icon: icons?.rise,
    },
    {
      label: "跌出 Top100",
      value: droppedTop100Count.value,
      note: "需要复盘掉队对象",
      tone: "fall",
      icon: icons?.fall,
    },
    {
      label: "最大上升",
      value: maxRise.value?.item.asin ?? "-",
      note: maxRise.value
        ? rankPath(
            maxRise.value.item.previousRank,
            maxRise.value.item.currentRank,
          )
        : "暂无明显上升",
      tone: "rise",
      icon: icons?.rise,
    },
    {
      label: "新增 Coupon",
      value: couponStartCount.value,
      note: `${promoActiveCount.value} 个商品带活动`,
      tone: "activity",
      icon: icons?.activity,
    },
    {
      label: "价格新低",
      value: priceLowCount.value,
      note: `${priceDownCount.value} 个价格下降事件`,
      tone: "price",
      icon: icons?.price,
    },
    {
      label: "品牌集中度",
      value: `${brandConcentration.value}%`,
      note: strongestBrand.value
        ? `${strongestBrand.value.brand} 占 ${strongestBrand.value.productCountTop100} 席`
        : "暂无品牌矩阵",
      tone: "brand",
      icon: icons?.brand,
    },
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
      "建议动作：先处理重点异动卡片中的高优 ASIN，再复核新品黑马和价格活动雷达，最后进入完整 BSR 榜单做批量筛选。",
    ];
  });

  const priceRadarItems = computed(() => [
    {
      label: "新增 Coupon",
      value: couponStartCount.value,
      note: "活动增强信号",
    },
    {
      label: "取消 Coupon",
      value: countEvents("coupon_end"),
      note: "活动结束风险",
    },
    { label: "新增 Deal", value: dealStartCount.value, note: "促销节奏变化" },
    { label: "价格下降", value: priceDownCount.value, note: "价格战观察" },
    {
      label: "价格新低",
      value: priceLowCount.value,
      note: "T30/T60/T90 或监控低价",
    },
    {
      label: "降价后上升",
      value: activityEvents.value.filter(
        (item) =>
          item.eventType === "price_drop" &&
          (rankDeltaValue(item.rankBefore, item.rankAfter) ?? 0) > 0,
      ).length,
      note: "可能存在价格驱动",
    },
  ]);

  return {
    battleKpis,
    aiSummary,
    priceRadarItems,
    highPriorityCount,
    promoActiveCount,
  };
}
