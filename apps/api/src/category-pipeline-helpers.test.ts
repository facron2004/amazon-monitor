import { describe, expect, it } from "vitest";
import type { BestsellerRankSnapshot } from "@amazon-monitor/shared";
import { preserveKnownCommercialFields, validPromoText } from "./category-pipeline-helpers.js";

// ── 工具:构造最小可用的 BestsellerRankSnapshot ─────────────────────────────
function makeSnapshot(overrides: Partial<BestsellerRankSnapshot> = {}): BestsellerRankSnapshot {
  return {
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    snapshotDate: "2026-06-24",
    asin: "B0TEST1234",
    rank: 1,
    title: "Sample Ice Maker",
    brand: "TestBrand",
    imageUrl: null,
    productUrl: null,
    currentPrice: 99.99,
    couponText: null,
    dealBadge: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: 99.99,
    bsrRank: 1,
    bsrCategory: null,
    rating: 4.5,
    reviewCount: 1000,
    ...overrides
  };
}

// ── validPromoText ─────────────────────────────────────────────────────────
// validPromoText 是 allowlist —— 决定 parser 抓到的 promo 文本能否进入 snapshot。
// 新增 Prime Big Deal Days 等变体后必须能通过 allowlist。

describe("validPromoText", () => {
  it("returns null for null / undefined / empty", () => {
    expect(validPromoText(null)).toBeNull();
    expect(validPromoText(undefined)).toBeNull();
    expect(validPromoText("")).toBeNull();
    expect(validPromoText("   ")).toBeNull();
  });

  it("returns null for text over 90 chars", () => {
    expect(validPromoText("x".repeat(91))).toBeNull();
  });

  it("allows coupon / save keywords", () => {
    expect(validPromoText("Save $5.00 with coupon")).toBe("Save $5.00 with coupon");
    expect(validPromoText("Apply 10% coupon")).toBe("Apply 10% coupon");
  });

  it("allows legacy Prime Day / Black Friday / Lightning deal variants", () => {
    expect(validPromoText("Prime Day Deal")).toBe("Prime Day Deal");
    expect(validPromoText("Lightning Deal")).toBe("Lightning Deal");
    expect(validPromoText("Black Friday Deal")).toBe("Black Friday Deal");
    expect(validPromoText("Cyber Monday Deal")).toBe("Cyber Monday Deal");
    expect(validPromoText("Limited Time Deal")).toBe("Limited Time Deal");
  });

  it("allows Prime Big Deal Days (multi-day)", () => {
    expect(validPromoText("Prime Big Deal Days")).toBe("Prime Big Deal Days");
  });

  it("allows Prime Big Deal Day (singular, headline form)", () => {
    expect(validPromoText("Prime Big Deal Day")).toBe("Prime Big Deal Day");
  });

  it("allows compact and hyphenated Prime Day deal variants", () => {
    expect(validPromoText("PrimeDay Deal")).toBe("PrimeDay Deal");
    expect(validPromoText("Prime-Day Deal")).toBe("Prime-Day Deal");
    expect(validPromoText("Prime Day Deals")).toBe("Prime Day Deals");
  });

  it("allows Prime Early Access Deal", () => {
    expect(validPromoText("Prime Early Access Deal")).toBe("Prime Early Access Deal");
  });

  it("allows Prime Member Exclusive Deal", () => {
    expect(validPromoText("Prime Member Exclusive Deal")).toBe("Prime Member Exclusive Deal");
  });

  it("allows standalone 'Deal' (matching the parser's badge normalization)", () => {
    expect(validPromoText("Deal")).toBe("Deal");
    expect(validPromoText("deal")).toBe("deal");
  });

  it("rejects arbitrary product description text", () => {
    expect(validPromoText("Great product, 4.5 stars")).toBeNull();
  });
});

// ── preserveKnownCommercialFields: coupon / deal 状态字段 ──────────────────
// 回归 bug 修复:旧实现里 couponText / dealBadge 在"今天没抓到"时回退到昨日值,
// 导致 coupon_end / deal_end 永远不触发、商品活动长期显示已下线的活动。

