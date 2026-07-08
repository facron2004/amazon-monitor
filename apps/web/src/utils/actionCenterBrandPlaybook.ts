import type { BrandPlaybookProfile } from "@amazon-monitor/shared";

export type BrandPlaybookTacticKey = "priceBand" | "coupon" | "activity" | "launch" | "surgeCycle";
export type BrandPlaybookTacticTone = "success" | "warning" | "danger" | "info";
export type BrandPlaybookActivityMixKey = "rankSurge" | "priceDrop" | "coupon" | "deal" | "reviewGrowth" | "brandMatrix";

export interface BrandPlaybookTactic {
  key: BrandPlaybookTacticKey;
  label: string;
  title: string;
  detail: string;
  tone: BrandPlaybookTacticTone;
  strength: number;
}

export interface BrandPlaybookActivityMixRow {
  key: BrandPlaybookActivityMixKey;
  label: string;
  value: number;
  percent: number;
  color: string;
}

const activityMixSpecs: Array<{
  key: BrandPlaybookActivityMixKey;
  label: string;
  color: string;
  value: (profile: BrandPlaybookProfile) => number;
}> = [
  { key: "rankSurge", label: "排名上升", color: "#2563eb", value: (profile) => profile.activityFrequency.rankSurgeCount },
  { key: "priceDrop", label: "价格下探", color: "#f97316", value: (profile) => profile.activityFrequency.priceDropCount },
  { key: "coupon", label: "Coupon", color: "#7c3aed", value: (profile) => profile.activityFrequency.couponEventCount },
  { key: "deal", label: "Deal", color: "#0f766e", value: (profile) => profile.activityFrequency.dealEventCount },
  { key: "reviewGrowth", label: "Review 增长", color: "#64748b", value: (profile) => profile.activityFrequency.reviewGrowthCount },
  {
    key: "brandMatrix",
    label: "品牌矩阵",
    color: "#db2777",
    value: (profile) => profile.activityFrequency.brandMatrixPushCount + profile.activityFrequency.brandMatrixDropCount
  }
];

export function getBrandPlaybookTactics(profile: BrandPlaybookProfile): BrandPlaybookTactic[] {
  return [
    buildPriceBandTactic(profile),
    buildCouponTactic(profile),
    buildActivityTactic(profile),
    buildLaunchTactic(profile),
    buildSurgeCycleTactic(profile)
  ];
}

export function getBrandPlaybookActivityMix(profile: BrandPlaybookProfile): BrandPlaybookActivityMixRow[] {
  const rawRows = activityMixSpecs
    .map((spec) => ({
      key: spec.key,
      label: spec.label,
      value: Math.max(0, spec.value(profile)),
      color: spec.color
    }))
    .filter((row) => row.value > 0);
  const total = rawRows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return [];

  const percentByKey = allocateRoundedPercents(rawRows.map((row) => ({
    key: row.key,
    value: row.value
  })));

  return rawRows
    .map((row) => ({
      ...row,
      percent: percentByKey.get(row.key) ?? 0
    }))
    .sort((left, right) => right.value - left.value || activityMixOrder(left.key) - activityMixOrder(right.key));
}

function buildPriceBandTactic(profile: BrandPlaybookProfile): BrandPlaybookTactic {
  const band = profile.commonPriceBand;
  const hasPriceEvidence = band.minPrice !== null && band.maxPrice !== null;
  return {
    key: "priceBand",
    label: "价格带",
    title: hasPriceEvidence ? `${formatMoney(band.minPrice)} - ${formatMoney(band.maxPrice)}` : "价格带证据不足",
    detail: hasPriceEvidence
      ? `${band.sampleSize} 条价格记录 / 中位价 ${formatMoney(band.medianPrice)}`
      : "价格历史不足，暂不判断该品牌常用价格带。",
    tone: hasPriceEvidence ? "info" : "success",
    strength: clampPercent(band.sampleSize * 8)
  };
}

