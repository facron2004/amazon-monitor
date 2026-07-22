interface CurrencyProfile {
  currency: string;
  locale: string;
}

const CURRENCY_PROFILES: Record<string, CurrencyProfile> = {
  US: { currency: "USD", locale: "en-US" },
  UK: { currency: "GBP", locale: "en-GB" },
  DE: { currency: "EUR", locale: "de-DE" },
  JP: { currency: "JPY", locale: "ja-JP" }
};

export function normalizeMarketplaceCode(marketplace: string): keyof typeof CURRENCY_PROFILES | null {
  const value = marketplace.trim().toUpperCase();
  if (value === "US" || value.includes("AMAZON.COM")) return "US";
  if (value === "UK" || value === "GB" || value.includes("AMAZON.CO.UK")) return "UK";
  if (value === "DE" || value.includes("AMAZON.DE")) return "DE";
  if (value === "JP" || value.includes("AMAZON.CO.JP")) return "JP";
  return null;
}

export function formatMarketplaceMoney(value: number | null, marketplace: string): string {
  if (value === null) return "--";
  const code = normalizeMarketplaceCode(marketplace);
  if (!code) return `${marketplace} ${formatPlainAmount(value)}`;
  const profile = CURRENCY_PROFILES[code];
  return new Intl.NumberFormat(profile.locale, {
    style: "currency",
    currency: profile.currency,
    maximumFractionDigits: profile.currency === "JPY" ? 0 : 2
  }).format(value);
}

function formatPlainAmount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