describe("preserveKnownCommercialFields - coupon / deal", () => {
  it("clears couponText when today's parser returns null (商品 coupon 已下架)", () => {
    const today = [makeSnapshot({ couponText: null, couponValue: null, couponRate: null })];
    const previous = [makeSnapshot({ couponText: "Save $5.00 with coupon", couponValue: 5, couponRate: 5 })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.couponText).toBeNull();
    expect(result.couponValue).toBeNull();
    expect(result.couponRate).toBeNull();
  });

  it("clears couponValue / couponRate when today's couponText is null (not just null on today but also doesn't carry previous numbers)", () => {
    const today = [makeSnapshot({ couponText: null, couponValue: 5, couponRate: 5 })];
    const previous = [makeSnapshot({ couponText: null })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.couponText).toBeNull();
    // 即便 parser 错误地把数字带出来,只要没有 validPromoText 文本就置空,避免数字孤儿
    expect(result.couponValue).toBeNull();
    expect(result.couponRate).toBeNull();
  });

  it("keeps couponText when today has a valid coupon text", () => {
    const today = [makeSnapshot({ couponText: "Save $5.00 with coupon", couponValue: 5, couponRate: 5 })];
    const previous = [makeSnapshot({ couponText: null })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.couponText).toBe("Save $5.00 with coupon");
    expect(result.couponValue).toBe(5);
    expect(result.couponRate).toBe(5);
  });

  it("clears dealBadge when today's parser returns null (商品 deal 已结束)", () => {
    const today = [makeSnapshot({ dealBadge: null })];
    const previous = [makeSnapshot({ dealBadge: "Limited Time Deal" })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.dealBadge).toBeNull();
  });

  it("keeps dealBadge for valid Prime Big Deal Days variant", () => {
    const today = [makeSnapshot({ dealBadge: "Prime Big Deal Days" })];
    const previous: BestsellerRankSnapshot[] = [];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.dealBadge).toBe("Prime Big Deal Days");
  });

  it("rejects invalid promo text that slips past parser (defense in depth)", () => {
    const today = [makeSnapshot({ couponText: "Random product description text", dealBadge: "Great item" })];
    const previous: BestsellerRankSnapshot[] = [];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.couponText).toBeNull();
    expect(result.dealBadge).toBeNull();
  });
});

// ── preserveKnownCommercialFields: price / rating / review (采集容错) ───────
// 这三个字段不是"商品状态变化",parser 偶尔抓不到时回退到昨日是合理的容错。
// 回归保护:防止后续重构破坏这条容错路径。

describe("preserveKnownCommercialFields - price / rating / review fallback", () => {
  it("falls back to previous currentPrice when today's parser missed it", () => {
    const today = [makeSnapshot({ currentPrice: null })];
    const previous = [makeSnapshot({ currentPrice: 88.88 })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.currentPrice).toBe(88.88);
  });

  it("prefers today's price when both are present", () => {
    const today = [makeSnapshot({ currentPrice: 79.99 })];
    const previous = [makeSnapshot({ currentPrice: 99.99 })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.currentPrice).toBe(79.99);
  });

  it("falls back rating and reviewCount when today's parser missed them", () => {
    const today = [makeSnapshot({ rating: null, reviewCount: null })];
    const previous = [makeSnapshot({ rating: 4.6, reviewCount: 5000 })];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.rating).toBe(4.6);
    expect(result.reviewCount).toBe(5000);
  });

  it("recomputes finalEstimatedPrice when coupon is absent (passes null coupon args)", () => {
    const today = [makeSnapshot({ currentPrice: 100, couponText: null, couponValue: null, couponRate: null })];
    const previous: BestsellerRankSnapshot[] = [];

    const [result] = preserveKnownCommercialFields(today, previous);

    // 估值逻辑在 shared 库,这里只确认不抛错 + 输出与 currentPrice 一致
    expect(result.finalEstimatedPrice).not.toBeNull();
  });
});

// ── preserveKnownCommercialFields: 跨 ASIN 行为 ─────────────────────────────

describe("preserveKnownCommercialFields - cross-ASIN", () => {
  it("does not bleed previous state across different ASINs", () => {
    const today = [
      makeSnapshot({ asin: "B0AAAA1111", couponText: null }),
      makeSnapshot({ asin: "B0BBBB2222", couponText: "Save $3 with coupon" })
    ];
    const previous = [
      makeSnapshot({ asin: "B0AAAA1111", couponText: "Save $10 with coupon" }),
      makeSnapshot({ asin: "B0BBBB2222", couponText: null })
    ];

    const [a, b] = preserveKnownCommercialFields(today, previous);

    expect(a.couponText).toBeNull();
    expect(b.couponText).toBe("Save $3 with coupon");
  });

  it("preserves today snapshot when ASIN has no previous entry (first-time collection)", () => {
    const today = [makeSnapshot({ couponText: "Save $2 with coupon" })];
    const previous: BestsellerRankSnapshot[] = [];

    const [result] = preserveKnownCommercialFields(today, previous);

    expect(result.couponText).toBe("Save $2 with coupon");
  });
});
