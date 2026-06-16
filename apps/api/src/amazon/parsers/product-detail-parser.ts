import type { IceTypeTag, ProductRanking } from "@amazon-monitor/shared";
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

export function extractProductDetailRanks(): {
  title: string | null;
  brand: string | null;
  storeUrl: string | null;
  couponText: string | null;
  dealBadge: string | null;
  currentPrice: number | null;
  originalPrice: number | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
  iceType: IceTypeTag | null;
  bsrRank: number | null;
  bsrCategory: string | null;
  bsrText: string | null;
  bestsellerRanks: ProductRanking[];
} {
  // Inlined from parser-utils.ts for page.evaluate serialization
  // All helper functions below (couponPatterns, dealPatterns, parsePrice, inferCurrency,
  // parseRating, cleanPromoText, promoMatch, absolutize, etc.) are duplicated inline
  // because this function is serialized by Playwright's page.evaluate().
  const salesRankElement =
    document.querySelector<HTMLElement>("#SalesRank") ??
    Array.from(document.querySelectorAll<HTMLElement>("li, tr, div")).find((element) =>
      /Best Sellers Rank/i.test(element.innerText ?? "")
    ) ??
    null;
  const bodyText = document.body?.innerText ?? "";
  const sourceText = salesRankElement?.innerText || snippetAfter(bodyText, "Best Sellers Rank", 1000);
  const rankText = cleanRankText(sourceText);
  const title = findTitleText();
  const priceText = findCurrentPriceText();
  const originalPriceText = findOriginalPriceText();
  const embeddedAverageCustomerReviews = findEmbeddedAverageCustomerReviews();
  const rating = parseRating(findRatingText()) ?? embeddedAverageCustomerReviews?.rating ?? null;
  const reviewCount = parseReviewCount(findReviewCountText()) ?? embeddedAverageCustomerReviews?.reviewCount ?? null;
  const storeUrl = findStoreUrl();
  const brand = findBrandText();
  const iceType = findIceType(title);
  const couponText = findCouponText();
  const dealBadge = findDealBadge();
  const rankRegex = /#\s*([\d,]+)\s+in\s+([^\n(#]+)(?:\s*\([^)]*\))?/gi;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/gp/bestsellers/"]')).map((link) => ({
    text: link.innerText.trim(),
    url: absolutize(link.getAttribute("href") ?? "")
  }));
  const ranks: ProductRanking[] = [];
  let match: RegExpExecArray | null;

  while ((match = rankRegex.exec(rankText)) !== null) {
    const category = cleanCategory(match[2]);
    const rank = Number(match[1].replace(/,/g, ""));
    if (!category || Number.isNaN(rank)) {
      continue;
    }
    ranks.push({
      rank,
      category,
      url: links.find((link) => link.text.includes(category) || category.includes(link.text))?.url ?? null
    });
  }

  const primary = ranks.at(-1) ?? ranks[0] ?? null;
  return {
    title,
    brand,
    storeUrl,
    couponText,
    dealBadge,
    currentPrice: parsePrice(priceText),
    originalPrice: parsePrice(originalPriceText),
    currency: inferCurrency(priceText),
    rating,
    reviewCount,
    iceType,
    bsrRank: primary?.rank ?? null,
    bsrCategory: primary?.category ?? null,
    bsrText: rankText || null,
    bestsellerRanks: ranks
  };

  function findTitleText(): string | null {
    const value = textFromSelectors(["#productTitle", "#title span", "#centerCol h1 span"]);
    return value || null;
  }

  function findCurrentPriceText(): string {
    const selectors = [
      "#corePrice_feature_div .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      "#newAccordionRow .a-price .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      '[data-a-color="price"] .a-offscreen',
      ".a-price .a-offscreen"
    ];
    for (const selector of selectors) {
      const value = document.querySelector<HTMLElement>(selector)?.innerText?.trim() || document.querySelector<HTMLElement>(selector)?.textContent?.trim();
      if (value && parsePrice(value) !== null) {
        return value;
      }
    }
    const displayedPrice = document.querySelector<HTMLInputElement>('input[name="displayedPrice"]')?.value?.trim();
    return displayedPrice && parsePrice(displayedPrice) !== null ? displayedPrice : "";
  }

  function findOriginalPriceText(): string {
    const selectors = [
      "#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen",
      "#corePrice_feature_div .basisPrice .a-offscreen",
      ".basisPrice .a-offscreen",
      ".a-text-price .a-offscreen",
      "#listPrice"
    ];
    for (const selector of selectors) {
      const value = document.querySelector<HTMLElement>(selector)?.innerText?.trim() || document.querySelector<HTMLElement>(selector)?.textContent?.trim();
      if (value && parsePrice(value) !== null) {
        return value;
      }
    }
    return "";
  }

  function findBrandText(): string | null {
    // 1. Try Store link first (most accurate)
    const storeLink = findStoreLink();
    if (storeLink) {
      const storeBrand = cleanBrand(storeLink.innerText || storeLink.textContent);
      if (storeBrand) {
        return storeBrand;
      }
    }

    // 2. Try byline elements
    const byline = textFromSelectors(["#bylineInfo", "#brandByline_feature_div a", "#brandByline_feature_div", "#brand"]);
    const bylineBrand = cleanBrand(byline);
    if (bylineBrand) {
      return bylineBrand;
    }

    // 3. Try product details tables
    const rowSelectors = [
      "#productOverview_feature_div tr",
      "#poExpander tr",
      "#prodDetails tr",
      "#productDetails_techSpec_section_1 tr",
      "#productDetails_detailBullets_sections1 tr",
      "#detailBullets_feature_div li"
    ];
    for (const row of Array.from(document.querySelectorAll<HTMLElement>(rowSelectors.join(", ")))) {
      const labels = Array.from(row.querySelectorAll<HTMLElement>("th, .a-text-bold, .a-size-base.a-text-bold, span"))
        .map((element) => element.innerText?.trim() || element.textContent?.trim() || "")
        .filter(Boolean);
      const rowText = row.innerText?.trim() || row.textContent?.trim() || "";
      if (![...labels, rowText].some((text) => /^(?:Brand|Brand Name|Manufacturer)\b/i.test(text.replace(/\s*:\s*$/, "")))) {
        continue;
      }

      const inline = rowText.match(/(?:Brand|Brand Name|Manufacturer)\s*:?\s*([^\n]+)/i)?.[1];
      const inlineBrand = cleanBrand(inline);
      if (inlineBrand) {
        return inlineBrand;
      }

      const cells = Array.from(row.querySelectorAll<HTMLElement>("td, .po-break-word, .a-span9, span"))
        .map((element) => element.innerText?.trim() || element.textContent?.trim() || "")
        .filter(Boolean);
      for (const cell of cells) {
        const brand = cleanBrand(cell);
        if (brand && !/^(?:Brand|Brand Name|Manufacturer)$/i.test(brand)) {
          return brand;
        }
      }
    }

    return null;
  }

  function findStoreUrl(): string | null {
    const href = findStoreLink()?.getAttribute("href")?.trim() ?? "";
    if (!href || /\/(?:dp|gp\/product)\//i.test(href)) {
      return null;
    }
    return absolutize(href);
  }

  function findStoreLink(): HTMLAnchorElement | null {
    const selectors = [
      '#bylineInfo[href*="/stores/"]',
      '#brandByline_feature_div a[href*="/stores/"]',
      'a[href*="/stores/"]',
      "#bylineInfo[href]",
      "#brandByline_feature_div a[href]",
      "#brand[href]"
    ];
    for (const selector of selectors) {
      const link = document.querySelector<HTMLAnchorElement>(selector);
      if (link?.getAttribute("href")?.trim()) {
        return link;
      }
    }
    return null;
  }

  function textFromSelectors(selectors: string[]): string {
    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      const value = element?.innerText?.trim() || element?.textContent?.trim() || "";
      if (value) {
        return value;
      }
    }
    return "";
  }

  function cleanBrand(value: string | null | undefined): string | null {
    let text = value?.replace(/\s+/g, " ").trim() ?? "";
    text = text
      .replace(/^Visit the\s+/i, "")
      .replace(/\s+Store$/i, "")
      .replace(/^Brand(?:\s+Name)?\s*:?\s*/i, "")
      .replace(/^by\s+/i, "")
      .trim();
    if (!text || text.length > 80) {
      return null;
    }
    if (/^(?:Customer Reviews|Best Sellers Rank|ASIN|Date First Available)$/i.test(text)) {
      return null;
    }
    return text;
  }

  function findCouponText(): string | null {
    return findPromoText(
      [
        "#couponFeatureDiv",
        "#promoPriceBlockMessage_feature_div",
        "#reinvent_price_desktop_pickupMessage",
        "#applicablePromotionList",
        "#corePrice_desktop .savingsPercentage",
        "#corePrice_desktop .a-color-price",
        '[id*="coupon" i]',
        '[class*="coupon" i]',
        '[aria-label*="coupon" i]',
        '[title*="coupon" i]',
        '[data-a-badge-type="coupon"]'
      ],
      couponPatterns()
    );
  }

  function findDealBadge(): string | null {
    return findPromoText(
      [
        "#dealBadge_feature_div",
        "#dealBadgeSupportingText",
        "#priceblock_dealprice",
        "#dealsAccordionRow",
        ".dealBadge",
        '[id*="deal" i]',
        '[class*="deal" i]',
        '[class*="badge"]',
        '[aria-label*="deal" i]',
        '[title*="deal" i]',
        ".a-badge-text",
        '[data-a-badge-type="deal"]'
      ],
      dealPatterns()
    );
  }

  function findPromoText(selectors: string[], patterns: RegExp[]): string | null {
    const candidates: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selectors.join(", ")))) {
      if (isSponsoredOrRecommendationElement(element)) {
        continue;
      }
      candidates.push(
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element.innerText ?? "",
        element.textContent ?? ""
      );
    }
    for (const candidate of candidates) {
      const value = promoMatch(candidate, patterns);
      if (value) return value;
    }
    return null;
  }

  function promoMatch(value: string, patterns: RegExp[]): string | null {
    const text = value.replace(/\s+/g, " ").trim();
    if (!text || text.length > 240) return null;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const candidate = cleanPromoText(match?.[0] ?? (pattern.test(text) ? text : ""));
      if (candidate) return candidate;
    }
    return null;
  }

  function couponPatterns(): RegExp[] {
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
  }

  function dealPatterns(): RegExp[] {
    return [
      // Specific deal types
      /\b(?:limited\s+time\s+deal|prime\s+exclusive\s+deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal|prime\s+day\s+deal)\b/i,
      // Today's deals
      /\btoday'?s\s+deals?\b/i,
      // Deal badges
      /\b(?:deal|hot\s+deal|special\s+deal|limited\s+offer)\b/i,
      // Save percentage patterns
      /\bSave\s+[\d.]+%\s+(?:on\s+)?(?:this\s+)?(?:item|product)?\b/i,
      // Limited time patterns
      /\blimited\s+time\b/i,
      // Generic deal (only if standalone)
      /^deal$/i
    ];
  }

  function cleanPromoText(value: string): string | null {
    const text = value.replace(/\s+/g, " ").replace(/\bDetails\b.*$/i, "").trim();
    return text && text.length <= 90 ? text : null;
  }

  function parsePrice(value: string): number | null {
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
  }

  function inferCurrency(value: string): string | null {
    const trimmed = value.trim().replace(/\s+/g, "");
    if (!trimmed) return null;
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
  }

  function findReviewCountText(): string {
    const selectors = [
      "#acrCustomerReviewText",
      "#acrCustomerReviewLink span",
      '[data-hook="total-review-count"]',
      "#averageCustomerReviews [aria-label]",
      "#acrCustomerReviewLink [aria-label]"
    ];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      const value = `${element?.getAttribute("aria-label") ?? ""} ${element?.innerText ?? ""} ${element?.textContent ?? ""}`.trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function findRatingText(): string {
    const selectors = [
      "#acrPopover",
      "#acrPopover span.a-declarative",
      "#averageCustomerReviews .a-icon-alt",
      '[data-hook="rating-out-of-text"]',
      '[data-hook="average-star-rating-text"]'
    ];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      const value = `${element?.getAttribute("title") ?? ""} ${element?.getAttribute("aria-label") ?? ""} ${element?.innerText ?? ""} ${element?.textContent ?? ""}`.trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function parseRating(value: string): number | null {
    const match = value.replace(/\s+/g, " ").match(/([0-9]+(?:\.[0-9]+)?)\s+out of\s+5/i);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function findEmbeddedAverageCustomerReviews(): { rating: number | null; reviewCount: number | null } | null {
    const html = document.documentElement?.innerHTML ?? "";
    if (!html || !/averageCustomerReviews/i.test(html)) {
      return null;
    }

    const normalized = html
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\\"/g, '"')
      .replace(/\\+"/g, '"');
    const blockMatch = normalized.match(/averageCustomerReviews"?\s*:\s*\{[\s\S]{0,1200}?\}/i);
    if (!blockMatch) {
      return null;
    }

    const block = blockMatch[0];
    const reviewCountMatch = block.match(/"reviewCount"\s*:\s*(\d+)/i);
    const valueMatch = block.match(/"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const displayMatch = block.match(/"displayString"\s*:\s*"([0-9]+(?:\.[0-9]+)?)\s+out of 5 stars"/i);

    const reviewCount = reviewCountMatch ? Number(reviewCountMatch[1]) : null;
    const ratingValue = valueMatch?.[1] ?? displayMatch?.[1] ?? null;
    const rating = ratingValue === null ? null : Number(ratingValue);

    if (reviewCount === null && rating === null) {
      return null;
    }

    return {
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null
    };
  }

  function findIceType(titleText: string | null): IceTypeTag | null {
    const structured = findStructuredIceTypeText();
    const inferred = inferIceTypeFromText([titleText, structured, findFeatureBulletsText(), findProductOverviewText()].filter(Boolean).join(" "));
    return inferred;
  }

  function findStructuredIceTypeText(): string {
    const rowSelectors = [
      "#productOverview_feature_div tr",
      "#poExpander tr",
      "#prodDetails tr",
      "#productDetails_techSpec_section_1 tr",
      "#productDetails_detailBullets_sections1 tr",
      "#detailBullets_feature_div li"
    ];
    for (const row of Array.from(document.querySelectorAll<HTMLElement>(rowSelectors.join(", ")))) {
      const rowText = row.innerText?.trim() || row.textContent?.trim() || "";
      if (!/(?:Ice\s*(?:Type|Shape|Form)|Cube\s*Shape|Style)\b/i.test(rowText)) {
        continue;
      }
      const inline = rowText.match(/(?:Ice\s*(?:Type|Shape|Form)|Cube\s*Shape|Style)\s*:?\s*([^\n]+)/i)?.[1];
      if (inline) {
        return inline;
      }
      const cells = Array.from(row.querySelectorAll<HTMLElement>("td, .po-break-word, .a-span9, span"))
        .map((element) => element.innerText?.trim() || element.textContent?.trim() || "")
        .filter(Boolean);
      const candidate = cells.find((text) => !/(?:Ice\s*(?:Type|Shape|Form)|Cube\s*Shape|Style)/i.test(text));
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }

  function findFeatureBulletsText(): string {
    return textFromSelectors(["#feature-bullets", "#featurebullets_feature_div", "#feature-bullets ul"]);
  }

  function findProductOverviewText(): string {
    return textFromSelectors([
      "#productOverview_feature_div",
      "#poExpander",
      "#prodDetails",
      "#productDetails_techSpec_section_1",
      "#productDetails_detailBullets_sections1",
      "#detailBullets_feature_div"
    ]);
  }

  function inferIceTypeFromText(value: string): IceTypeTag | null {
    const text = value.toLowerCase();
    if (!text) {
      return null;
    }
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

  function parseReviewCount(value: string): number | null {
    const match = value.replace(/\s+/g, " ").match(/([\d,]+)\s+(?:global\s+)?(?:ratings?|reviews?)\b/i);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function cleanRankText(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    const start = compact.search(/Best Sellers Rank/i);
    const sliced = start >= 0 ? compact.slice(start) : compact;
    const endMarkers = [" ASIN ", " Customer Reviews ", " Date First Available ", " Product Dimensions "];
    const endIndex = endMarkers
      .map((marker) => sliced.indexOf(marker))
      .filter((index) => index > 0)
      .sort((a, b) => a - b)[0];
    return (endIndex ? sliced.slice(0, endIndex) : sliced).trim();
  }

  function cleanCategory(value: string): string {
    return value
      .replace(/\s+/g, " ")
      .replace(/\s+ASIN\b.*$/i, "")
      .replace(/\s+Customer Reviews\b.*$/i, "")
      .replace(/\s+Date First Available\b.*$/i, "")
      .trim();
  }

  function snippetAfter(text: string, needle: string, length: number): string {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    return index >= 0 ? text.slice(index, index + length) : "";
  }

  function isSponsoredOrRecommendationElement(element: HTMLElement): boolean {
    const idAndClass = `${element.id} ${element.className ?? ""}`;
    if (/\bsp_|sponsored|adHolder|brand-video|multi-brand|similarities|comparison|recommendations|hero-quick-promo/i.test(idAndClass)) {
      return true;
    }
    return Boolean(
      element.closest(
        [
          '[id*="sp_detail" i]',
          '[id*="sp-"]',
          '[id*="sponsored" i]',
          '[class*="sponsored" i]',
          '[class*="multi-brand" i]',
          '[id*="similarities" i]',
          '[id*="comparison" i]',
          '[id*="recommendations" i]',
          '[data-a-carousel-options]'
        ].join(", ")
      )
    );
  }

  function absolutize(href: string): string | null {
    if (!href) {
      return null;
    }
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return href;
    }
  }
}
