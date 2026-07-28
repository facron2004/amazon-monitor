import { defineStore } from "pinia";
import {
  deriveAsinDualScore,
  inferInsightEventStrategyTags,
  isActionStageMatch,
  type ActionStageFilter,
  type AiActionFeedbackValue,
  type AiDailyBriefResponse,
  type AttributionTag,
  type StrategyTag,
  type TopInsightFilterOptions,
  type TopInsightFilters
} from "@amazon-monitor/shared";
import type {
  AsinWatchLevel,
  AsinWatchState,
  BrandPlaybookProfile,
  BsrRankHistory,
  InsightEvent,
  InsightEventLevel,
  InsightEventNote,
  InsightEventSortKey,
  InsightEventStatus,
  InsightEventType,
  InsightEventTrendPoint,
  InsightReviewResult,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { insightEventApi, type InsightEventQuery, type InsightEventTrendQuery } from "../api-insight-events";
import { aiApi } from "../api-ai";
import { replaceAiActionFeedback } from "../utils/ai-action-feedback";
import {
  isActionEvidenceMovementMatch,
  type ActionEvidenceMovementFilter
} from "../utils/actionCenterEvidenceDeltas";
import {
  isReviewCadenceBucketMatch,
  type ReviewCadenceBucketKey
} from "../utils/actionCenterReviewCadence";
import {
  isActionScoreDriverMatch,
  type ActionScoreDriverFilter
} from "../utils/actionCenterScoreBreakdown";

export type InsightEventSort = InsightEventSortKey;
export type ActionCenterColumnKey = "todo" | "mid" | "closed";
export type ActionWorkView = "columns" | "cases";
export type TopSummaryFilters = Required<TopInsightFilters>;
export type TopSummaryFilterKey = keyof TopSummaryFilters;

export interface InsightEventFilters {
  date: string;
  status: InsightEventStatus | "";
  level: InsightEventLevel | "";
  eventType: InsightEventType | "";
  reviewResult: InsightReviewResult | "";
  brand: string;
  asin: string;
  assignee: string;
  attributionTag: AttributionTag | "";
  evidenceMovement: ActionEvidenceMovementFilter | "";
  reviewCadence: ReviewCadenceBucketKey | "";
  actionStage: ActionStageFilter | "";
  scoreDriver: ActionScoreDriverFilter | "";
  strategyTag: StrategyTag | "";
  unassignedOnly: boolean;
  sortBy: InsightEventSort;
  coreOnly: boolean;
  newBreakoutOnly: boolean;
  reviewDueOnly: boolean;
}

export const useInsightEventsStore = defineStore("insightEvents", {
  state: () => ({
    events: [] as InsightEvent[],
    topSummary: [] as InsightEvent[],
    topSummaryDate: "",
    topSummaryFilters: createTopSummaryFilters(),
    topSummaryFilterOptions: createTopSummaryFilterOptions(),
    dailyBrief: null as AiDailyBriefResponse | null,
    selectedEvent: null as InsightEvent | null,
    activeColumn: null as ActionCenterColumnKey | null,
    drawerOpen: false,
    workView: "columns" as ActionWorkView,
    reviewDueEvents: [] as InsightEvent[],
    trend: [] as InsightEventTrendPoint[],
    brandPlaybook: null as BrandPlaybookProfile | null,
    selectedEventNotes: [] as InsightEventNote[],
    selectedBsrHistory: [] as BsrRankHistory[],
    selectedPriceHistory: [] as ProductPriceHistory[],
    watchStates: [] as AsinWatchState[],
    loading: false,
    generating: false,
    reviewing: false,
    brandPlaybookLoading: false,
    eventNotesLoading: false,
    bsrHistoryLoading: false,
    priceHistoryLoading: false,
    topSummaryLoading: false,
    dailyBriefLoading: false,
    dailyBriefFeedbackLoadingKey: null as string | null,
    error: "",
    filters: createInsightEventFilters()
  }),
  getters: {
    todoCount: (state) => state.events.filter((event) => event.status === "TODO").length,
    watchingCount: (state) => state.events.filter((event) => event.status === "WATCHING").length,
    p0Count: (state) => state.events.filter((event) => event.eventLevel === "P0").length,
    p1Count: (state) => state.events.filter((event) => event.eventLevel === "P1").length,
    reviewedConfirmedCount: (state) => state.events.filter((event) => event.reviewResult === "CONFIRMED").length,
    coreRiskCount: (state) => state.events.filter((event) => event.eventType === "CORE_COMPETITOR_RISK").length,
    visibleEvents: (state) => filterAndSortEvents(state.events, state.watchStates, state.filters),
    visibleAsinGroups(state): AsinGroupedView[] {
      // Group from the filtered set so toggles (核心竞品/新品/待复盘) still apply.
      return groupEventsByAsin(
        filterAndSortEvents(state.events, state.watchStates, state.filters),
        state.watchStates
      );
    }
  },
  actions: {
    focusCompetitorInsights(date: string, asin?: string) {
      this.selectedEvent = null;
      this.activeColumn = null;
      this.drawerOpen = false;
      this.workView = "cases";
      this.filters = {
        ...createInsightEventFilters(date),
        asin: asin ?? "",
        coreOnly: !asin
      };
    },
    async loadEvents(date?: string, signal?: AbortSignal) {
      if (date) {
        this.filters.date = date;
      }
      await this.withLoading(async () => {
        const events = shouldFetchReviewDueEvents(this.filters)
          ? await insightEventApi.fetchAllReviewDueEvents(this.filters.date, buildInsightEventReviewDueQuery(this.filters), { signal })
          : await insightEventApi.fetchAllInsightEvents(buildInsightEventListQuery(this.filters), { signal });
        if (signal?.aborted) return;
        this.events = events;
        if (this.selectedEvent) {
          this.selectedEvent = this.events.find((event) => event.id === this.selectedEvent?.id) ?? this.selectedEvent;
        }
      }, signal);
    },
    async loadTopSummary(date: string, signal?: AbortSignal) {
      this.topSummaryLoading = true;
      this.error = "";
      try {
        const [result, filterOptions] = await Promise.all([
          insightEventApi.fetchTopInsights(date, this.topSummaryFilters, 5, { signal }),
          insightEventApi.fetchTopInsightFilterOptions(date, { signal })
        ]);
        if (signal?.aborted) return;
        this.topSummaryDate = date;
        this.topSummary = result;
        this.topSummaryFilterOptions = filterOptions;
      } catch (error) {
        if (signal?.aborted) return;
        this.error = error instanceof Error ? error.message : String(error);
        this.topSummary = [];
      } finally {
        if (!signal?.aborted) {
          this.topSummaryLoading = false;
        }
      }
    },
    async setTopSummaryFilter(key: TopSummaryFilterKey, value: string) {
      this.topSummaryFilters[key] = value;
      if (this.topSummaryDate) {
        await this.loadTopSummary(this.topSummaryDate);
      }
    },
    async clearTopSummaryFilters() {
      this.topSummaryFilters = createTopSummaryFilters();
      if (this.topSummaryDate) {
        await this.loadTopSummary(this.topSummaryDate);
      }
    },
    async generateDailyBrief(date: string) {
      this.dailyBriefLoading = true;
      this.error = "";
      try {
        const result = await aiApi.generateDailyBrief(date);
        this.dailyBrief = result;
        if (hasActiveTopSummaryFilters(this.topSummaryFilters)) {
          await this.loadTopSummary(date);
        } else {
          this.topSummary = result.topEvents;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.dailyBriefLoading = false;
      }
    },
    async setDailyBriefActionFeedback(actionIndex: number, value: AiActionFeedbackValue) {
      const brief = this.dailyBrief;
      if (!brief || this.dailyBriefFeedbackLoadingKey !== null) return;
      const loadingKey = `${brief.run.id}:${actionIndex}`;
      this.dailyBriefFeedbackLoadingKey = loadingKey;
      this.error = "";
      try {
        const feedback = await aiApi.setActionFeedback(brief.run.id, actionIndex, value);
        if (this.dailyBrief?.run.id === brief.run.id) {
          this.dailyBrief.run.actionFeedback = replaceAiActionFeedback(
            this.dailyBrief.run.actionFeedback,
            feedback
          );
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (this.dailyBriefFeedbackLoadingKey === loadingKey) {
          this.dailyBriefFeedbackLoadingKey = null;
        }
      }
    },
    async loadEventDetail(id: string) {
      this.selectedEvent = await insightEventApi.fetchInsightEvent(id);
      await Promise.all([
        this.loadEventNotes(id),
        this.loadBrandPlaybookForEvent(this.selectedEvent),
        this.loadBsrHistoryForEvent(this.selectedEvent),
        this.loadPriceHistoryForEvent(this.selectedEvent)
      ]);
    },
    async loadEventNotes(id: string, signal?: AbortSignal) {
      this.selectedEventNotes = [];
      this.eventNotesLoading = true;
      try {
        const notes = await insightEventApi.fetchInsightEventNotes(id, { signal });
        if (signal?.aborted) return;
        this.selectedEventNotes = notes;
      } catch (error) {
        if (signal?.aborted) return;
        this.selectedEventNotes = [];
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        if (!signal?.aborted) {
          this.eventNotesLoading = false;
        }
      }
    },
    async loadBrandPlaybookForEvent(event: InsightEvent | null, signal?: AbortSignal) {
      this.brandPlaybook = null;
      if (!event?.brand || event.categoryId === null) {
        return;
      }
      this.brandPlaybookLoading = true;
      try {
        const profile = await insightEventApi.fetchBrandPlaybook({
          categoryId: event.categoryId,
          brand: event.brand,
          date: event.eventDate,
          windowDays: 30
        }, { signal });
        if (signal?.aborted) return;
        this.brandPlaybook = profile;
      } catch (error) {
        if (signal?.aborted) return;
        this.brandPlaybook = null;
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        if (!signal?.aborted) {
          this.brandPlaybookLoading = false;
        }
      }
    },
    async loadBsrHistoryForEvent(event: InsightEvent | null, signal?: AbortSignal) {
      this.selectedBsrHistory = [];
      if (!event?.asin || event.categoryId === null) {
        return;
      }
      this.bsrHistoryLoading = true;
      try {
        const rows = await insightEventApi.fetchBsrRankHistory({
          sourceType: "category_bestseller",
          sourceId: event.categoryId,
          asin: event.asin,
          limit: 30
        }, { signal });
        if (signal?.aborted) return;
        this.selectedBsrHistory = rows;
      } catch (error) {
        if (signal?.aborted) return;
        this.selectedBsrHistory = [];
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        if (!signal?.aborted) {
          this.bsrHistoryLoading = false;
        }
      }
    },
    async loadPriceHistoryForEvent(event: InsightEvent | null, signal?: AbortSignal) {
      this.selectedPriceHistory = [];
      if (!event?.asin) {
        return;
      }
      this.priceHistoryLoading = true;
      try {
        const rows = await insightEventApi.fetchProductPriceHistory({
          categoryId: event.categoryId,
          asin: event.asin,
          limit: 30
        }, { signal });
        if (signal?.aborted) return;
        this.selectedPriceHistory = rows;
      } catch (error) {
        if (signal?.aborted) return;
        this.selectedPriceHistory = [];
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        if (!signal?.aborted) {
          this.priceHistoryLoading = false;
        }
      }
    },
    async loadReviewDueEvents(date?: string, signal?: AbortSignal) {
      const targetDate = date ?? this.filters.date;
      if (!targetDate) {
        this.reviewDueEvents = [];
        return;
      }
      const result = await insightEventApi.fetchAllReviewDueEvents(
        targetDate,
        buildInsightEventReviewDueQuery({ ...this.filters, date: targetDate }),
        { signal }
      );
      if (signal?.aborted) return;
      this.reviewDueEvents = result;
    },
    async loadTrend(date?: string, signal?: AbortSignal) {
      const targetDate = date ?? this.filters.date;
      if (!targetDate) {
        this.trend = [];
        return;
      }
      const result = await insightEventApi.fetchInsightEventTrend(buildTrendQuery(this.filters, targetDate), { signal });
      if (signal?.aborted) return;
      this.trend = result;
    },
    async loadWatchStates(signal?: AbortSignal) {
      const result = await insightEventApi.fetchAsinWatchStates({ signal });
      if (signal?.aborted) return;
      this.watchStates = result;
    },
    async generateEvents(date?: string) {
      if (date) {
        this.filters.date = date;
      }
      this.generating = true;
      this.error = "";
      try {
        this.events = await insightEventApi.generateInsightEvents(this.filters.date);
        await this.loadReviewDueEvents(this.filters.date);
        await this.loadWatchStates();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.generating = false;
      }
    },
    async setStatus(id: string, status: InsightEventStatus, reviewDueDate?: string | null) {
      const event = await insightEventApi.updateInsightEventStatus(id, { status, reviewDueDate });
      this.replaceEvent(event);
    },
    async setNote(id: string, note: string) {
      const event = await insightEventApi.updateInsightEventNote(id, note);
      this.replaceEvent(event);
      if (this.selectedEvent?.id === id) {
        await this.loadEventNotes(id);
      }
    },
    async setAssignee(id: string, assignee: string | null) {
      const event = await insightEventApi.updateInsightEventAssignee(id, { assignee });
      this.replaceEvent(event);
    },
    async watchEvent(id: string) {
      const result = await insightEventApi.watchInsightEvent(id, { watchLevel: "POTENTIAL" });
      if (result.event) {
        this.replaceEvent(result.event);
      }
      await this.loadWatchStates();
    },
    async setWatchState(event: InsightEvent, watchLevel: AsinWatchLevel) {
      if (!event.asin) {
        return;
      }
      const current = this.watchStates.find((state) => state.asin === event.asin);
      const updated = await insightEventApi.updateAsinWatchState(event.asin, {
        watchLevel,
        watchReason: current?.watchReason ?? event.eventTitle,
        note: current?.note ?? null,
        firstWatchDate: current?.firstWatchDate ?? event.eventDate,
        lastEventDate: event.eventDate
      });
      const index = this.watchStates.findIndex((state) => state.asin === updated.asin);
      if (index >= 0) {
        this.watchStates.splice(index, 1, updated);
      } else {
        this.watchStates.push(updated);
      }
    },
    async reviewEvent(id: string, result: InsightReviewResult, note?: string | null, date?: string) {
      const event = await insightEventApi.reviewInsightEvent(id, { date, result, note });
      this.replaceEvent(event);
      if (this.selectedEvent?.id === id) {
        await this.loadEventNotes(id);
      }
      await this.loadReviewDueEvents(this.filters.date);
    },
    async evaluateReviewDueEvents(date?: string) {
      const targetDate = date ?? this.filters.date;
      if (!targetDate) {
        return [];
      }
      this.filters.date = targetDate;
      this.reviewing = true;
      this.error = "";
      try {
        const reviewed = await insightEventApi.evaluateReviewDueEvents(targetDate);
        for (const event of reviewed) {
          this.replaceEvent(event);
        }
        await this.loadReviewDueEvents(targetDate);
        return reviewed;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.reviewing = false;
      }
    },
    replaceEvent(event: InsightEvent) {
      const index = this.events.findIndex((item) => item.id === event.id);
      if (index >= 0) {
        this.events.splice(index, 1, event);
      } else {
        this.events.unshift(event);
      }
      if (this.selectedEvent?.id === event.id) {
        this.selectedEvent = event;
      }
    },
    async withLoading(work: () => Promise<void>, signal?: AbortSignal) {
      this.loading = true;
      this.error = "";
      try {
        await work();
      } catch (error) {
        if (signal?.aborted) return;
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (!signal?.aborted) {
          this.loading = false;
        }
      }
    }
  }
});

export function createInsightEventFilters(date = ""): InsightEventFilters {
  return {
    date,
    status: "",
    level: "",
    eventType: "",
    reviewResult: "",
    brand: "",
    asin: "",
    assignee: "",
    attributionTag: "",
    evidenceMovement: "",
    reviewCadence: "",
    actionStage: "",
    scoreDriver: "",
    strategyTag: "",
    unassignedOnly: false,
    sortBy: "score",
    coreOnly: false,
    newBreakoutOnly: false,
    reviewDueOnly: false
  };
}

function createTopSummaryFilters(): TopSummaryFilters {
  return {
    marketplace: "",
    categoryName: "",
    brand: "",
    assignee: ""
  };
}

function createTopSummaryFilterOptions(): TopInsightFilterOptions {
  return {
    marketplaces: [],
    categoryNames: [],
    brands: [],
    assignees: []
  };
}

function hasActiveTopSummaryFilters(filters: TopSummaryFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export function filterAndSortEvents(events: InsightEvent[], watchStates: AsinWatchState[], filters: InsightEventFilters): InsightEvent[] {
  const coreAsins = new Set(watchStates.filter((state) => state.watchLevel === "CORE").map((state) => state.asin));
  const assignee = filters.unassignedOnly ? "" : filters.assignee.trim();
  const brand = filters.brand.trim();
  const asin = filters.asin.trim();
  return events
    .filter((event) => !filters.status || event.status === filters.status)
    .filter((event) => !filters.level || event.eventLevel === filters.level)
    .filter((event) => !filters.eventType || event.eventType === filters.eventType)
    .filter((event) => !filters.reviewResult || event.reviewResult === filters.reviewResult)
    .filter((event) => !brand || event.brand === brand)
    .filter((event) => !asin || event.asin === asin)
    .filter((event) => !filters.unassignedOnly || event.assignee === null)
    .filter((event) => !assignee || event.assignee === assignee)
    .filter((event) => !filters.attributionTag || event.attributionTags.includes(filters.attributionTag))
    .filter((event) => !filters.evidenceMovement || isActionEvidenceMovementMatch(event, filters.evidenceMovement))
    .filter((event) => !filters.reviewCadence || isReviewCadenceBucketMatch(event, filters.reviewCadence, filters.date))
    .filter((event) => !filters.actionStage || isActionStageMatch(event, filters.actionStage, filters.date))
    .filter((event) => !filters.scoreDriver || isActionScoreDriverMatch(event, filters.scoreDriver))
    .filter((event) => !filters.strategyTag || inferInsightEventStrategyTags(event).includes(filters.strategyTag))
    .filter((event) => !filters.coreOnly || event.evidence.isCoreCompetitor === true || (event.asin !== null && coreAsins.has(event.asin)))
    .filter((event) => !filters.newBreakoutOnly || event.eventType === "NEW_PRODUCT_BREAKOUT")
    .filter((event) => filters.reviewCadence ? true : !filters.reviewDueOnly || isReviewDue(event, filters.date))
    .sort(eventComparator(filters.sortBy));
}

function shouldFetchReviewDueEvents(filters: InsightEventFilters): boolean {
  return filters.reviewDueOnly || filters.reviewCadence === "overdue" || filters.reviewCadence === "today";
}

function isReviewDue(event: InsightEvent, date: string): boolean {
  return event.status !== "REVIEWED" && event.reviewDueDate !== null && Boolean(date) && event.reviewDueDate <= date;
}

export interface AsinGroupedView {
  /** ASIN identifier (null for non-product events is excluded from grouping) */
  asin: string;
  /** Representative event — the one with the highest scoreTotal in the group */
  representative: InsightEvent;
  /** All events for this ASIN, sorted by scoreTotal desc */
  events: InsightEvent[];
  /** Merged attribution tags (deduped) */
  attributionTags: AttributionTag[];
  /** Merged strategy tags (deduped) */
  strategyTags: StrategyTag[];
  /** Top eventLevel in the group, ordered P0 > P1 > P2 */
  topLevel: InsightEventLevel;
  /** Watch state from backend, when present */
  watchLevel: AsinWatchLevel | null;
  /** Highest score in the group (== representative.scoreTotal after dedupe) */
  scoreTotal: number;
  /** 0-100 opportunity score derived from ranking/product/promo breakdown */
  opportunityScore: number;
  /** 0-100 risk score derived from brand/risk breakdown */
  riskScore: number;
  opportunityReasons: string[];
  riskReasons: string[];
}

/**
 * Group insight events by ASIN for the "case file" view in Action Center.
 * Events without an ASIN (e.g. brand-level events) are excluded; they remain
 * visible in the flat list view.
 *
 * Representative event = highest scoreTotal. The group inherits the
 * representative's display fields (title, image, brand) but merges
 * attribution/strategy tags across all events in the group.
 */
export function groupEventsByAsin(
  events: InsightEvent[],
  watchStates: AsinWatchState[]
): AsinGroupedView[] {
  const watchByAsin = new Map(watchStates.map((state) => [state.asin, state]));
  const groups = new Map<string, InsightEvent[]>();

  for (const event of events) {
    if (!event.asin) continue;
    const list = groups.get(event.asin) ?? [];
    list.push(event);
    groups.set(event.asin, list);
  }

  const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };
  const result: AsinGroupedView[] = [];
  for (const [asin, groupEvents] of groups) {
    const sorted = [...groupEvents].sort((a, b) => b.scoreTotal - a.scoreTotal);
    const representative = sorted[0];
    const attributionTags = Array.from(new Set(sorted.flatMap((event) => event.attributionTags ?? [])));
    const strategyTags = Array.from(new Set(sorted.flatMap((event) => event.evidence?.strategyTags ?? [])));
    const topLevel = sorted.reduce<InsightEventLevel>(
      (best, current) => (levelWeight[current.eventLevel] > levelWeight[best] ? current.eventLevel : best),
      "P2"
    );
    const watch = watchByAsin.get(asin) ?? null;
    const dual = deriveAsinDualScore(representative.scoreBreakdown);
    result.push({
      asin,
      representative,
      events: sorted,
      attributionTags,
      strategyTags,
      topLevel,
      watchLevel: watch?.watchLevel ?? null,
      scoreTotal: representative.scoreTotal,
      opportunityScore: dual.opportunityScore,
      riskScore: dual.riskScore,
      opportunityReasons: dual.opportunityReasons,
      riskReasons: dual.riskReasons
    });
  }

  // Sort groups by the highest score, then by level weight for stable order.
  result.sort((a, b) => {
    const primary = b.scoreTotal - a.scoreTotal;
    if (primary !== 0) return primary;
    return levelWeight[b.topLevel] - levelWeight[a.topLevel];
  });
  return result;
}

function eventComparator(sortBy: InsightEventSort): (left: InsightEvent, right: InsightEvent) => number {
  const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };
  return (left, right) => {
    let primary = 0;
    if (sortBy === "level") primary = levelWeight[right.eventLevel] - levelWeight[left.eventLevel];
    if (sortBy === "rankChange") primary = (right.evidence.rankChange ?? Number.NEGATIVE_INFINITY) - (left.evidence.rankChange ?? Number.NEGATIVE_INFINITY);
    if (sortBy === "reviewChange") primary = (right.evidence.reviewCountChange ?? Number.NEGATIVE_INFINITY) - (left.evidence.reviewCountChange ?? Number.NEGATIVE_INFINITY);
    if (sortBy === "createdAt") primary = right.createdAt.localeCompare(left.createdAt);
    if (sortBy === "score") primary = right.scoreTotal - left.scoreTotal;
    return primary || right.scoreTotal - left.scoreTotal || left.eventTitle.localeCompare(right.eventTitle);
  };
}

export function buildInsightEventListQuery(filters: InsightEventFilters): InsightEventQuery {
  return {
    date: filters.date,
    reviewedOnDate: true,
    status: filters.status,
    level: filters.level,
    eventType: filters.eventType,
    reviewResult: filters.reviewResult,
    brand: filters.brand,
    asin: filters.asin,
    assignee: filters.unassignedOnly ? "" : filters.assignee,
    attributionTag: filters.attributionTag,
    evidenceMovement: filters.evidenceMovement,
    reviewCadence: filters.reviewCadence,
    actionStage: filters.actionStage,
    scoreDriver: filters.scoreDriver,
    strategyTag: filters.strategyTag,
    sortBy: filters.sortBy,
    unassignedOnly: filters.unassignedOnly ? true : undefined,
    coreOnly: filters.coreOnly ? true : undefined,
    newBreakoutOnly: filters.newBreakoutOnly ? true : undefined,
  };
}

export function buildInsightEventReviewDueQuery(filters: InsightEventFilters): Omit<InsightEventQuery, "date"> {
  return {
    status: filters.status,
    level: filters.level,
    eventType: filters.eventType,
    reviewResult: filters.reviewResult,
    brand: filters.brand,
    asin: filters.asin,
    assignee: filters.unassignedOnly ? "" : filters.assignee,
    attributionTag: filters.attributionTag,
    evidenceMovement: filters.evidenceMovement,
    reviewCadence: filters.reviewCadence,
    actionStage: filters.actionStage,
    scoreDriver: filters.scoreDriver,
    strategyTag: filters.strategyTag,
    sortBy: filters.sortBy,
    unassignedOnly: filters.unassignedOnly ? true : undefined,
    coreOnly: filters.coreOnly ? true : undefined,
    newBreakoutOnly: filters.newBreakoutOnly ? true : undefined
  };
}

function buildTrendQuery(filters: InsightEventFilters, endDate: string): InsightEventTrendQuery {
  return {
    endDate,
    days: 7,
    reviewedOnDate: true,
    status: filters.status,
    level: filters.level,
    eventType: filters.eventType,
    reviewResult: filters.reviewResult,
    brand: filters.brand,
    asin: filters.asin,
    assignee: filters.unassignedOnly ? "" : filters.assignee,
    attributionTag: filters.attributionTag,
    evidenceMovement: filters.evidenceMovement,
    reviewCadence: filters.reviewCadence,
    actionStage: filters.actionStage,
    scoreDriver: filters.scoreDriver,
    strategyTag: filters.strategyTag,
    unassignedOnly: filters.unassignedOnly ? true : undefined,
    coreOnly: filters.coreOnly ? true : undefined,
    newBreakoutOnly: filters.newBreakoutOnly ? true : undefined
  };
}
