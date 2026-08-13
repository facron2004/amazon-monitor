import type { Store } from "./store.js";

export type WorkerReadinessStatus = "alive" | "stale" | "offline" | "not_required" | "unavailable";

export interface WorkerReadinessSnapshot {
  required: boolean;
  status: WorkerReadinessStatus;
  ageMs: number | null;
}

export function getWorkerReadiness(
  store: Store,
  required: boolean,
): WorkerReadinessSnapshot {
  if (!required) {
    return { required: false, status: "not_required", ageMs: null };
  }

  const worker = store.getWorkerStatus();
  return {
    required: true,
    status: worker.alive ? "alive" : worker.stale ? "stale" : "offline",
    ageMs: worker.ageMs,
  };
}

export function unavailableWorkerReadiness(required: boolean): WorkerReadinessSnapshot {
  return {
    required,
    status: required ? "unavailable" : "not_required",
    ageMs: null,
  };
}

export function isWorkerReady(snapshot: WorkerReadinessSnapshot): boolean {
  return !snapshot.required || snapshot.status === "alive";
}
