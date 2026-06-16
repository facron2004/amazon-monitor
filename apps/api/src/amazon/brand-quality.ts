const GENERIC_BRAND_TOKENS = new Set([
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

export function hasWeakBrandValue(brandValue: string | null | undefined, title: string): boolean {
  const normalizedTokens = normalizeBrandTokens(brandValue);
  if (normalizedTokens.length === 0) {
    return true;
  }

  if (normalizedTokens.every((token) => GENERIC_BRAND_TOKENS.has(token))) {
    return true;
  }

  const titleFirstWord = title.trim().split(/\s+/)[0]?.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return Boolean(
    titleFirstWord &&
      normalizedTokens.length === 1 &&
      normalizedTokens[0] === titleFirstWord &&
      GENERIC_BRAND_TOKENS.has(normalizedTokens[0])
  );
}

function normalizeBrandTokens(brandValue: string | null | undefined): string[] {
  return (brandValue ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
