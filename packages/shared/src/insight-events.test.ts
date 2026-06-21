import { describe, expect, it } from "vitest";
import { attributionTagLabels, attributionTags, insightEventStatuses, insightEventTypeLabels, insightEventTypes, insightScoreLevels } from "./insight-events.js";

describe("insight event shared contract", () => {
  it("exports the P0 action center event and workflow enums", () => {
    expect(insightEventTypes).toContain("NEW_TOP100_ENTRY");
    expect(insightEventTypes).toContain("BRAND_MATRIX_SURGE");
    expect(insightEventTypes).toContain("CORE_COMPETITOR_RISK");
    expect(attributionTags).toContain("NO_CLEAR_DRIVER");
    expect(insightEventStatuses).toEqual(["TODO", "WATCHING", "FOLLOWED", "IGNORED", "REVIEW_PENDING", "REVIEWED"]);
    expect(insightScoreLevels).toEqual(["S", "A", "B", "C", "D"]);
  });

  it("exposes Chinese label maps that cover every enum value (single source for ui + api)", () => {
    for (const type of insightEventTypes) {
      expect(insightEventTypeLabels[type]).toBeTypeOf("string");
    }
    for (const tag of attributionTags) {
      expect(attributionTagLabels[tag]).toBeTypeOf("string");
    }
  });
});
