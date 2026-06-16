import type { IceTypeTag, NullableNumber, ProductRanking } from "./types.js";
import { roundCurrency } from "./report-formatters.js";

export function selectSpecificBestsellerRank(ranks: ProductRanking[] | null | undefined): ProductRanking | null {
  if (!ranks?.length) {
    return null;
  }

  return ranks[ranks.length - 1] ?? null;
}

export function describeRankCoverageGaps(ranks: number[], expectedCount: number): string {
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    if (!Number.isFinite(rank) || rank <= 0) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  const missing: number[] = [];
  for (let rank = 1; rank <= expectedCount; rank += 1) {
    if (!counts.has(rank)) {
      missing.push(rank);
    }
  }
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([rank]) => rank)
    .sort((a, b) => a - b);

  return [rankListDetail("Missing ranks", missing), rankListDetail("Duplicate ranks", duplicates)].filter(Boolean).join(" ");
}

export function inferIceType(title: string | null | undefined): IceTypeTag {
  const text = (title ?? "").toLowerCase();
  if (/\bnugget\b|\bpellet\b|\bpebble\b|\bchewable\b/.test(text)) return "nugget";
  if (looksLikeBulletIceMaker(text)) return "bullet";
  if (/\bbullet\b/.test(text)) return "bullet";
  if (/\bclear\b/.test(text)) return "clear";
  if (/\bcrescent\b/.test(text)) return "crescent";
  if (/\bcrushed\b/.test(text)) return "crushed";
  if (/\bcube\b|\bcubed\b/.test(text)) return "cube";
  return "unknown";
}

function looksLikeBulletIceMaker(text: string): boolean {
  if (!/\b(?:portable|countertop)\b/.test(text)) {
    return false;
  }
  const fastCycle = /\b(?:in\s*)?(?:5|6|7|8|9|10|11|12|13)\s*(?:-|to)?\s*(?:5|6|7|8|9|10|11|12|13)?\s*(?:minute|minutes|mins?)\b/.test(text);
  if (!fastCycle) {
    return false;
  }
  if (/\b(?:8|9)\s+(?:ice\s+)?cubes?\b/.test(text)) {
    return true;
  }
  return /\bice\s+cubes?\s+ready\b/.test(text);
}

export function parseCoupon(couponText: string | null | undefined): {
  couponValue: NullableNumber;
  couponRate: NullableNumber;
} {
  if (!couponText) {
    return { couponValue: null, couponRate: null };
  }

  const amountMatch = couponText.match(/\$\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    return { couponValue: Number(amountMatch[1]), couponRate: null };
  }

  const percentMatch = couponText.match(/(\d+(?:\.\d+)?)\s*%/i);
  if (percentMatch) {
    return { couponValue: null, couponRate: Number(percentMatch[1]) / 100 };
  }

  return { couponValue: null, couponRate: null };
}

export function estimateFinalPrice(
  currentPrice: NullableNumber,
  couponValue: NullableNumber,
  couponRate: NullableNumber
): NullableNumber {
  if (currentPrice === null) {
    return null;
  }
  if (couponValue !== null) {
    return roundCurrency(Math.max(0, currentPrice - couponValue));
  }
  if (couponRate !== null) {
    return roundCurrency(Math.max(0, currentPrice * (1 - couponRate)));
  }
  return roundCurrency(currentPrice);
}

export function trustedPreviousReviewCount(current: NullableNumber, previous: NullableNumber): NullableNumber {
  if (current === null || previous === null) {
    return null;
  }
  if (current <= 0 || previous <= 0) {
    return null;
  }

  const delta = Math.abs(current - previous);
  const smaller = Math.min(current, previous);
  const larger = Math.max(current, previous);
  if (delta >= 1000 && larger / smaller >= 3) {
    return null;
  }

  return previous;
}

function rankListDetail(label: string, ranks: number[]): string | null {
  if (ranks.length === 0) {
    return null;
  }
  const shown = ranks.slice(0, 10).map((rank) => `#${rank}`).join(", ");
  const rest = ranks.length > 10 ? ` (+${ranks.length - 10} more)` : "";
  return `${label}: ${shown}${rest}.`;
}
