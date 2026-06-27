import type { SerpProductInput } from "@amazon-monitor/shared";
import {
  couponPatterns,
  dealPatterns,
  parsePrice,
  inferCurrency,
  parseRating,
  parseInteger,
  cleanPromoText,
  promoMatch,
  extractAsin,
  absolutize,
  uniqueElements,
  normalizeSpace,
  reviewCandidate,
  findReviewText
} from "./parser-utils.js";

// Re-export shared utils so consumers can import from the parser barrel.
export {
  couponPatterns,
  dealPatterns,
  parsePrice,
  inferCurrency,
  parseRating,
  parseInteger,
  cleanPromoText,
  promoMatch,
  extractAsin,
  absolutize,
  uniqueElements,
  normalizeSpace,
  reviewCandidate,
  findReviewText
};

export const SEARCH_CARD_SELECTOR = [
  '[data-component-type="s-search-result"][data-asin]',
  '[data-testid="product-card"]',
  ".s-result-item[data-asin]",
  '[data-asin]:not([data-asin=""])'
].join(", ");

export function extractSearchCards(): SerpProductInput[] {
  // Inlined from parser-utils.ts for page.evaluate serialization
  // ── DOM helpers inlined here so Playwright's page.evaluate() serialization includes them ──
  const h = {
    textOf(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLElement>(selector)?.innerText?.trim();
        if (value) return value;
      }
      return "";
    },
    firstHref(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLAnchorElement>(selector)?.getAttribute("href")?.trim();
        if (value) return value;
      }
      return "";
    },
    findCouponText(root: HTMLElement): string | null {
      return h.findPromoText(root, h.couponPatterns(), [
        '[id*="coupon" i]',
        '[class*="coupon" i]',
        '[aria-label*="coupon" i]',
        '[title*="coupon" i]',
        ".s-coupon-unclipped",
        ".s-coupon-clipped",
        ".s-coupon-highlight-color",
        ".couponBadge",
        '[data-a-badge-type="coupon"]',
        '[data-testid*="coupon" i]',
        '[data-cy*="coupon" i]',
        ".a-color-price",
        ".savingsPercentage"
      ]);
    },
    findDealBadge(root: HTMLElement): string | null {
      return h.findPromoText(root, h.dealPatterns(), [
        '[id*="deal" i]',
        '[class*="deal" i]',
        '[aria-label*="deal" i]',
        '[title*="deal" i]',
        ".a-badge-text",
        ".a-badge-label",
        ".a-badge-label-inner",
        ".s-label-popover-default",
        ".puis-label-popover-default",
        '[data-a-badge-type="deal"]',
        '[data-testid*="deal" i]',
        '[data-cy*="deal" i]',
        ".dealBadge"
      ]);
    },
    findPromoText(root: HTMLElement, patterns: RegExp[], selectors: string[]): string | null {
      const candidates: string[] = [];
      for (const element of Array.from(root.querySelectorAll<HTMLElement>(selectors.join(", ")))) {
        candidates.push(
          element.getAttribute("aria-label") ?? "",
          element.getAttribute("title") ?? "",
          element.innerText ?? "",
          element.textContent ?? ""
        );
      }
      const compactCandidates = candidates.map((candidate) => candidate.trim()).filter(Boolean);
      const promoCandidates = compactCandidates.flatMap((candidate, index) =>
        compactCandidates[index + 1] ? [candidate, `${candidate}\n${compactCandidates[index + 1]}`] : [candidate]
      );
      for (const candidate of promoCandidates) {
        const value = h.promoMatch(candidate, patterns);
        if (value) return value;
      }
      return null;
    },
    promoMatch(value: string, patterns: RegExp[]): string | null {
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
          const candidate = h.cleanPromoText(match?.[0] ?? (pattern.test(text) ? text : ""));
          if (candidate) return candidate;
        }
      }
      return null;
    },
    couponPatterns(): RegExp[] {
      return [
        // Standard coupon patterns
        /\bSave\s+(?:an?\s+)?(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+with\s+coupon\b/i,
        /\b(?:Apply|Clip|Redeem|Use)\s+(?:an?\s+)?(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)?\s*coupon\b/i,
        /\b(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+(?:off\s+)?(?:with\s+)?coupon\b/i,
        // Extra coupon savings
        /\bExtra\s+(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+off\s+(?:with\s+)?coupon\b/i,
        /\bSave\s+(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+coupon\b/i,
        /\bclip\s+coupon\b/i,
        // Coupon applied automatically
        /\bcoupon\s+applied\s+(?:automatically\s+)?at\s+checkout\b/i,
        /\b(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+coupon\s+applied\b/i,
        /\b(?:with|use|redeem)\s+(?:this\s+)?coupon\b/i
      ];
    },
    dealPatterns(): RegExp[] {
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
    },
    cleanPromoText(value: string): string | null {
      const text = value.replace(/\s+/g, " ").replace(/\bDetails\b.*$/i, "").trim();
      return text && text.length <= 90 ? text : null;
    },
    findRankLine(root: HTMLElement): string {
      return root.innerText.split("\n").map((l) => l.trim()).find((line) => /^#\s*\d+/.test(line)) ?? "";
    },
    extractAsin(value: string): string {
      const match = value.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) ?? value.match(/\b([A-Z0-9]{10})\b/i);
      return match?.[1]?.toUpperCase() ?? "";
    },
    absolutize(href: string): string {
      try { return new URL(href, window.location.origin).toString(); } catch { return href; }
    },
    parsePrice(value: string): number | null {
      let cleaned = value.replace(/[$\u20AC\u00A3\u00A5]/g, "").replace(/[\s\u00A0]/g, "");
      const lastDot = cleaned.lastIndexOf(".");
      const lastComma = cleaned.lastIndexOf(",");
      if (lastDot !== -1 && lastComma !== -1) {
        if (lastComma > lastDot) {
          cleaned = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
          cleaned = cleaned.replace(/,/g, "");
        }
      } else if (lastComma !== -1 && lastDot === -1) {
        if (/,\d{1,2}$/.test(cleaned)) {
          cleaned = cleaned.replace(",", ".");
        } else {
          cleaned = cleaned.replace(/,/g, "");
        }
      }
      const match = cleaned.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
      return match ? Number(match[1]) : null;
    },
    inferCurrency(value: string): string {
      const trimmed = value.trim().replace(/\s+/g, "");
      if (/HKD/i.test(trimmed)) return "HKD";
      if (/USD/i.test(trimmed)) return "USD";
      if (/CAD/i.test(trimmed)) return "CAD";
      if (/AUD/i.test(trimmed)) return "AUD";
      if (/GBP/i.test(trimmed)) return "GBP";
      if (/EUR/i.test(trimmed)) return "EUR";
      if (/JPY/i.test(trimmed)) return "JPY";
      const match = trimmed.match(/[$£€¥]/);
      if (match?.[0] === '£') return "GBP";
      if (match?.[0] === '€') return "EUR";
      if (match?.[0] === '¥') return "JPY";
      return match?.[0] ?? "$";
    },
    parseRating(value: string): number | null {
      const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
      return match ? Number(match[1]) : null;
    },
    parseInteger(value: string): number | null {
      const match = value.replace(/,/g, "").match(/([0-9]+)/);
      return match ? Number(match[1]) : null;
    },
    findReviewText(root: HTMLElement): string {
      const candidates: string[] = [];
      const reviewElements = h.uniqueElements(
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
        const value = h.reviewCandidate(candidate);
        if (value) return value;
      }

      const lines = root.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const value = h.reviewCandidate(line);
        if (value && /\b(?:ratings?|reviews?)\b/i.test(line)) return value;
      }

      return "";
    },
    reviewCandidate(value: string): string {
      const text = value.replace(/\s+/g, " ").trim();
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
    },
    inferBrand(title: string): string | null {
      const firstWord = title.trim().split(/\s+/)[0];
      return firstWord || null;
    },
    uniqueElements(elements: HTMLElement[]): HTMLElement[] {
      return Array.from(new Set(elements));
    },
    extractPriceFromInstructions(card: HTMLElement): string {
      const priceDiv = card.querySelector(".puis-price-instructions-style .a-row.a-size-base.a-color-base");
      if (priceDiv) {
        const text = (priceDiv as HTMLElement).innerText || "";
        const match = text.match(/(?:HKD|USD|GBP|EUR|CAD|AUD)?\s*[\$£€¥]?\s*([\d,]+(?:\.\d{1,2})?)/);
        if (match) return match[0].trim();
      }
      const cardText = card.innerText || "";
      const noFeaturedMatch = cardText.match(/(?:HKD|USD|GBP|EUR|CAD|AUD)?\s*[\$£€¥]?\s*([\d,]+(?:\.\d{1,2})?)\s*\(\d+\s*(?:used|offer)/i);
      if (noFeaturedMatch) return noFeaturedMatch[0].replace(/\(.*$/, "").trim();
      return "";
    },
    extractListPriceFromInstructions(card: HTMLElement): string {
      const priceDiv = card.querySelector(".puis-price-instructions-style .a-row.a-size-base.a-color-base");
      if (priceDiv) {
        const text = (priceDiv as HTMLElement).innerText || "";
        const match = text.match(/List:\s*(?:HKD|USD|GBP|EUR|CAD|AUD)?\s*[\$£€¥]?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (match) return match[0].replace(/^List:\s*/i, "").trim();
      }
      return "";
    }
  };
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-component-type="s-search-result"][data-asin]'));
  return cards
    .map<SerpProductInput | null>((card) => {
      const asin = card.getAttribute("data-asin")?.trim() ?? "";
      if (!asin) {
        return null;
      }

      const title = h.textOf(card, [
        '[data-cy="title-recipe"] h2 span',
        "h2 a span",
        "h2 span",
        ".a-size-medium.a-color-base.a-text-normal",
        ".a-size-base-plus.a-color-base.a-text-normal"
      ]);
      const link = h.firstHref(card, ['a[href*="/dp/"]', "h2 a", "a.a-link-normal.s-no-outline"]);
      const priceText = h.textOf(card, [".a-price .a-offscreen"]) || h.extractPriceFromInstructions(card);
      const originalPriceText = h.textOf(card, [".a-price.a-text-price .a-offscreen", ".a-text-price .a-offscreen"]) || h.extractListPriceFromInstructions(card);
      const couponText = h.findCouponText(card);
      const dealBadge = h.findDealBadge(card);
      const ratingText = h.textOf(card, ["i.a-icon-star-small span.a-icon-alt", "i.a-icon-star span.a-icon-alt", '[aria-label*="out of 5 stars"]']);
      const reviewText = h.findReviewText(card);
      const imageUrl = card.querySelector<HTMLImageElement>("img.s-image")?.src ?? "";
      const isSponsored = /Sponsored/i.test(card.innerText) || Boolean(card.querySelector('[aria-label="Sponsored"]'));

      return {
        asin,
        title: title || asin,
        brand: h.inferBrand(title),
        imageUrl,
        productUrl: link ? h.absolutize(link) : `https://www.amazon.com/dp/${asin}`,
        currentPrice: h.parsePrice(priceText),
        originalPrice: h.parsePrice(originalPriceText),
        couponText,
        currency: h.inferCurrency(priceText),
        rating: h.parseRating(ratingText),
        reviewCount: h.parseInteger(reviewText),
        isSponsored,
        isPrime: Boolean(card.querySelector('[aria-label*="Prime"], .s-prime, i.a-icon-prime')),
        dealBadge,
        deliveryText: h.textOf(card, ['[data-cy="delivery-recipe"]', '[data-cy="delivery-block"]', ".a-color-base.a-text-bold"])
      };
    })
    .filter((item): item is SerpProductInput => item !== null);
}
