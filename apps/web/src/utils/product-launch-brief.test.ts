import { describe, expect, it } from "vitest";
import type { AiDataFreshness, AiProductLaunchBrief } from "@amazon-monitor/shared";
import { formatProductLaunchBrief } from "./product-launch-brief";

describe("formatProductLaunchBrief", () => {
  it("formats evidence, competitor rows, validation gates, and risk boundaries", () => {
    const output = formatProductLaunchBrief(brief(), staleFreshness());

    expect(output).toContain("# Ice Makers 新品立项草案");
    expect(output).toContain("决策建议：进入人工验证");
    expect(output).toContain("| B0TEST1 | Northstar | #8 | USD 99.99 | 48 | 新品黑马 \\| 低 Review |");
    expect(output).toContain("[必须] Review VOC");
    expect(output).toContain("不代表自动立项");
    expect(output).toContain("数据来源：amazon_playwright");
    expect(output).toContain("新鲜度警告：榜单证据已过期");
  });
});

function staleFreshness(): AiDataFreshness {
  return {
    evidenceDate: "2026-07-25",
    evaluatedAt: "2026-07-28T09:30:00.000Z",
    dataSource: "amazon_playwright",
    lastSyncedAt: "2026-07-25T08:00:00.000Z",
    syncStatus: "success",
    freshnessStatus: "stale",
    ageHours: 72,
    maxAgeHours: 24,
    failureReason: null,
    warning: "榜单证据已过期"
  };
}

function brief(): AiProductLaunchBrief {
  return {
    title: "Ice Makers 新品立项草案",
    evidenceDate: "2026-07-25",
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    decision: "validate",
    opportunityThesis: "存在低 Review 切入窗口。",
    priceBand: {
      minimum: 79.99,
      target: 99.99,
      maximum: 149.99,
      currency: "USD",
      evidence: "10 个价格样本。"
    },
    customerPainEvidence: {
      status: "data_gap",
      conclusion: "尚无 VOC 证据。",
      evidence: ["本次未输入评论文本。"],
      validationNeeded: ["导入目标 ASIN 评论。"]
    },
    competitorMatrix: [{
      asin: "B0TEST1",
      brand: "Northstar",
      title: "Countertop Ice Maker",
      rank: 8,
      price: 99.99,
      reviewCount: 48,
      signal: "新品黑马 | 低 Review",
      evidence: ["BSR #8"]
    }],
    differentiationHypotheses: [{
      hypothesis: "验证中位价格的价值组合。",
      evidence: ["中位价格 USD 99.99"],
      validationNeeded: "补齐成本。"
    }],
    validationChecklist: [{
      item: "Review VOC",
      gate: "required",
      evidenceRequired: "评论主题与原文。"
    }],
    riskNotes: ["本草案不代表自动立项。"]
  };
}
