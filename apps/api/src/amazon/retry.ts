export function isRetryableSearchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRetryableAmazonNetworkError(message) ||
    /temporary error page/i.test(message) ||
    /Something went wrong/i.test(message) ||
    /no-search-cards/i.test(message) ||
    /Timeout .*s-search-result/i.test(message) ||
    /zero product cards/i.test(message)
  );
}

export function isRetryableCategoryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRetryableAmazonNetworkError(message) ||
    /temporary error page/i.test(message) ||
    /Something went wrong/i.test(message) ||
    /no-bestseller-cards/i.test(message) ||
    /Best Sellers short page/i.test(message) ||
    /Best Sellers returned zero product cards/i.test(message) ||
    /Timeout .*product-card/i.test(message) ||
    /Timeout .*gridItemRoot/i.test(message)
  );
}

export function isOptionalBestSellerPageEnd(error: unknown, pageNo: number, requiredPageCount: number, collected: number): boolean {
  if (pageNo <= requiredPageCount || collected <= 0) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /missing page for category/i.test(message) || /couldn.?t find that page/i.test(message);
}

export function isRetryableAmazonNetworkError(message: string): boolean {
  return (
    /net::ERR_CONNECTION_(?:CLOSED|RESET|ABORTED|TIMED_OUT)/i.test(message) ||
    /net::ERR_(?:TIMED_OUT|INTERNET_DISCONNECTED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/i.test(message) ||
    /Client network socket disconnected/i.test(message) ||
    /socket hang up/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message)
  );
}
