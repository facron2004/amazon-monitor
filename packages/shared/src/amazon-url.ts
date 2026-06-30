/**
 * Amazon domain whitelist for SSRF prevention and URL validation.
 * All Amazon site URLs used throughout the project should be validated
 * through these functions — not ad-hoc regexes in individual routes.
 */

const ALLOWED_AMAZON_HOSTS = new Set([
  "amazon.com",
  "www.amazon.com",
  "amazon.co.uk",
  "www.amazon.co.uk",
  "amazon.de",
  "www.amazon.de",
  "amazon.co.jp",
  "www.amazon.co.jp",
]);

/**
 * Check whether a hostname is an allowed Amazon domain.
 * Used for SSRF prevention — only known Amazon hosts are permitted.
 */
export function isAllowedAmazonHost(hostname: string): boolean {
  return ALLOWED_AMAZON_HOSTS.has(hostname.toLowerCase());
}

/**
 * Validate that a URL points to an allowed Amazon domain.
 * Throws with statusCode 400 if the URL is invalid, non-http(s),
 * or points to a non-Amazon host.
 */
export function assertAmazonUrl(input: string): void {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw Object.assign(new Error("categoryUrl must be a valid URL"), { statusCode: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw Object.assign(new Error("Only http/https URLs are allowed"), { statusCode: 400 });
  }

  if (!isAllowedAmazonHost(parsed.hostname)) {
    throw Object.assign(new Error("categoryUrl must be an Amazon URL"), { statusCode: 400 });
  }
}
