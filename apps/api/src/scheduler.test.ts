import { describe, expect, it } from "vitest";
import { createExclusiveCronRunner, type CronLogger } from "./scheduler.js";

function createLogger(): CronLogger & { messages: string[]; errors: Array<{ message: string; error?: unknown }> } {
  return {
    messages: [],
    errors: [],
    info(message) {
      this.messages.push(message);
    },
    warn(message) {
      this.messages.push(message);
    },
    error(message, error) {
      this.errors.push({ message, error });
    }
  };
}

describe("exclusive cron runner", () => {
  it("skips overlapping runs and allows later executions", async () => {
    const logger = createLogger();
    let release!: () => void;
    let runs = 0;
    const runner = createExclusiveCronRunner(
      "test-job",
      async () => {
        runs += 1;
        if (runs > 1) {
          return;
        }
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      logger
    );

    const first = runner();
    await runner();
    expect(runs).toBe(1);
    expect(logger.messages).toContain("[cron:test-job] skipped because the previous run is still active.");

    release();
    await first;
    await runner();
    expect(runs).toBe(2);
  });

  it("logs job failures and releases the running lock", async () => {
    const logger = createLogger();
    let shouldFail = true;
    let runs = 0;
    const runner = createExclusiveCronRunner(
      "failing-job",
      async () => {
        runs += 1;
        if (shouldFail) {
          throw new Error("boom");
        }
      },
      logger
    );

    await runner();
    shouldFail = false;
    await runner();

    expect(runs).toBe(2);
    expect(logger.errors[0]).toMatchObject({ message: "[cron:failing-job] failed." });
  });
});
