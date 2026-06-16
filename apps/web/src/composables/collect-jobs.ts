import type { CollectJob } from "@amazon-monitor/shared";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;

export interface WaitForCollectJobsOptions {
  getJobStatus(id: number): Promise<CollectJob | null>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

export async function waitForCollectJobs(
  jobs: readonly CollectJob[],
  options: WaitForCollectJobsOptions
): Promise<CollectJob[]> {
  const pendingJobs = new Map(jobs.map((job) => [job.id, job]));
  const completedJobs = new Map<number, CollectJob>();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const startedAt = now();

  while (pendingJobs.size > 0) {
    const jobStatuses = await Promise.all(
      Array.from(pendingJobs.keys(), (jobId) => options.getJobStatus(jobId))
    );

    for (const jobStatus of jobStatuses) {
      if (!jobStatus) {
        throw new Error("Collect job no longer exists.");
      }

      if (jobStatus.status === "failed") {
        throw new Error(jobStatus.errorMessage || `Collect job ${jobStatus.id} failed.`);
      }

      if (jobStatus.status === "completed") {
        pendingJobs.delete(jobStatus.id);
        completedJobs.set(jobStatus.id, jobStatus);
        continue;
      }

      pendingJobs.set(jobStatus.id, jobStatus);
    }

    if (pendingJobs.size === 0) {
      break;
    }

    if (now() - startedAt >= (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)) {
      throw new Error("Collect job is still processing. Please check the logs view and retry shortly.");
    }

    await sleep(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }

  return jobs.map((job) => completedJobs.get(job.id) ?? job);
}
