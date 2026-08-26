import { describe, expect, it } from "vitest";
import {
  clampProgress,
  formatAgentOsDate,
  formatEvidenceValue,
  formatProgressPercent,
  goalStatusLabel,
  resolveAgentOsViewState,
  workflowApprovalLabel,
  workflowNodeStatusLabel
} from "./agent-os-formatters";

describe("Agent OS display formatters", () => {
  it("resolves loading, failed, empty, and ready states deterministically", () => {
    expect(resolveAgentOsViewState(true, "failed", true)).toBe("loading");
    expect(resolveAgentOsViewState(false, "network error", true)).toBe("failed");
    expect(resolveAgentOsViewState(false, null, false)).toBe("empty");
    expect(resolveAgentOsViewState(false, "", true)).toBe("ready");
  });

  it("clamps progress before formatting it for display", () => {
    expect(clampProgress(-12)).toBe(0);
    expect(clampProgress(42.6)).toBe(42.6);
    expect(formatProgressPercent(106)).toBe("100%");
    expect(formatProgressPercent(42.4)).toBe("42%");
  });

  it("formats local dates and safe fallback text", () => {
    const localDate = new Date(2026, 7, 13, 9, 5).toISOString();
    expect(formatAgentOsDate(localDate)).toBe("2026-08-13 09:05");
    expect(formatAgentOsDate(null)).toBe("未设置");
    expect(formatAgentOsDate("not-a-date")).toBe("日期无效");
    expect(formatEvidenceValue(" ")).toBe("已记录");
    expect(formatEvidenceValue("CTR +14%")).toBe("CTR +14%");
  });

  it("keeps product labels aligned with the roadmap vocabulary", () => {
    expect(goalStatusLabel("at_risk")).toBe("存在风险");
    expect(workflowNodeStatusLabel("waiting_approval")).toBe("待审批");
    expect(workflowApprovalLabel("approved")).toBe("已审批");
  });
});
