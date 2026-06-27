export function validCouponText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && text.length <= 90 && /\b(coupon|save)\b/i.test(text) ? text : null;
}

export function validDealBadge(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text &&
    text.length <= 90 &&
    /\b(limited\s+time\s+deal|prime[\s-]*exclusive\s+(?:deal|savings)|prime[\s-]*day'?s?[\s-]*(?:deals?|exclusive|savings|sale)|prime[\s-]*big[\s-]*deal[\s-]*days?|prime[\s-]*early[\s-]*access[\s-]*deal|prime[\s-]*member[\s-]*exclusive[\s-]*deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b|^deal$/i.test(text)
    ? text
    : null;
}

export function promoText(item: { couponText?: string | null; dealBadge?: string | null } | null | undefined): string | null {
  const values = [validCouponText(item?.couponText), validDealBadge(item?.dealBadge)].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" / ") : null;
}
