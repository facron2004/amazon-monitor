import type { ScheduledTask, TaskContext } from "node-cron";

export interface CronLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export type CronJob = () => Promise<unknown> | unknown;

export function createExclusiveCronRunner(name: string, job: CronJob, logger: CronLogger = console): () => Promise<void> {
  let running = false;

  return async () => {
    if (running) {
      logger.warn(`[cron:${name}] skipped because the previous run is still active.`);
      return;
    }

    running = true;
    const startedAt = Date.now();
    try {
      await job();
      logger.info(`[cron:${name}] finished in ${Date.now() - startedAt}ms.`);
    } catch (error) {
      logger.error(`[cron:${name}] failed.`, error);
    } finally {
      running = false;
    }
  };
}

export function attachCronDiagnostics(task: ScheduledTask, name: string, logger: CronLogger = console): void {
  task.on("execution:missed", (context) => {
    logger.warn(`[cron:${name}] missed scheduled execution at ${formatCronDate(context)}.`);
  });
  task.on("execution:overlap", (context) => {
    logger.warn(`[cron:${name}] overlap detected at ${formatCronDate(context)}.`);
  });
  task.on("execution:failed", (context) => {
    logger.error(`[cron:${name}] execution failed at ${formatCronDate(context)}.`, context.execution?.error);
  });
}

function formatCronDate(context: TaskContext): string {
  return context.dateLocalIso || context.date.toISOString();
}
