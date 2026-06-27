import type { ProductActivityCalendar } from "@amazon-monitor/shared";

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function localizeCouponLabel(text: string): string {
  const normalized = normalizeSpace(text);
  const rules: Array<[RegExp, string]> = [
    [/^save\s+(\$[\d.]+)\s+with\s+coupon$/i, "Save $1 with Coupon"],
    [/^save\s+(\d+%)\s+with\s+coupon$/i, "Save $1 with Coupon"],
    [/^apply\s+(\$[\d.]+)\s+coupon$/i, "Apply $1 Coupon"],
    [/^(\d+%)\s+coupon$/i, "$1 Coupon"]
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, replacement);
    }
  }

  return normalized
    .replace(/\bcoupon\b/gi, "Coupon")
    .replace(/^save\b/i, "Save")
    .replace(/^apply\b/i, "Apply");
}

export function localizeDealLabel(text: string): string {
  const normalized = normalizeSpace(text);
  const rules: Array<[RegExp, string]> = [
    [/^limited\s+time\s+deal$/i, "Limited Time Deal"],
    [/^prime[\s-]*day'?s?[\s-]*deals?$/i, "Prime Day Deal"],
    [/^prime[\s-]*day'?s?[\s-]*(?:exclusive|savings|sale)$/i, "Prime Day Deal"],
    [/^prime[\s-]*big[\s-]*deal[\s-]*days?$/i, "Prime Big Deal Days"],
    [/^prime[\s-]*exclusive[\s-]*(?:deal|savings)$/i, "Prime Exclusive Deal"],
    [/^prime[\s-]*early[\s-]*access[\s-]*deal$/i, "Prime Early Access Deal"],
    [/^prime[\s-]*member[\s-]*exclusive[\s-]*deal$/i, "Prime Member Exclusive Deal"],
    [/^deal\s+of\s+the\s+day$/i, "Deal of the Day"],
    [/^lightning\s+deal$/i, "Lightning Deal"],
    [/^black\s+friday\s+deal$/i, "Black Friday Deal"],
    [/^cyber\s+monday\s+deal$/i, "Cyber Monday Deal"],
    [/^deal$/i, "Deal"]
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, replacement);
    }
  }

  return normalized.replace(/\bdeal\b/gi, "Deal");
}

export function validCouponText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && text.length <= 90 && /\b(coupon|save)\b/i.test(text) ? localizeCouponLabel(text) : null;
}

export function validDealBadge(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text &&
    text.length <= 90 &&
    /\b(limited\s+time\s+deal|prime[\s-]*exclusive\s+(?:deal|savings)|prime[\s-]*day'?s?[\s-]*(?:deals?|exclusive|savings|sale)|prime[\s-]*big[\s-]*deal[\s-]*days?|prime[\s-]*early[\s-]*access[\s-]*deal|prime[\s-]*member[\s-]*exclusive[\s-]*deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b|^deal$/i.test(text)
    ? localizeDealLabel(text)
    : null;
}

export function promoText(item: { couponText?: string | null; dealBadge?: string | null }): string {
  const values = [validCouponText(item.couponText), validDealBadge(item.dealBadge)].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" / ") : "-";
}

export function activityDayPromoText(day: ProductActivityCalendar["days"][number]): string {
  return promoText({
    couponText: day.categoryRanks[0]?.couponText ?? day.keywordRanks[0]?.couponText ?? null,
    dealBadge: day.categoryRanks[0]?.dealBadge ?? day.keywordRanks[0]?.dealBadge ?? null
  });
}
