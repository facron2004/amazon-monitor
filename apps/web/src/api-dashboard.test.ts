import { describe, expect, it } from "vitest";
import { buildPeriodInsightReportQuery } from "./api-dashboard";

describe("buildPeriodInsightReportQuery", () => {
  it("passes the selected insight report period through to the API query", () => {
    const query = buildPeriodInsightReportQuery({
      date: "2026-06-30",
      period: "monthly",
      includeAiSummary: true
    });

    expect(query.get("endDate")).toBe("2026-06-30");
    expect(query.get("period")).toBe("monthly");
    expect(query.get("includeAiSummary")).toBe("true");
  });
});
