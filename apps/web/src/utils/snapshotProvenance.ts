import type { ProductSyncStatus } from "@amazon-monitor/shared";

interface SnapshotProvenance {
  dataSource?: string | null;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus | null;
}

const sourceLabels: Record<string, string> = {
  amazon_playwright: "Amazon 采集",
  collector: "采集器",
  manual: "手工录入",
  legacy: "历史数据"
};

const statusLabels: Record<ProductSyncStatus, string> = {
  pending: "待同步",
  success: "同步成功",
  partial: "部分数据",
  failed: "同步失败",
  manual: "手工数据"
};

export function snapshotDataSourceLabel(dataSource: string | null | undefined): string {
  return sourceLabels[dataSource ?? ""] ?? dataSource ?? "来源未知";
}

export function snapshotSyncStatusLabel(syncStatus: ProductSyncStatus | null | undefined): string {
  return syncStatus ? statusLabels[syncStatus] : "状态未知";
}

export function snapshotProvenanceLabel(snapshot: SnapshotProvenance | null | undefined): string {
  if (!snapshot) return "暂无快照";
  return `${snapshotDataSourceLabel(snapshot.dataSource)} · ${snapshotSyncStatusLabel(snapshot.syncStatus)}`;
}

export function snapshotSyncedAtLabel(snapshot: SnapshotProvenance | null | undefined): string {
  if (!snapshot?.lastSyncedAt) return "暂无同步时间";
  return `最近同步 ${snapshot.lastSyncedAt.slice(0, 16).replace("T", " ")}`;
}
