import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AiQualityResponse, AiRun } from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { useAiRunsStore } from "./aiRuns";

function createRun(id: number): AiRun {
  return {
    id,
    orgId: 1,
    agentType: "daily_operator",
    inputContextJson: "{}",
    outputJson: null,
    output: null,
    model: "test-model",
    status: "success",
    tokenUsage: null,
    errorMessage: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    actionFeedback: []
  };
}

function createQuality(windowDays: 7 | 30 | 90): AiQualityResponse {
  const metrics = {
    runCount: 1,
    successfulRunCount: 1,
    actionableRunCount: 1,
    actionCount: 2,
    feedbackCount: 1,
    positiveFeedbackCount: 1,
    negativeFeedbackCount: 0,
    positiveFeedbackRate: 100,
    convertedRunCount: 1,
    runConversionRate: 100,
    reviewedTaskCount: 1,
    confirmedTaskCount: 1,
    taskConfirmationRate: 100
  };
  return {
    windowDays,
    rangeStart: "2026-07-18T08:00:00.000Z",
    rangeEnd: "2026-07-25T08:00:00.000Z",
    generatedAt: "2026-07-25T08:00:00.000Z",
    totals: metrics,
    agents: [{ agentType: "daily_operator", ...metrics }]
  };
}

describe("useAiRunsStore pagination", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("keeps server pagination metadata and requests the selected page", async () => {
    const listRuns = vi.spyOn(aiApi, "listRuns").mockImplementation(async (params) => ({
      runs: [],
      total: 125,
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0
    }));
    const store = useAiRunsStore();

    await store.fetchRuns();
    await store.goToPage(3);

    expect(store.total).toBe(125);
    expect(store.currentPage).toBe(3);
    expect(store.pageCount).toBe(3);
    expect(listRuns).toHaveBeenLastCalledWith({
      agentType: undefined,
      status: undefined,
      limit: 50,
      offset: 100
    });
  });

  it("resets to the first page when filters or page size change", async () => {
    const listRuns = vi.spyOn(aiApi, "listRuns").mockImplementation(async (params) => ({
      runs: [],
      total: 80,
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0
    }));
    const store = useAiRunsStore();
    await store.fetchRuns();
    await store.goToPage(2);

    store.agentType = "competitor_analyst";
    store.limit = 25;
    await store.resetAndFetch();

    expect(store.currentPage).toBe(1);
    expect(listRuns).toHaveBeenLastCalledWith({
      agentType: "competitor_analyst",
      status: undefined,
      limit: 25,
      offset: 0
    });
  });

  it("clamps requested pages to the available range", async () => {
    vi.spyOn(aiApi, "listRuns").mockImplementation(async (params) => ({
      runs: [],
      total: 60,
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0
    }));
    const store = useAiRunsStore();
    await store.fetchRuns();

    await store.goToPage(99);

    expect(store.currentPage).toBe(2);
    expect(store.offset).toBe(50);
  });

  it("moves the selected run to the visible page", async () => {
    vi.spyOn(aiApi, "listRuns").mockImplementation(async (params) => ({
      runs: [createRun((params?.offset ?? 0) + 1)],
      total: 2,
      limit: params?.limit ?? 1,
      offset: params?.offset ?? 0
    }));
    const store = useAiRunsStore();
    store.limit = 1;

    await store.fetchRuns();
    expect(store.selectedRunId).toBe(1);

    await store.goToPage(2);

    expect(store.selectedRunId).toBe(2);
    expect(store.selectedRun?.id).toBe(2);
  });

  it("loads the selected quality window independently from run pagination", async () => {
    const getQuality = vi
      .spyOn(aiApi, "getQuality")
      .mockImplementation(async (days) => createQuality(days));
    const store = useAiRunsStore();
    store.qualityDays = 7;

    await store.fetchQuality();

    expect(getQuality).toHaveBeenCalledWith(7);
    expect(store.quality?.windowDays).toBe(7);
    expect(store.quality?.totals.positiveFeedbackRate).toBe(100);
    expect(store.qualityError).toBeNull();
  });
});
