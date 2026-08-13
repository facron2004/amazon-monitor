import type { CollectTaskLog } from "@amazon-monitor/shared";

/**
 * A runner can opt out of queue retries for a terminal, operator-actionable
 * failure. The hint is transient execution metadata and is not persisted in
 * the collection log schema.
 */
export type CollectJobResult = CollectTaskLog & {
  retryable?: boolean;
  /** Optional server-provided delay before the queue may retry this job. */
  retryAfterMs?: number;
};
