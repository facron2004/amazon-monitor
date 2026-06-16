import { categoryLabel } from "./formatters-labels";
import { localizeCouponLabel, localizeDealLabel } from "./formatters-promotions";

export function localizeGeneratedText(text: string | null | undefined): string {
  if (!text) {
    return text ?? "-";
  }

  const exactMap: Record<string, string> = {
    "Possible brand matrix push across multiple ASINs.": "可能存在跨多个 ASIN 的品牌矩阵推进。",
    "Watch whether this brand expands Top50/Top20 share over the next 7 days.": "未来 7 天继续观察该品牌在 Top 50 / Top 20 的占位是否扩大。",
    "Price drop and rank improvement appeared together; possible price-push ranking move.": "降价与排名提升同时出现，可能是价格驱动的冲榜动作。",
    "Record this price point and track rank movement over the next 3 days.": "记录这个价格点位，并继续跟踪未来 3 天的排名变化。",
    "The product lost enough sales velocity to leave the tracked Best Sellers scope.": "该商品销量动能已不足，已跌出当前跟踪的 Best Sellers 范围。",
    "Check whether this was activity-end decay, stock issue, price change, or a temporary Amazon ranking fluctuation.": "检查这是否由活动结束后的回落、库存问题、价格变化，或 Amazon 排名短期波动造成。",
    "New listing, relaunch, promotion, ads, or external traffic may be pushing the product into the list.": "新品、重推、促销、广告或站外流量，可能正在推动该商品进入榜单。",
    "Track this ASIN daily for 7 days and review price, coupon, deal, and keyword rank changes.": "建议连续 7 天按日跟踪该 ASIN，并复核价格、Coupon、Deal 与 keyword rank 变化。",
    "Keep monitoring; promote to watchlist if rank keeps improving.": "先继续观察；如果排名持续改善，再提升到重点观察列表。",
    "The product may have lost traffic, ended an activity, changed price, or faced stronger competitors.": "该商品可能流量下滑、活动结束、价格变化，或者遭遇了更强的竞品压力。",
    "Use this as a decay signal and compare against activity end, price rise, stock, and review changes.": "把它作为衰减信号，并继续对照活动结束、涨价、库存和 Review 变化一起判断。",
    "Fast BSR lift often points to a promotion, advertising push, off-site traffic, or demand spike.": "BSR 快速上升通常意味着促销、广告加推、站外流量或需求激增。",
    "Check same-day price, coupon, deal, review, and keyword-rank signals, then compare the next 3-day rank path.": "检查同日价格、Coupon、Deal、Review 和 keyword rank 信号，再对比后续 3 天的排名轨迹。",
    "Rank dropped after promotion ended; this item may rely on activity to hold rank.": "活动结束后排名下滑，说明该商品可能依赖活动维持排名。",
    "Track the next 3 days to measure post-activity rank decay.": "继续跟踪未来 3 天，评估活动结束后的排名回落幅度。",
    "Meaningful price drop; ranking effect still needs observation.": "这是一次明显降价，但对排名的影响还需要继续观察。",
    "Review growth can indicate sustained sales velocity or a recent review-generation push.": "Review 增长可能意味着销量持续走高，或近期存在拉 Review 动作。",
    "Compare review growth with rank, price, coupon, and deal movement for the same day.": "把 Review 增长和同日的排名、价格、Coupon 与 Deal 变化一起看。",
    "Coupon start and rank improvement appeared together; possible coupon-led push.": "Coupon 上线与排名提升同时出现，可能是 Coupon 驱动的冲榜动作。",
    "Coupon started; likely conversion or promotion test.": "Coupon 已开始，可能在测试转化或促销效果。",
    "Watch coupon duration and rank lift.": "继续观察 Coupon 持续时长和排名抬升幅度。",
    "Rank dropped after coupon ended; possible promotion dependency.": "Coupon 结束后排名下滑，可能存在促销依赖。",
    "Coupon ended without obvious rank decay yet.": "Coupon 已结束，但暂时还没有明显的排名回落。",
    "Keep tracking the 3-day post-coupon rank path.": "继续跟踪 Coupon 结束后 3 天的排名轨迹。",
    "Coupon got stronger; possible conversion lift or rank push attempt.": "Coupon 力度增强，可能在尝试拉升转化或推动排名。",
    "Check whether Best Sellers rank keeps improving.": "继续观察 Best Sellers 排名是否持续改善。",
    "Deal and rank lift appeared together; possible activity push.": "Deal 上线与排名提升同时出现，可能是 Deal 驱动的冲榜动作。",
    "Deal started; item is likely in an activity period.": "Deal 已开始，该商品很可能正处于活动期。",
    "Record deal start date and compare rank during and after the activity.": "记录 Deal 开始日期，并对比活动期间与结束后的排名变化。",
    "Rank dropped after deal ended; possible activity dependency.": "Deal 结束后排名下滑，可能存在活动依赖。",
    "Deal ended without clear rank decay yet.": "Deal 已结束，但暂时还没有明确的排名回落。",
    "Observe whether rank falls back over the next 3 days.": "继续观察未来 3 天排名是否回落。",
    "Possible new-entry or relaunch push with price, coupon, deal, ads, or external traffic.": "可能存在新品上榜或重推动作，背后可能伴随价格、Coupon、Deal、广告或站外流量。",
    "New Top 100 entry; observe whether it stays ranked.": "新进 Top 100，继续观察后续是否能站稳。",
    "Add to Top competitor watchlist and track the next 7 days.": "加入重点竞品观察列表，并持续跟踪未来 7 天。",
    "Keep monitoring; promote to key competitor if rank keeps improving.": "先继续观察；如果排名持续改善，再升级为重点竞品。"
  };

  const rules: Array<[RegExp, (...args: string[]) => string]> = [
    [/^(\S+) first entered (.+?) Top (\d+) at #(\d+)\.$/, (_m, asin, category, boundary, rank) => `${asin} 首次进入 ${categoryLabel(category)} Top ${boundary}，当前排名 #${rank}。`],
    [/^(\S+) is a new breakout product in (.+?), entering at #(\d+)\.$/, (_m, asin, category, rank) => `${asin} 在 ${categoryLabel(category)} 中出现新品爆发，当前进入 #${rank}。`],
    [/^(\S+) moved up (\d+) places to #(\d+)\.$/, (_m, asin, delta, rank) => `${asin} 上升 ${delta} 名，当前来到 #${rank}。`],
    [/^(\S+) moved down (\d+) places to #(\d+)\.$/, (_m, asin, delta, rank) => `${asin} 下滑 ${delta} 名，当前来到 #${rank}。`],
    [/^(\S+) entered Top (\d+), moving from #(\d+) to #(\d+)\.$/, (_m, asin, boundary, previousRank, rank) => `${asin} 进入 Top ${boundary}，排名由 #${previousRank} 升至 #${rank}。`],
    [/^(\S+) entered (.+?) Top (\d+) at #(\d+)\.$/, (_m, asin, category, boundary, rank) => `${asin} 进入 ${categoryLabel(category)} Top ${boundary}，当前排名 #${rank}。`],
    [/^(\S+) price dropped from (\$[\d.]+) to (\$[\d.]+)\.$/, (_m, asin, previousPrice, currentPrice) => `${asin} 价格从 ${previousPrice} 降至 ${currentPrice}。`],
    [/^(\S+) added coupon: (.+)\.$/, (_m, asin, coupon) => `${asin} 新增 Coupon：${localizeCouponLabel(coupon)}。`],
    [/^(\S+) added deal badge: (.+)\.$/, (_m, asin, badge) => `${asin} 新增 Deal 标记：${localizeDealLabel(badge)}。`],
    [/^(\S+) coupon ended; previous coupon was (.+)\.$/, (_m, asin, coupon) => `${asin} Coupon 结束，上一档为 ${localizeCouponLabel(coupon)}。`],
    [/^(\S+) coupon strength increased\.$/, (_m, asin) => `${asin} Coupon 力度增强。`],
    [/^(\S+) deal ended; previous deal was (.+)\.$/, (_m, asin, deal) => `${asin} Deal 结束，上一档为 ${localizeDealLabel(deal)}。`],
    [/^(\S+) reviews grew from ([\d,]+) to ([\d,]+), up ([\d,]+)\.$/, (_m, asin, previousCount, currentCount, delta) => `${asin} Review 数从 ${previousCount} 增长到 ${currentCount}，净增 ${delta}。`],
    [/^(\S+) moved from #(\d+) to #(\d+), up (\d+) places\.$/, (_m, asin, previousRank, rank, delta) => `${asin} 从 #${previousRank} 升至 #${rank}，共上升 ${delta} 名。`],
    [/^(\S+) lost activity signals and dropped from #(\d+) to #(\d+)\.$/, (_m, asin, previousRank, rank) => `${asin} 活动信号消失，排名从 #${previousRank} 下滑到 #${rank}。`],
    [/^(\S+) entered (.+?) Best Sellers at #(\d+)\. Evidence dates: (.+)\.$/, (_m, asin, category, rank, dates) => `${asin} 进入 ${categoryLabel(category)} Best Sellers，当前排名 #${rank}。证据日期：${dates}。`],
    [/^(\S+) moved from #(\d+) to #(\d+), up (\d+) places\. Evidence dates: (.+)\.$/, (_m, asin, previousRank, rank, delta, dates) => `${asin} 从 #${previousRank} 升至 #${rank}，共上升 ${delta} 名。证据日期：${dates}。`],
    [/^(\S+) moved down (\d+) places from #(\d+) to #(\d+)\. Evidence dates: (.+)\.$/, (_m, asin, delta, previousRank, rank, dates) => `${asin} 从 #${previousRank} 下滑至 #${rank}，共下降 ${delta} 名。证据日期：${dates}。`],
    [/^(\S+) dropped out of (.+?) after ranking #(\d+)\. Evidence dates: (.+)\.$/, (_m, asin, category, previousRank, dates) => `${asin} 跌出 ${categoryLabel(category)}，此前排名 #${previousRank}。证据日期：${dates}。`],
    [/^(\S+) dropped from (.+?) Top (\d+) after ranking #(\d+)\.$/, (_m, asin, category, boundary, previousRank) => `${asin} 跌出 ${categoryLabel(category)} Top ${boundary}，此前排名 #${previousRank}。`],
    [/^(.+?) has (\d+) Top100 ASINs; (\d+) are new or rising, and (\d+) have price\/coupon\/deal activity\.(.*)$/, (_m, brand, total, active, activity, tail) => `${brand} 有 ${total} 个 Top 100 ASIN；其中 ${active} 个为新进或上升，${activity} 个存在价格 / Coupon / Deal 活动。${tail.trim()}`]
  ];

  let localized = text;
  for (const [source, target] of Object.entries(exactMap)) {
    localized = localized.replaceAll(source, target);
  }

  for (const [pattern, replacer] of rules) {
    localized = localized.replace(pattern, replacer as never);
  }

  return localized
    .replace(/(\b\S+\b) price dropped from (\$[\d.]+) to (\$[\d.]+)\./g, "$1 价格从 $2 降至 $3。")
    .replaceAll("Top ASINs:", "Top ASINs:")
    .replaceAll("Top ASINs", "Top ASINs")
    .replaceAll("Source event:", "来源事件：")
    .replaceAll("event date:", "事件日期：")
    .replaceAll("BSR path:", "BSR 路径：")
    .replaceAll("price:", "价格：")
    .replaceAll("coupon:", "Coupon:")
    .replaceAll("deal:", "Deal:")
    .replace(/\bTop\s?(\d+)\b/g, "Top $1")
    .replaceAll(" -> ", " → ");
}