function buildCouponTactic(profile: BrandPlaybookProfile): BrandPlaybookTactic {
  const coupon = profile.couponIntensity;
  const activeRate = coupon.activeRate ?? 0;
  const strength = clampPercent(Math.round(activeRate * 100));
  const tone: BrandPlaybookTacticTone = activeRate >= 0.3 || coupon.couponEventCount >= 2 ? "warning" : "success";
  return {
    key: "coupon",
    label: "Coupon",
    title: tone === "warning" ? "Coupon 拉动明显" : "Coupon 依赖较低",
    detail: `${formatPercent(coupon.activeRate)} ASIN-天处于 Coupon 状态 / ${coupon.couponEventCount} 次 Coupon 事件`,
    tone,
    strength
  };
}

function buildActivityTactic(profile: BrandPlaybookProfile): BrandPlaybookTactic {
  const activity = profile.activityFrequency;
  const strength = clampPercent(Math.round(activity.dailyAverage * 40));
  const tone: BrandPlaybookTacticTone = activity.dailyAverage >= 1 ? "warning" : activity.dailyAverage > 0 ? "info" : "success";
  return {
    key: "activity",
    label: "活动节奏",
    title: activity.dailyAverage >= 1 ? "高频动作品牌" : "动作节奏可观察",
    detail: `${activity.totalEvents} 次证据事件 / ${activity.dailyAverage}/天 / Deal ${activity.dealEventCount} 次`,
    tone,
    strength
  };
}

function buildLaunchTactic(profile: BrandPlaybookProfile): BrandPlaybookTactic {
  const launch = profile.newProductLaunchFrequency;
  const strength = clampPercent(launch.newEntryCount * 25 + launch.newEntryDays * 10);
  const tone: BrandPlaybookTacticTone = launch.newEntryCount >= 2 || launch.newEntryDays >= 2 ? "warning" : launch.newEntryCount > 0 ? "info" : "success";
  return {
    key: "launch",
    label: "新品节奏",
    title: launch.newEntryCount > 0 ? "存在新品上榜动作" : "暂未发现新品冲榜",
    detail: `${launch.newEntryCount} 个新进 ASIN / ${launch.newEntryDays} 个上榜日`,
    tone,
    strength
  };
}

function buildSurgeCycleTactic(profile: BrandPlaybookProfile): BrandPlaybookTactic {
  const cycle = profile.surgeCycle;
  const strength = clampPercent(cycle.surgeDays * 18 + cycle.dropDays * 12);
  const tone: BrandPlaybookTacticTone = cycle.dropDays > 0 ? "danger" : cycle.surgeDays > 0 ? "warning" : "success";
  return {
    key: "surgeCycle",
    label: "冲榜周期",
    title: cycle.surgeDays > 0 ? "存在冲榜节奏" : "暂未形成冲榜节奏",
    detail: `${cycle.surgeDays} 天上攻 / ${cycle.dropDays} 天回落`,
    tone,
    strength
  };
}

function formatMoney(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 1000) / 10}%`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function activityMixOrder(key: BrandPlaybookActivityMixKey): number {
  return activityMixSpecs.findIndex((spec) => spec.key === key);
}

function allocateRoundedPercents(rows: Array<{ key: BrandPlaybookActivityMixKey; value: number }>): Map<BrandPlaybookActivityMixKey, number> {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const parts = rows.map((row) => {
    const exact = (row.value / total) * 100;
    return {
      key: row.key,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact)
    };
  });
  const allocated = new Map(parts.map((part) => [part.key, part.floor]));
  const remaining = 100 - parts.reduce((sum, part) => sum + part.floor, 0);
  const bonus = [...parts]
    .sort((left, right) => right.remainder - left.remainder || activityMixOrder(left.key) - activityMixOrder(right.key))
    .slice(0, remaining);

  for (const part of bonus) {
    allocated.set(part.key, (allocated.get(part.key) ?? 0) + 1);
  }

  return allocated;
}
