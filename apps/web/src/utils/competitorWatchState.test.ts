import type { AsinWatchState, CompetitorPoolItem } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  competitorWatchLabel,
  competitorWatchLevel,
  competitorWatchReason,
  competitorWatchTagType,
  findCompetitorWatchState,
  normalizeCompetitorWatchLevel
} from "./competitorWatchState";

const watchState: AsinWatchState = {
  asin: "B0CORE0001",
  watchLevel: "CORE",
  watchReason: "Manual priority",
  firstWatchDate: "2026-06-20",
  lastEventDate: "2026-06-22",
  note: null,
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z"
};

const competitor = {
  asin: "B0CORE0001",
  competitorReasons: ["Top20 category competitor"]
} as CompetitorPoolItem;

describe("competitor watch state helpers", () => {
  it("resolves a watch state by ASIN and defaults missing rows to NORMAL", () => {
    expect(findCompetitorWatchState([watchState], "B0CORE0001")).toBe(watchState);
    expect(findCompetitorWatchState([watchState], "B0MISS0001")).toBeNull();
    expect(competitorWatchLevel(null)).toBe("NORMAL");
  });

  it("normalizes unsafe select values", () => {
    expect(normalizeCompetitorWatchLevel("CORE")).toBe("CORE");
    expect(normalizeCompetitorWatchLevel("bad")).toBe("NORMAL");
  });

  it("maps watch state into readable Element Plus tags", () => {
    expect(competitorWatchLabel(watchState)).toBe("核心竞品");
    expect(competitorWatchTagType("CORE")).toBe("danger");
    expect(competitorWatchTagType("POTENTIAL")).toBe("warning");
    expect(competitorWatchTagType("NORMAL")).toBe("info");
  });

  it("uses competitor evidence as the default watch reason", () => {
    expect(competitorWatchReason(competitor)).toBe("Top20 category competitor");
  });

  it("uses a Chinese operator-facing fallback reason", () => {
    expect(competitorWatchReason({ ...competitor, competitorReasons: [] } as CompetitorPoolItem)).toBe("运营手动设置竞品池优先级");
  });
});
