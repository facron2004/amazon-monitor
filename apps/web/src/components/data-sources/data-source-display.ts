import type { DataSourceStatus, DataSourceSyncStatus } from "@amazon-monitor/shared";
import { formatLocalDateTime } from "../../utils/formatters";

export interface DataSourceCheckpointProgress {
  version: 1;
  startDateTime: string | null;
  nextToken: string | null;
  pagesCompleted: number;
  rowsSeen: number;
  importedRows: number;
  createdRecords: number;
  updatedRecords: number;
  unmappedRows: number;
  completed: boolean;
}

export function dataSourceStatusType(value: DataSourceStatus): "info" | "success" | "warning" | "danger" {
  if (value === "connected") return "success";
  if (value === "attention") return "danger";
  if (value === "disabled") return "info";
  return "warning";
}

export function dataSourceSyncType(value: DataSourceSyncStatus): "info" | "success" | "warning" | "danger" {
  if (value === "success") return "success";
  if (value === "failed") return "danger";
  if (value === "partial") return "warning";
  return "info";
}

export function dataSourceTimeText(value: string | null): string {
  return value ? formatLocalDateTime(value) : "Not synced";
}

export function parseDataSourceCheckpointSummary(value: string | null): DataSourceCheckpointProgress | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    const nextToken = nullableText(parsed.nextToken);
    const completed = parsed.completed === true;
    const numbers = {
      pagesCompleted: nonNegativeInteger(parsed.pagesCompleted),
      rowsSeen: nonNegativeInteger(parsed.rowsSeen),
      importedRows: nonNegativeInteger(parsed.importedRows),
      createdRecords: nonNegativeInteger(parsed.createdRecords),
      updatedRecords: nonNegativeInteger(parsed.updatedRecords),
      unmappedRows: nonNegativeInteger(parsed.unmappedRows)
    };
    if (Object.values(numbers).some(Number.isNaN) || (completed && nextToken !== null)) return null;
    return {
      version: 1,
      startDateTime: nullableText(parsed.startDateTime),
      nextToken,
      ...numbers,
      completed
    };
  } catch {
    return null;
  }
}

export function dataSourceCheckpointText(value: string | null): string | null {
  const checkpoint = parseDataSourceCheckpointSummary(value);
  if (!checkpoint) return null;
  const state = checkpoint.completed ? "complete" : "resumable";
  return `Checkpoint: ${checkpoint.pagesCompleted} page${checkpoint.pagesCompleted === 1 ? "" : "s"} · ${checkpoint.importedRows}/${checkpoint.rowsSeen} imported · ${state}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : NaN;
}
