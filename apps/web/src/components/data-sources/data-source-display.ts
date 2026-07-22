import type { DataSourceStatus, DataSourceSyncStatus } from "@amazon-monitor/shared";
import { formatLocalDateTime } from "../../utils/formatters";

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
