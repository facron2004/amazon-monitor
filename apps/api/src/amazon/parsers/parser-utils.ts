/**
 * Canonical shared helper functions for Amazon parsers.
 *
 * These pure functions are the single source of truth for logic that is
 * duplicated across search-card-parser, bestseller-card-parser, and
 * product-detail-parser.
 *
 * Because Playwright's page.evaluate() serializes the function it receives,
 * the parser files cannot import these at runtime inside evaluate(). Instead
 * each parser keeps an inlined copy and references this module in a comment:
 *   // Shared logic from parser-utils.ts (inlined for page.evaluate)
 *
 * Any non-evaluate code (tests, transform pipelines, etc.) should import
 * directly from this module to avoid drift.
 */

// ── Coupon & deal regex patterns ────────────────────────────────────────

export function couponPatterns(): RegExp[] {
  return [
    // Standard coupon patterns
    /\bSave\s+(?:an?\s+)?(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+with\s+coupon\b/i,
    /\b(?:Apply|Clip|Redeem|Use)\s+(?:an?\s+)?(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)?\s*coupon\b/i,
    /\b(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+(?:off\s+)?(?:with\s+)?coupon\b/i,
    // Extra coupon savings
    /\bExtra\s+(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|[\d.]+%)\s+off\s+(?:with\s+)?coupon\b/i,
    /\bSave\s+(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|[\d.]+%)\s+coupon\b/i,
    /\bclip\s+coupon\b/i,
    // Coupon applied automatically
    /\bcoupon\s+applied\s+(?:automatically\s+)?at\s+checkout\b/i,
    /\b(?:[$\u20AC\u00A3\u00A5]\s*[\d,.]+|[\d.]+%)\s+coupon\s+applied\b/i,
    /\b(?:with|use|redeem)\s+(?:this\s+)?coupon\b/i
  ];
}

export function dealPatterns(): RegExp[] {
  return [
    // Specific deal types (含 Prime Day / Big Deal Days 等亚马逊活动变体)
    /\b(?:limited\s+time\s+deal|prime[\s-]*exclusive\s+(?:deal|savings)|prime[\s-]*day'?s?[\s-]*(?:deals?|exclusive|savings|sale)|prime[\s-]*big[\s-]*deal[\s-]*days?|prime[\s-]*early[\s-]*access[\s-]*deal|prime[\s-]*member[\s-]*exclusive[\s-]*deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b/i,
    // Today's deals
    /\btoday'?s\s+deals?\b/i,
    // Deal badges
    /\b(?:hot\s+deal|special\s+deal|limited\s+offer)\b/i,
    // Save percentage patterns
    /\bSave\s+[\d.]+%\s+(?:on\s+)?(?:this\s+)?(?:item|product)?\b/i,
    // Limited time patterns
    /\blimited\s+time\b/i,
    // Generic deal (only if standalone)
    /^deal$/i
  ];
}

// ── Price & number parsing ──────────────────────────────────────────────

export function parsePrice(value: string): number | null {
  // Strip currency symbols and whitespace to get a clean numeric string.
  let cleaned = value.replace(/[$\u20AC\u00A3\u00A5]/g, "").replace(/[\s\u00A0]/g, "");

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // European format: dot = thousands, comma = decimal (e.g. "1.299,99")
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: comma = thousands, dot = decimal (e.g. "1,299.99")
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only commas present — determine if decimal or thousands separator.
    if (/,\d{1,2}$/.test(cleaned)) {
      // Comma followed by 1-2 digits at end → European decimal (e.g. "29,99")
      cleaned = cleaned.replace(",", ".");
    } else {
      // Otherwise treat as US thousands separator (e.g. "1,299")
      cleaned = cleaned.replace(/,/g, "");
    }
  }
  // Only dots or neither → already handled by the regex below.

  const match = cleaned.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function inferCurrency(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (/HKD/i.test(trimmed)) return "HKD";
  if (/USD/i.test(trimmed)) return "USD";
  if (/CAD/i.test(trimmed)) return "CAD";
  if (/AUD/i.test(trimmed)) return "AUD";
  if (/GBP/i.test(trimmed)) return "GBP";
  if (/EUR/i.test(trimmed)) return "EUR";
  if (/JPY/i.test(trimmed)) return "JPY";
  const match = trimmed.match(/[$\u00A3\u20AC\u00A5]/);
  if (match?.[0] === "\u00A3") return "GBP";
  if (match?.[0] === "\u20AC") return "EUR";
  if (match?.[0] === "\u00A5") return "JPY";
  return match?.[0] ?? "$";
}

export function parseRating(value: string): number | null {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

export function parseInteger(value: string): number | null {
  const match = value.replace(/,/g, "").match(/([0-9]+)/);
  return match ? Number(match[1]) : null;
}

// ── Promo text processing ───────────────────────────────────────────────

export function cleanPromoText(value: string): string | null {
  const text = value.replace(/\s+/g, " ").replace(/\bDetails\b.*$/i, "").trim();
  return text && text.length <= 90 ? text : null;
}

export function promoMatch(value: string, patterns: RegExp[]): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, " ").trim();
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const candidates = compact.length <= 180 ? [compact] : [];
  for (let index = 0; index < lines.length; index += 1) {
    candidates.push(lines[index]);
    if (lines[index + 1]) {
      candidates.push(`${lines[index]} ${lines[index + 1]}`);
    }
  }
  for (const text of Array.from(new Set(candidates))) {
    if (!text || text.length > 180) continue;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const candidate = cleanPromoText(match?.[0] ?? (pattern.test(text) ? text : ""));
      if (candidate) return candidate;
    }
  }
  return null;
}

// ── URL & ASIN helpers ──────────────────────────────────────────────────

export function extractAsin(value: string): string {
  const match =
    value.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) ??
    value.match(/\b([A-Z0-9]{10})\b/i);
  return match?.[1]?.toUpperCase() ?? "";
}

