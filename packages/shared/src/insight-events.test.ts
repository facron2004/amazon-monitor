import { describe, expect, it } from "vitest";
import {
  asinWatchLevelLabels,
  asinWatchLevels,
  attributionTagLabels,
  attributionTags,
  insightEventStatuses,
  insightEventStatusLabels,
  insightEventSortKeys,
  insightEventTypeLabels,
  insightEventTypes,
  insightReviewResultLabels,
  insightReviewResults,
  insightScoreLevels
} from "./insight-events.js";

describe("insight event shared contract", () => {
  it("exports the P0 action center event and workflow enums", () => {
    expect(insightEventTypes).toContain("NEW_TOP100_ENTRY");
    expect(insightEventTypes).toContain("BRAND_MATRIX_SURGE");
    expect(insightEventTypes).toContain("CORE_COMPETITOR_RISK");
    expect(attributionTags).toContain("NO_CLEAR_DRIVER");
    expect(insightEventStatuses).toEqual(["TODO", "WATCHING", "FOLLOWED", "IGNORED", "REVIEW_PENDING", "REVIEWED", "CONVERTED_TO_TASK"]);
    expect(insightReviewResults).toEqual(["CONFIRMED", "REVERTED", "CONTINUING", "FAILED", "UNCLEAR"]);
    expect(asinWatchLevels).toEqual(["CORE", "NORMAL", "POTENTIAL", "IGNORED"]);
    expect(insightScoreLevels).toEqual(["S", "A", "B", "C", "D"]);
    expect(insightEventSortKeys).toEqual(["score", "level", "rankChange", "reviewChange", "createdAt"]);
  });

  it("exposes Chinese label maps that cover every enum value (single source for ui + api)", () => {
    for (const type of insightEventTypes) {
      expect(insightEventTypeLabels[type]).toBeTypeOf("string");
    }
    for (const tag of attributionTags) {
      expect(attributionTagLabels[tag]).toBeTypeOf("string");
    }
    for (const status of insightEventStatuses) {
      expect(insightEventStatusLabels[status]).toBeTypeOf("string");
    }
    for (const result of insightReviewResults) {
      expect(insightReviewResultLabels[result]).toBeTypeOf("string");
    }
    for (const level of asinWatchLevels) {
      expect(asinWatchLevelLabels[level]).toBeTypeOf("string");
    }
  });

  it("keeps shared Chinese labels readable for reports and charts", () => {
    expect(insightEventTypeLabels).toMatchObject({
      NEW_TOP100_ENTRY: "新进 Top100",
      RANK_SURGE: "排名快速上升",
      BRAND_MATRIX_SURGE: "品牌矩阵上攻",
      CORE_COMPETITOR_RISK: "核心竞品威胁"
    });
    expect(attributionTagLabels).toMatchObject({
      PRICE_DRIVEN: "价格驱动",
      ORGANIC_STRENGTH: "疑似自然转化增强",
      NO_CLEAR_DRIVER: "暂无明显驱动"
    });
    expect(insightEventStatusLabels).toMatchObject({
      TODO: "待处理",
      REVIEW_PENDING: "待复盘",
      REVIEWED: "已复盘"
    });
    expect(insightReviewResultLabels).toMatchObject({
      CONFIRMED: "判断成立",
      REVERTED: "短期冲榜后回落",
      UNCLEAR: "数据不足"
    });
    expect(asinWatchLevelLabels).toMatchObject({
      CORE: "核心竞品",
      POTENTIAL: "潜在竞品",
      IGNORED: "已忽略"
    });
  });
});
