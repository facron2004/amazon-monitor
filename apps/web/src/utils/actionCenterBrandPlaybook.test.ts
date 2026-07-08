import { describe, expect, it } from "vitest";
import type { BrandPlaybookProfile } from "@amazon-monitor/shared";
import { getBrandPlaybookActivityMix, getBrandPlaybookTactics } from "./actionCenterBrandPlaybook";

function makeProfile(overrides: Partial<BrandPlaybookProfile> = {}): BrandPlaybookProfile {
  return {
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    brand: "Acme",
    endDate: "2026-06-20",
    windowDays: 30,
    observedDays: 12,
    latestEvidenceDate: "2026-06-20",
    commonPriceBand: {
      sampleSize: 12,
      minPrice: 109.99,
      maxPrice: 249.99,
      averagePrice: 179.5,
      medianPrice: 169.99
    },
    couponIntensity: {
      sampleSize: 12,
      activeAsinDays: 5,
      activeRate: 0.42,
      couponEventCount: 3,
      averageDiscountValue: 18,
      averageDiscountRate: 0.12
    },
    activityFrequency: {
      totalEvents: 18,
      dailyAverage: 1.2,
      rankSurgeCount: 5,
      priceDropCount: 4,
      couponEventCount: 3,
      dealEventCount: 2,
      reviewGrowthCount: 1,
      brandMatrixPushCount: 2,
      brandMatrixDropCount: 1
    },
    asinCountChanges: {
      firstSnapshotDate: "2026-05-22",
      latestSnapshotDate: "2026-06-20",
      firstTop100Count: 2,
      latestTop100Count: 5,
      top100Change: 3,
      latestTop50Count: 3,
      latestTop20Count: 1
    },
    newProductLaunchFrequency: {
      newEntryCount: 3,
      newEntryDays: 2,
      dailyAverage: 0.1
    },
    surgeCycle: {
      surgeDays: 4,
      dropDays: 1,
      lastSurgeDate: "2026-06-19",
      lastDropDate: "2026-06-20"
    },
    historicalStrongAsins: [],
    evidenceItems: ["观察窗口 2026-05-22 至 2026-06-20"],
    ...overrides
  };
}

describe("action center brand playbook tactics", () => {
  it("turns brand playbook evidence into reader-facing tactics", () => {
    const tactics = getBrandPlaybookTactics(makeProfile());

    expect(tactics.map((tactic) => tactic.key)).toEqual(["priceBand", "coupon", "activity", "launch", "surgeCycle"]);
    expect(tactics.find((tactic) => tactic.key === "coupon")).toMatchObject({
      title: "Coupon 拉动明显",
      tone: "warning",
      strength: 42
    });
    expect(tactics.find((tactic) => tactic.key === "activity")).toMatchObject({
      title: "高频动作品牌",
      tone: "warning"
    });
    expect(tactics.find((tactic) => tactic.key === "launch")).toMatchObject({
      title: "存在新品上榜动作",
      tone: "warning"
    });
    expect(tactics.find((tactic) => tactic.key === "surgeCycle")).toMatchObject({
      title: "存在冲榜节奏",
      tone: "danger"
    });
  });

  it("keeps sparse profiles explicit instead of inventing a tactic", () => {
    const tactics = getBrandPlaybookTactics(makeProfile({
      commonPriceBand: { sampleSize: 0, minPrice: null, maxPrice: null, averagePrice: null, medianPrice: null },
      couponIntensity: { sampleSize: 0, activeAsinDays: 0, activeRate: null, couponEventCount: 0, averageDiscountValue: null, averageDiscountRate: null },
      activityFrequency: { totalEvents: 0, dailyAverage: 0, rankSurgeCount: 0, priceDropCount: 0, couponEventCount: 0, dealEventCount: 0, reviewGrowthCount: 0, brandMatrixPushCount: 0, brandMatrixDropCount: 0 },
      newProductLaunchFrequency: { newEntryCount: 0, newEntryDays: 0, dailyAverage: 0 },
      surgeCycle: { surgeDays: 0, dropDays: 0, lastSurgeDate: null, lastDropDate: null }
    }));

    expect(tactics.find((tactic) => tactic.key === "priceBand")).toMatchObject({
      title: "价格带证据不足",
      tone: "success",
      strength: 0
    });
    expect(tactics.find((tactic) => tactic.key === "coupon")).toMatchObject({
      title: "Coupon 依赖较低",
      tone: "success",
      strength: 0
    });
    expect(tactics.find((tactic) => tactic.key === "surgeCycle")).toMatchObject({
      title: "暂未形成冲榜节奏",
      tone: "success"
    });
  });

  it("builds an activity mix from existing brand evidence", () => {
    expect(getBrandPlaybookActivityMix(makeProfile())).toEqual([
      { key: "rankSurge", label: "排名上升", value: 5, percent: 28, color: "#2563eb" },
      { key: "priceDrop", label: "价格下探", value: 4, percent: 22, color: "#f97316" },
      { key: "coupon", label: "Coupon", value: 3, percent: 17, color: "#7c3aed" },
      { key: "brandMatrix", label: "品牌矩阵", value: 3, percent: 17, color: "#db2777" },
      { key: "deal", label: "Deal", value: 2, percent: 11, color: "#0f766e" },
      { key: "reviewGrowth", label: "Review 增长", value: 1, percent: 5, color: "#64748b" }
    ]);
  });

  it("keeps the activity mix empty when there is no activity evidence", () => {
    expect(getBrandPlaybookActivityMix(makeProfile({
      activityFrequency: {
        totalEvents: 0,
        dailyAverage: 0,
        rankSurgeCount: 0,
        priceDropCount: 0,
        couponEventCount: 0,
        dealEventCount: 0,
        reviewGrowthCount: 0,
        brandMatrixPushCount: 0,
        brandMatrixDropCount: 0
      }
    }))).toEqual([]);
  });
});
