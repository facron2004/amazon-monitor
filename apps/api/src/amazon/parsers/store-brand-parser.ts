export function extractStorePageBrand(): string | null {
  const candidates = collectCandidateTexts()
    .map((value) => cleanBrand(value))
    .filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => !looksWeakBrand(candidate)) ?? candidates[0] ?? null;

  function collectCandidateTexts(): string[] {
    const values: string[] = [];
    const selectors = [
      '[data-testid="store-name"]',
      "#pageTitle",
      "main h1",
      "header h1",
      '[class*="storeName"]',
      '[class*="store-name"]',
      '[class*="Storefront"]',
      '[class*="storefront"]',
      'header img[alt]',
      '[class*="store"] img[alt]'
    ];

    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLElement | HTMLImageElement>(selector))) {
        values.push(
          element.getAttribute("aria-label") ?? "",
          element.getAttribute("title") ?? "",
          element.getAttribute("alt") ?? "",
          element.textContent ?? ""
        );
      }
    }

    for (const selector of ['meta[property="og:site_name"]', 'meta[property="og:title"]', 'meta[name="title"]', 'meta[name="twitter:title"]']) {
      const content = document.querySelector<HTMLMetaElement>(selector)?.content ?? "";
      if (content) {
        values.push(content);
      }
    }

    values.push(document.title ?? "");
    return values;
  }

  function cleanBrand(value: string | null | undefined): string | null {
    let text = value?.replace(/\s+/g, " ").trim() ?? "";
    text = text
      .replace(/^Visit the\s+/i, "")
      .replace(/\bOfficial Store(?:front)?\b/gi, "")
      .replace(/\bStorefront\b/gi, "")
      .replace(/\s+Store$/i, "")
      .replace(/\s+on Amazon.*$/i, "")
      .replace(/\s*[-|]\s*Amazon(?:\.[A-Za-z.]+)?$/i, "")
      .trim();

    if (!text || text.length > 80) {
      return null;
    }

    if (/^(?:amazon(?:\.[a-z.]+)?|shop|store|storefront|home)$/i.test(text)) {
      return null;
    }

    return text;
  }

  function looksWeakBrand(value: string): boolean {
    const tokens = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return true;
    }

    const genericTokens = new Set([
      "ice",
      "maker",
      "makers",
      "machine",
      "machines",
      "countertop",
      "portable",
      "commercial",
      "nugget",
      "bullet",
      "clear",
      "mini",
      "small",
      "electric",
      "automatic",
      "cube",
      "cubed",
      "crescent",
      "crushed",
      "pellet",
      "pebble",
      "chewable",
      "soft"
    ]);

    return tokens.every((token) => genericTokens.has(token));
  }
}
