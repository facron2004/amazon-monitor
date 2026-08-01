import { describe, expect, it } from "vitest";
import { parseAgentToolInput } from "./tool-schemas.js";
import { formatPlannedAgentEvidence, planAgentToolCalls } from "./tool-planner.js";

const scope = {
  categoryId: 1,
  keywordId: 2,
  asin: "B000000001",
  marketplace: "amazon.com",
  maxAgeHours: 24,
};

describe("Agent tool planner", () => {
  it("covers the two business dimensions in a breakout question", () => {
    const tools = planAgentToolCalls("最近 7 天哪些新品进入类目 Top50？", "investigation", scope)
      .map(({ toolName }) => toolName);
    expect(tools).toEqual(expect.arrayContaining([
      "find_new_product_breakouts",
      "get_category_snapshot",
    ]));
  });

  it("covers ASIN investigation dimensions without emitting invalid inputs", () => {
    const plans = planAgentToolCalls(
      "调查 B000000001 最近 30 天的竞争态势，关注关键词、价格、Coupon 和评论",
      "investigation",
      scope,
    );
    expect(plans.map(({ toolName }) => toolName)).toEqual(expect.arrayContaining([
      "get_asin_history",
      "get_keyword_ranking",
      "get_price_history",
      "get_promotion_timeline",
      "get_review_growth",
    ]));
    for (const plan of plans) {
      expect(() => parseAgentToolInput(plan.toolName, plan.input)).not.toThrow();
    }
  });

  it("keeps anomaly and patrol planning bounded to read-only tools", () => {
    const tools = planAgentToolCalls("执行每日巡检并找出排名异常", "patrol", scope)
      .map(({ toolName }) => toolName);
    expect(tools).toEqual(expect.arrayContaining([
      "get_category_snapshot",
      "get_keyword_ranking",
      "find_rank_anomalies",
      "find_new_product_breakouts",
    ]));
    expect(tools).not.toContain("check_data_freshness");
  });

  it("formats a compact evidence summary for the model context", () => {
    const summary = formatPlannedAgentEvidence([{
      toolName: "get_category_snapshot",
      envelope: {
        data: [{ id: 1, title: "example" }],
        evidenceRefs: [{ kind: "snapshot", id: "1", label: "snapshot", observedAt: null }],
        freshness: {
          status: "fresh",
          checkedAt: "2026-08-01T00:00:00.000Z",
          maxAgeHours: 24,
          oldestEvidenceAt: null,
          staleSources: [],
          dataGaps: [],
          warnings: [],
        },
        dataGaps: [],
        warnings: [],
      },
    }]);
    expect(summary).toContain('"tool":"get_category_snapshot"');
    expect(summary).toContain('"evidenceRefs"');
  });
});
