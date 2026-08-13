import { describe, expect, it } from "vitest";
import {
  dataSourceCheckpointText,
  parseDataSourceCheckpointSummary
} from "./data-source-display";

describe("data source checkpoint display", () => {
  it("parses a resumable FBA checkpoint without trusting arbitrary JSON", () => {
    const summary = parseDataSourceCheckpointSummary(JSON.stringify({
      version: 1,
      startDateTime: "2026-08-10T00:00:00.000Z",
      nextToken: "page-2",
      pagesCompleted: 1,
      rowsSeen: 10,
      importedRows: 9,
      createdRecords: 8,
      updatedRecords: 1,
      unmappedRows: 1,
      completed: false
    }));

    expect(summary).toMatchObject({
      pagesCompleted: 1,
      rowsSeen: 10,
      importedRows: 9,
      nextToken: "page-2",
      completed: false
    });
    expect(dataSourceCheckpointText(JSON.stringify(summary))).toBe(
      "Checkpoint: 1 page · 9/10 imported · resumable"
    );
  });

  it("renders a completed checkpoint and rejects invalid or inconsistent summaries", () => {
    const completed = JSON.stringify({
      version: 1,
      nextToken: null,
      pagesCompleted: 2,
      rowsSeen: 12,
      importedRows: 12,
      createdRecords: 12,
      updatedRecords: 0,
      unmappedRows: 0,
      completed: true
    });

    expect(dataSourceCheckpointText(completed)).toBe(
      "Checkpoint: 2 pages · 12/12 imported · complete"
    );
    expect(parseDataSourceCheckpointSummary("not-json")).toBeNull();
    expect(parseDataSourceCheckpointSummary(JSON.stringify({
      version: 1,
      nextToken: "unsafe-token",
      pagesCompleted: 2,
      rowsSeen: 12,
      importedRows: 12,
      createdRecords: 12,
      updatedRecords: 0,
      unmappedRows: 0,
      completed: true
    }))).toBeNull();
  });
});
