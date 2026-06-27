import { describe, expect, it, beforeEach } from "vitest";
import { openAppStore } from "../store.js";

describe("WorkerStore", () => {
  let store: ReturnType<typeof openAppStore>;

  beforeEach(() => {
    // In-memory sqlite for isolation. `reset()` clears the heartbeat table
    // alongside the queue so each test starts blank.
    store = openAppStore(":memory:");
    store.reset();
  });

  it("reports offline when no Worker has ever heart-beated", () => {
    const status = store.getWorkerStatus();
    expect(status).toMatchObject({
      alive: false,
      stale: false,
      offline: true,
      ageMs: null,
      workerId: null,
      pid: null,
      host: null,
      startedAt: null,
      lastBeatAt: null,
      version: null,
      lastJobId: null,
      lastStatus: null
    });
  });

  it("marks a fresh heart-beat as alive", () => {
    const startedAt = "2026-06-26T10:00:00.000Z";
    store.recordWorkerHeartbeat({
      workerId: "w-1",
      pid: 4242,
      host: "test-host",
      startedAt,
      version: "0.2.0",
      lastJobId: 30,
      lastStatus: "completed"
    });

    const status = store.getWorkerStatus();
    expect(status.alive).toBe(true);
    expect(status.stale).toBe(false);
    expect(status.offline).toBe(false);
    expect(status.ageMs).not.toBeNull();
    expect(status.ageMs).toBeLessThanOrEqual(15_000);
    expect(status.workerId).toBe("w-1");
    expect(status.pid).toBe(4242);
    expect(status.host).toBe("test-host");
    expect(status.startedAt).toBe(startedAt);
    expect(status.version).toBe("0.2.0");
    expect(status.lastJobId).toBe(30);
    expect(status.lastStatus).toBe("completed");
  });

  it("updates lastBeatAt and last job info without changing startedAt", () => {
    const startedAt = "2026-06-26T10:00:00.000Z";
    store.recordWorkerHeartbeat({
      workerId: "w-1",
      pid: 4242,
      host: "test-host",
      startedAt,
      version: "0.2.0",
      lastJobId: 30,
      lastStatus: "completed"
    });
    store.recordWorkerHeartbeat({
      workerId: "w-1",
      pid: 4242,
      host: "test-host",
      startedAt,
      version: "0.2.0",
      lastJobId: 31,
      lastStatus: "failed"
    });

    const status = store.getWorkerStatus();
    expect(status.startedAt).toBe(startedAt);
    expect(status.lastJobId).toBe(31);
    expect(status.lastStatus).toBe("failed");
    expect(status.workerId).toBe("w-1");
  });

  it("reset() clears the heartbeat row", () => {
    store.recordWorkerHeartbeat({
      workerId: "w-1",
      pid: 4242,
      host: "test-host",
      startedAt: "2026-06-26T10:00:00.000Z",
      version: "0.2.0"
    });
    expect(store.getWorkerStatus().workerId).toBe("w-1");

    store.reset();
    expect(store.getWorkerStatus().workerId).toBeNull();
  });
});