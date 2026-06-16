function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function iceTypeLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    nugget: "Nugget",
    bullet: "Bullet",
    clear: "Clear",
    cube: "Cube",
    crescent: "Crescent",
    crushed: "Crushed",
    unknown: "-"
  };

  return value ? map[value] ?? value : "-";
}

export function categoryLabel(value: string | null | undefined): string {
  return value ? normalizeSpace(value) : "-";
}

export function statusText(status: string): string {
  const map: Record<string, string> = {
    enabled: "启用",
    disabled: "停用",
    success: "已采集",
    failed: "失败",
    pending: "待处理",
    viewed: "已查看",
    followed: "已跟进",
    ignored: "已忽略",
    ok: "完整",
    partial: "部分缺失",
    empty: "空数据"
  };

  return map[status] ?? status;
}

export function levelLabel(level: string | null | undefined): string {
  const map: Record<string, string> = {
    critical: "紧急",
    high: "高优",
    medium: "中优",
    low: "低优"
  };

  return level ? map[level] ?? level : "-";
}

export function qualityStatusLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    ok: "完整",
    partial: "部分缺失",
    empty: "空数据"
  };

  return status ? map[status] ?? status : "-";
}

export function changeLabel(change: string): string {
  const map: Record<string, string> = {
    new_top_100: "进入 Top 100",
    new_top_50: "进入 Top 50",
    new_top_20: "进入 Top 20",
    dropped_top_100: "跌出 Top 100",
    dropped_top_50: "跌出 Top 50",
    dropped_top_20: "跌出 Top 20",
    major_rank_up: "排名大幅上升",
    major_rank_down: "排名大幅下降",
    new_deal: "New Deal",
    new_product_breakout: "新品爆发",
    price_drop: "降价",
    significant_price_drop: "大幅降价",
    price_rise: "涨价",
    significant_price_rise: "大幅涨价",
    new_coupon: "New Coupon",
    coupon_disappeared: "Coupon Ended",
    coupon_strengthened: "Coupon Stronger",
    coupon_weakened: "Coupon Weaker",
    new_sponsored: "新增广告位",
    sponsored_disappeared: "广告位结束",
    new_competitor: "新增竞品",
    new_asin_entered: "新增 ASIN",
    dropped_competitor: "掉出结果页",
    dropped_from_results: "掉出结果页",
    historical_low: "历史低价",
    entered_top_10: "进入 Top 10",
    entered_top_20: "进入 Top 20",
    rank_up: "排名上升",
    rank_down: "排名下降",
    new_entry: "新进榜单",
    dropped: "掉出榜单",
    unchanged: "无变化",
    coupon_start: "Coupon Start",
    coupon_end: "Coupon End",
    coupon_increase: "Coupon Stronger",
    deal_start: "Deal Start",
    deal_end: "Deal End",
    review_growth: "Review Growth",
    rank_surge: "排名猛升",
    new_entry_top100: "进入 Top 100",
    new_entry_top50: "进入 Top 50",
    brand_matrix_push: "品牌矩阵推进",
    activity_end_rank_drop: "活动结束后掉位",
    bsr_new_entry: "BSR New Entry",
    bsr_fast_rise: "BSR Fast Rise",
    bsr_rank_drop: "BSR Rank Drop",
    bsr_dropped: "BSR Dropped",
    price_drop_rank_lift: "降价带动排名",
    coupon_rank_lift: "Coupon Rank Lift",
    deal_rank_lift: "Deal Rank Lift",
    brand_push: "品牌推动"
  };

  return map[change] ?? change;
}

export function competitorSourceLabel(source: string): string {
  const map: Record<string, string> = {
    keyword: "关键词",
    category: "类目榜单",
    hybrid: "混合"
  };

  return map[source] ?? source;
}

export function competitorTierLabel(tier: string): string {
  const map: Record<string, string> = {
    core: "核心",
    rising: "上升",
    activity: "活动",
    watch: "观察"
  };

  return map[tier] ?? tier;
}
