import type { CategoryReportInput, CategorySignalLog, DailyChange, DailyReportInput } from "./types.js";
import { formatNullableMoney } from "./report-formatters.js";

export function buildCategoryReportMarkdown(input: CategoryReportInput): string {
  const topBrands = input.brandMatrix
    .filter((brand) => brand.productCountTop100 > 0)
    .slice(0, 8)
    .map(
      (brand, index) =>
        `${index + 1}. ${brand.brand}: Top20 ${brand.productCountTop20}, Top50 ${brand.productCountTop50}, Top100 ${brand.productCountTop100}, best #${brand.bestRank ?? "-"}, new ${brand.newEntryCount}, activity ${brand.couponCount + brand.dealCount + brand.priceDownCount}`
    );
  const topSignals = input.signals
    .slice(0, 12)
    .map((signal) => `- [${signal.alertLevel}] ${signal.signalType} ${signal.asin ?? signal.brand ?? ""}: ${signal.content}`);
  const topEvents = (input.activityEvents ?? [])
    .slice(0, 12)
    .map(
      (event) =>
        `- [${event.eventLevel}] ${event.eventType} ${event.asin ?? event.brand ?? ""}: ${event.eventSummary} Action: ${event.suggestedAction}`
    );
  const newProducts = input.signals.filter((signal) => signal.signalType === "new_product_breakout");
  const activitySignals = input.signals.filter((signal) => ["price_drop", "new_coupon", "new_deal"].includes(signal.signalType));

  return [
    "# Amazon 类目竞品情报日报",
    "",
    `日期：${input.date}`,
    `类目：${input.category.name}`,
    `站点：${input.category.marketplace}`,
    `抓取范围：Top ${input.category.crawlTopN}`,
    "",
    "## 一、类目概览",
    `- 今日榜单 ASIN：${input.snapshots.length}`,
    `- 覆盖品牌数：${input.brandMatrix.filter((item) => item.productCountTop100 > 0).length}`,
    `- 榜单异动信号：${input.signals.length}`,
    `- 活动事件：${input.activityEvents?.length ?? 0}`,
    "",
    "## 二、品牌矩阵",
    ...(topBrands.length ? topBrands : ["- 暂无品牌矩阵数据"]),
    "",
    "## 三、竞品异动",
    ...(topSignals.length ? topSignals : ["- 暂无明显异动"]),
    "",
    "## 四、活动事件与策略判断",
    ...(topEvents.length ? topEvents : ["- 暂无活动事件"]),
    "",
    "## 五、新品爆发",
    ...renderCategorySignalLines(newProducts),
    "",
    "## 六、价格与促销",
    ...renderCategorySignalLines(activitySignals)
  ].join("\n");
}

export function buildDailyReportMarkdown(input: DailyReportInput): string {
  const priceDrops = input.analysis.changes.filter((change) => change.changeType === "price_drop");
  const newCoupons = input.analysis.changes.filter((change) => change.changeType === "new_coupon");
  const rankingChanges = input.analysis.changes.filter((change) =>
    ["entered_top_10", "entered_top_20", "rank_up", "rank_down"].includes(change.changeType)
  );
  const newCompetitors = input.analysis.changes.filter((change) => change.changeType === "new_competitor");
  const adChanges = input.analysis.changes.filter((change) =>
    ["new_sponsored", "sponsored_disappeared"].includes(change.changeType)
  );

  return [
    "# Amazon 关键词竞品监控日报",
    "",
    `日期：${input.date}`,
    `关键词：${input.keyword}`,
    "",
    "## 一、今日重点变化",
    renderChangeList("明显降价", priceDrops),
    renderChangeList("新增 Coupon", newCoupons),
    "",
    "## 二、排名变化",
    renderChangeList("排名异动", rankingChanges),
    "",
    "## 三、新竞品进入",
    renderChangeList("新 ASIN", newCompetitors),
    "",
    "## 四、广告位变化",
    renderChangeList("广告位", adChanges),
    "",
    "## 五、关键词价格带变化",
    `- 样本数：${input.priceBand.count}`,
    `- 最低价：${formatNullableMoney(input.priceBand.minPrice)}`,
    `- 最高价：${formatNullableMoney(input.priceBand.maxPrice)}`,
    `- 均价：${formatNullableMoney(input.priceBand.averagePrice)}`,
    "",
    "## 六、采集异常",
    ...(input.failedKeywords?.length ? input.failedKeywords.map((keyword) => `- ${keyword}`) : ["- 无"])
  ].join("\n");
}

function renderChangeList(title: string, changes: DailyChange[]): string {
  if (changes.length === 0) {
    return [`### ${title}`, "- 无"].join("\n");
  }
  return [
    `### ${title}`,
    ...changes.slice(0, 8).map((change) => {
      const rankText =
        change.todayRank !== null
          ? `当前排名：第 ${change.todayRank} 名`
          : change.yesterdayRank !== null
            ? `昨日排名：第 ${change.yesterdayRank} 名`
            : "排名：无";
      const priceText =
        change.todayPrice !== null
          ? `当前价格：${formatNullableMoney(change.todayPrice)}`
          : `昨日价格：${formatNullableMoney(change.yesterdayPrice)}`;
      return `- ASIN ${change.asin}：${change.title}，${rankText}，${priceText}`;
    })
  ].join("\n");
}

function renderCategorySignalLines(signals: CategorySignalLog[]): string[] {
  return signals.length ? signals.slice(0, 8).map((signal) => `- ${signal.asin ?? "-"}：${signal.content}`) : ["- 暂无"];
}