/**
 * Resolve a potentially relative URL against an origin.
 * Inside page.evaluate the origin comes from window.location.origin;
 * outside the browser an explicit origin can be supplied.
 */
export function absolutize(href: string, origin: string = "https://www.amazon.com"): string {
  try {
    return new URL(href, origin).toString();
  } catch {
    return href;
  }
}

// ── Array helpers ───────────────────────────────────────────────────────

export function uniqueElements<T>(elements: T[]): T[] {
  return Array.from(new Set(elements));
}

// ── String normalization ────────────────────────────────────────────────

export function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// ── Review text helpers ─────────────────────────────────────────────────

export function reviewCandidate(value: string): string {
  const text = normalizeSpace(value);
  if (!text) {
    return "";
  }
  const labelled = text.match(/([\d,]+)\s*(?:customer\s+)?(?:ratings?|reviews?)\b/i);
  if (labelled) {
    return labelled[1];
  }
  if (/out of\s*5/i.test(text)) {
    return "";
  }
  return "";
}

export function findReviewText(root: HTMLElement): string {
  const candidates: string[] = [];
  const reviewElements = uniqueElements(
    Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href*="customerReviews"], a[href*="product-reviews"], a[href*="#customerReviews"], a[href*="cm_cr"], [aria-label*="rating" i], [aria-label*="review" i], [title*="rating" i], [title*="review" i]'
      )
    )
  );

  for (const element of reviewElements) {
    const ariaLabel = element.getAttribute("aria-label") ?? "";
    const title = element.getAttribute("title") ?? "";
    const text = `${ariaLabel} ${title} ${element.innerText ?? ""} ${element.textContent ?? ""}`;
    if (!/\b(?:ratings?|reviews?)\b/i.test(text)) {
      continue;
    }
    candidates.push(ariaLabel, title, element.innerText ?? "", element.textContent ?? "");
  }

  for (const candidate of candidates) {
    const value = reviewCandidate(candidate);
    if (value) return value;
  }

  const lines = root.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const value = reviewCandidate(line);
    if (value && /\b(?:ratings?|reviews?)\b/i.test(line)) return value;
  }

  return "";
}
