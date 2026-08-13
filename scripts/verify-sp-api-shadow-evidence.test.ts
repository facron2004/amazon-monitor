import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateEvidenceBundle, type ShadowEvidenceValidation } from "./sp-api-shadow-evidence-validation.js";

function readExample(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL("./fixtures/sp-api-shadow-evidence.example.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function firstDay(evidence: Record<string, unknown>): Record<string, unknown> {
  const days = evidence.days;
  if (!Array.isArray(days) || typeof days[0] !== "object" || days[0] === null || Array.isArray(days[0])) {
    throw new Error("example fixture must contain a first day");
  }
  return days[0] as Record<string, unknown>;
}

function resultWithExample(evidence: unknown): ShadowEvidenceValidation {
  return validateEvidenceBundle(evidence, { allowExample: true });
}

describe("SP-API shadow evidence validation", () => {
  it("accepts the seven-day redacted example only when explicitly allowed", () => {
    const evidence = readExample();

    expect(validateEvidenceBundle(evidence).ok).toBe(false);
    expect(resultWithExample(evidence)).toMatchObject({
      ok: true,
      evidenceMode: "example",
      dayCount: 7,
      statuses: ["pass", "pass", "pass", "pass", "pass", "pass", "pass"],
    });
  });

  it("rejects an amount mismatch, mapping issue, and non-idempotent replay", () => {
    const evidence = readExample();
    const day = firstDay(evidence);
    day.mappingIssues = ["SKU-UNMAPPED"];
    day.sales = {
      ...(day.sales as Record<string, unknown>),
      skuAmountMinor: 9999,
      replayCreatedRecords: 1,
    };

    const result = resultWithExample(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "days[0].sales",
      "days[0].sales.replayCreatedRecords",
      "days[0].mappingIssues",
    ]));
  });

  it("rejects missing dates and credential-like fields", () => {
    const evidence = readExample();
    const days = evidence.days as Array<Record<string, unknown>>;
    days[1].businessDate = days[0].businessDate;
    evidence.accessToken = "should-never-be-accepted";

    const result = resultWithExample(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "$.accessToken",
      "$.days",
    ]));
  });

  it("supports report-only inspection but keeps release acceptance strict", () => {
    const evidence = readExample();
    firstDay(evidence).status = "delayed";

    expect(validateEvidenceBundle(evidence, { allowExample: true }).ok).toBe(false);
    expect(validateEvidenceBundle(evidence, { allowExample: true, requireAllPass: false })).toMatchObject({ ok: true });
  });

  it("keeps accepting the legacy v1 shape without asOfRows", () => {
    const evidence = readExample();
    evidence.schemaVersion = 1;
    for (const day of evidence.days as Array<Record<string, unknown>>) {
      const fba = day.fba as Record<string, unknown>;
      delete fba.asOfRows;
    }
    expect(resultWithExample(evidence).ok).toBe(true);
  });

  it("requires asOfRows for the v2 historical inventory contract", () => {
    const evidence = readExample();
    const fba = firstDay(evidence).fba as Record<string, unknown>;
    delete fba.asOfRows;

    const result = resultWithExample(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain("days[0].fba.asOfRows");
  });

  it("rejects invalid timezones and source drift across the window", () => {
    const evidence = readExample();
    evidence.businessTimezone = "not/a-timezone";
    const day = firstDay(evidence);
    day.sales = { ...(day.sales as Record<string, unknown>), sourceId: "source-different" };

    const result = resultWithExample(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "$.businessTimezone",
      "$.days.sales.sourceId",
    ]));
  });
});
