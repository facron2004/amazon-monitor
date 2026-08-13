import {
  dataSourceSyncErrorCodes,
  type DataSourceSyncErrorCode
} from "@amazon-monitor/shared";

export const spApiFailureCategories = dataSourceSyncErrorCodes;

export type SpApiFailureCategory = DataSourceSyncErrorCode;

const MAX_RETRY_AFTER_MS = 60 * 60_000;

export class SpApiConnectorError extends Error {
  readonly retryAfterMs: number | undefined;

  constructor(
    readonly category: SpApiFailureCategory,
    message: string,
    readonly retryable: boolean,
    retryAfterMs?: number
  ) {
    super(message);
    this.name = "SpApiConnectorError";
    this.retryAfterMs = retryAfterMs === undefined || !Number.isFinite(retryAfterMs)
      ? undefined
      : Math.max(0, Math.min(Math.floor(retryAfterMs), MAX_RETRY_AFTER_MS));
  }
}

export function retryAfterMsFromHeader(value: string | null, nowMs = Date.now()): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.floor(seconds * 1_000), MAX_RETRY_AFTER_MS);
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.min(Math.max(0, retryAt - nowMs), MAX_RETRY_AFTER_MS);
}

export function toSpApiConnectorError(error: unknown): SpApiConnectorError {
  if (error instanceof SpApiConnectorError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new SpApiConnectorError("network_timeout", "SP-API request timed out", true);
  }
  return new SpApiConnectorError("unknown", "SP-API request failed", false);
}
