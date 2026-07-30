export const spApiFailureCategories = [
  "credentials_invalid",
  "credentials_revoked",
  "permission_missing",
  "marketplace_mismatch",
  "rate_limited",
  "amazon_5xx",
  "network_timeout",
  "report_cancelled",
  "report_fatal",
  "document_download_failed",
  "schema_invalid",
  "mapping_blocked",
  "lease_lost",
  "database_failed",
  "unknown"
] as const;

export type SpApiFailureCategory = (typeof spApiFailureCategories)[number];

export class SpApiConnectorError extends Error {
  constructor(
    readonly category: SpApiFailureCategory,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "SpApiConnectorError";
  }
}

export function toSpApiConnectorError(error: unknown): SpApiConnectorError {
  if (error instanceof SpApiConnectorError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new SpApiConnectorError("network_timeout", "SP-API request timed out", true);
  }
  return new SpApiConnectorError("unknown", "SP-API request failed", false);
}
