import type { BestSellerProductInput } from "@amazon-monitor/shared";
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

export function extractBestSellerCards(input: { categoryName: string; categoryUrl: string }): BestSellerProductInput[] {
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
        ".s-coupon-clipped"
      ]);
    },
    findDealBadge(root: HTMLElement): string | null {
      return h.findPromoText(root, h.dealPatterns(), [
        '[id*="deal" i]',
        '[class*="deal" i]',
        '[aria-label*="deal" i]',
        '[title*="deal" i]',
        ".a-badge-text",
        ".s-label-popover-default"
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
      for (const candidate of candidates) {
        const value = h.promoMatch(candidate, patterns);
        if (value) return value;
      }
      return null;
    },
    promoMatch(value: string, patterns: RegExp[]): string | null {
      const text = value.replace(/\s+/g, " ").trim();
      if (!text || text.length > 180) return null;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        const candidate = h.cleanPromoText(match?.[0] ?? (pattern.test(text) ? text : ""));
        if (candidate) return candidate;
      }
      return null;
    },
    couponPatterns(): RegExp[] {
      return [
        // Standard coupon patterns
        /\bSave\s+(?:an?\s+)?(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+with\s+coupon\b/i,
        /\b(?:Apply|Clip)\s+(?:an?\s+)?(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)?\s*coupon\b/i,
        /\b(?:[$€£¥]\s*[\d,.]+|HKD\s*[\d,.]+|CAD\s*[\d,.]+|AUD\s*[\d,.]+|[\d.]+%)\s+(?:off\s+)?(?:with\s+)?coupon\b/i,
        // Extra coupon savings
        /\bExtra\s+(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+off\s+(?:with\s+)?coupon\b/i,
        /\bSave\s+(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+coupon\b/i,
        /\bclip\s+coupon\b/i,
        // Coupon applied automatically
        /\bcoupon\s+applied\s+(?:automatically\s+)?at\s+checkout\b/i,
        /\b(?:[$€£¥]\s*[\d,.]+|[\d.]+%)\s+coupon\s+applied\b/i
      ];
    },
    dealPatterns(): RegExp[] {
      return [
        /\b(?:limited\s+time\s+deal|prime\s+exclusive\s+deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b/i,
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
      const match = trimmed.match(/[$£€¥]/);
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
    }
  };
  const selectors = [
    '[data-testid="product-card"]',
    ".zg-grid-general-faceout",
    ".p13n-sc-uncoverable-faceout",
    "#gridItemRoot",
    ".zg-item-immersion",
    '[data-asin]:not([data-asin=""])'
  ];
  const cards = h.uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))));
  const products: BestSellerProductInput[] = [];
  const seen = new Set<string>();

  cards.forEach((card, index) => {
    const link = h.firstHref(card, ['a[href*="/dp/"]', 'a[href*="/gp/product/"]', "a.a-link-normal"]);
    const asin = h.extractAsin(`${card.getAttribute("data-asin") ?? ""} ${link}`);
    if (!asin || seen.has(asin)) {
      return;
    }
    seen.add(asin);

    const rankText = h.textOf(card, [".zg-bdg-text", '[class*="zg-bdg-text"]', ".zg-badge-text"]) || h.findRankLine(card);
    const rank = h.parseInteger(rankText) ?? index + 1;
    const image = card.querySelector<HTMLImageElement>("img");
    const title =
      h.textOf(card, [
        "._cDEzb_p13n-sc-css-line-clamp-4_2q2cc",
        "._cDEzb_p13n-sc-css-line-clamp-3_g3dy1",
        ".p13n-sc-truncate",
        "a span.a-size-base",
        "a span",
        "span.a-size-small"
      ]) ||
      image?.alt?.trim() ||
      asin;
    const priceText = h.textOf(card, [".a-price .a-offscreen", "._cDEzb_p13n-sc-price_3mJ9Z", ".p13n-sc-price"]);
    const originalPriceText = h.textOf(card, [".a-price.a-text-price .a-offscreen", ".a-text-price .a-offscreen"]);
    const couponText = h.findCouponText(card);
    const dealBadge = h.findDealBadge(card);
    const ratingText = h.textOf(card, ["i.a-icon-star-small span.a-icon-alt", "i.a-icon-star span.a-icon-alt", '[aria-label*="out of 5 stars"]']);
    const reviewText = h.findReviewText(card);

    products.push({
      rank,
      asin,
      title,
      brand: h.inferBrand(title),
      imageUrl: image?.src ?? "",
      productUrl: link ? h.absolutize(link) : `${window.location.origin}/dp/${asin}`,
      currentPrice: h.parsePrice(priceText),
      originalPrice: h.parsePrice(originalPriceText),
      couponText,
      currency: h.inferCurrency(priceText),
      rating: h.parseRating(ratingText),
      reviewCount: h.parseInteger(reviewText),
      isPrime: Boolean(card.querySelector('[aria-label*="Prime"], .s-prime, i.a-icon-prime')),
      dealBadge,
      bsrRank: rank,
      bsrCategory: input.categoryName
    });
  });

  return products.sort((a, b) => a.rank - b.rank);
}
