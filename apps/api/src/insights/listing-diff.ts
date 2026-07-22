export function ratingDelta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return Math.round((after - before) * 100) / 100;
}

export function normalizeListingText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function canonicalImageUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed.split("?")[0] ?? trimmed;
  }
}
