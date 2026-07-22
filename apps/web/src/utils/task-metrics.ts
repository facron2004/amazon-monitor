import type { TaskMetricEntry } from "@amazon-monitor/shared";

export interface TaskMetricComparison {
  label: string;
  unit: string | null;
  before: string | null;
  after: string | null;
}

export function parseTaskMetricEntries(raw: string | null | undefined): TaskMetricEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): TaskMetricEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.label !== "string" || typeof item.value !== "string") return [];
      return [{
        label: item.label,
        value: item.value,
        unit: typeof item.unit === "string" ? item.unit : null
      }];
    });
  } catch {
    return [];
  }
}

export function mergeTaskMetricComparisons(
  beforeRaw: string | null | undefined,
  afterRaw: string | null | undefined
): TaskMetricComparison[] {
  const rows = new Map<string, TaskMetricComparison>();
  for (const [side, entries] of [
    ["before", parseTaskMetricEntries(beforeRaw)],
    ["after", parseTaskMetricEntries(afterRaw)]
  ] as const) {
    for (const entry of entries) {
      const unit = entry.unit ?? null;
      const key = `${entry.label}\u0000${unit ?? ""}`;
      const row = rows.get(key) ?? { label: entry.label, unit, before: null, after: null };
      row[side] = entry.value;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}
