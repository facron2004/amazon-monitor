import { describe, expect, it } from "vitest";
import {
  snapshotDataSourceLabel,
  snapshotProvenanceLabel,
  snapshotSyncedAtLabel,
  snapshotSyncStatusLabel
} from "./snapshotProvenance";

describe("snapshot provenance labels", () => {
  it("formats collector success and partial evidence for operations views", () => {
    expect(snapshotProvenanceLabel({ dataSource: "collector", syncStatus: "success" })).toBe("采集器 · 同步成功");
    expect(snapshotProvenanceLabel({ dataSource: "amazon_playwright", syncStatus: "partial" })).toBe("Amazon 采集 · 部分数据");
  });

  it("keeps custom sources visible and handles missing status", () => {
    expect(snapshotDataSourceLabel("partner_feed")).toBe("partner_feed");
    expect(snapshotSyncStatusLabel(null)).toBe("状态未知");
  });

  it("formats synchronization timestamps without changing timezone semantics", () => {
    expect(snapshotSyncedAtLabel({ lastSyncedAt: "2026-07-18T09:30:45.000Z" })).toBe("最近同步 2026-07-18 09:30");
    expect(snapshotSyncedAtLabel(null)).toBe("暂无同步时间");
  });
});
