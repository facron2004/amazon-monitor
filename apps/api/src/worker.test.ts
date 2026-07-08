import type { CollectTaskLog } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import { runJobWithTimeout } from "./worker.js";

describe("worker job timeout", () => {
  it("aborts the running job and rejects at the deadline", async () => {
    let signal: AbortSignal | undefined;
    const startedAt = Date.now();

    await expect(
      runJobWithTimeout(
        {},
        { taskType: "keyword", targetId: 1, date: "2026-05-17" },
        20,
        async (_store, _job, options) => {
          signal = options?.signal;
          return new Promise<CollectTaskLog>(() => undefined);
        }
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(signal?.aborted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
