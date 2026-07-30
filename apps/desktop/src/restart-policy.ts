export interface RestartDecision {
  delayMs: number;
  restart: boolean;
}

export class BoundedRestartPolicy {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxRestarts = 3,
    private readonly windowMs = 60_000,
  ) {}

  recordFailure(processName: string, now = Date.now()): RestartDecision {
    const recent = (this.failures.get(processName) ?? [])
      .filter((time) => now - time < this.windowMs);
    if (recent.length >= this.maxRestarts) {
      this.failures.set(processName, recent);
      return { delayMs: 0, restart: false };
    }
    recent.push(now);
    this.failures.set(processName, recent);
    return {
      delayMs: Math.min(1_000 * 2 ** (recent.length - 1), 10_000),
      restart: true,
    };
  }

  reset(processName: string): void {
    this.failures.delete(processName);
  }
}
