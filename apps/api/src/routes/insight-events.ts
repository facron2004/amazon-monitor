import type { Express } from "express";
import {
  asinWatchLevels,
  actionEvidenceMovementFilters,
  actionStageFilters,
  actionScoreDriverFilters,
  attributionTags,
  insightEventLevels,
  insightEventSortKeys,
  insightEventStatuses,
  insightEventTypes,
  insightReviewResults,
  isActionEvidenceMovementMatch,
  isActionStageMatch,
  isActionScoreDriverMatch,
  isReviewCadenceBucketMatch,
  reviewCadenceBucketKeys,
  strategyTags,
  type InsightEvent,
  type InsightEventListParams,
  type InsightEventTrendPoint
} from "@amazon-monitor/shared";
import { generateInsightEvents } from "../insights/insight-event-generator.js";
import { evaluateDueInsightEventReviews } from "../insights/review-evaluator.js";
import { scheduleNextReviewDate } from "../insights/review-scheduler.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateQuery } from "./validation.js";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const booleanQuerySchema = z.union([
  z.boolean(),
  z.literal("true").transform(() => true),
  z.literal("1").transform(() => true),
  z.literal("false").transform(() => false),
  z.literal("0").transform(() => false)
]);

const insightEventListQuerySchema = z.object({
  date: dateSchema.optional(),
  reviewedOnDate: booleanQuerySchema.optional(),
  status: z.enum(insightEventStatuses).optional(),
  level: z.enum(insightEventLevels).optional(),
  eventType: z.enum(insightEventTypes).optional(),
  reviewResult: z.enum(insightReviewResults).optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  keywordId: z.coerce.number().int().min(1).optional(),
  brand: z.string().min(1).max(200).optional(),
  asin: z.string().min(1).max(30).optional(),
  assignee: z.string().trim().min(1).max(120).optional(),
  attributionTag: z.enum(attributionTags).optional(),
  evidenceMovement: z.enum(actionEvidenceMovementFilters).optional(),
  reviewCadence: z.enum(reviewCadenceBucketKeys).optional(),
  actionStage: z.enum(actionStageFilters).optional(),
  scoreDriver: z.enum(actionScoreDriverFilters).optional(),
  strategyTag: z.enum(strategyTags).optional(),
  sortBy: z.enum(insightEventSortKeys).optional(),
  unassignedOnly: booleanQuerySchema.optional(),
  coreOnly: booleanQuerySchema.optional(),
  newBreakoutOnly: booleanQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const generateInsightEventsSchema = z.object({
  date: dateSchema.optional(),
  categoryId: z.coerce.number().int().min(1).optional()
});

const evaluateReviewDueSchema = z.object({
  date: dateSchema.optional()
});

const statusPatchSchema = z.object({
  status: z.enum(insightEventStatuses),
  reviewDueDate: dateSchema.nullable().optional()
});

const notePatchSchema = z.object({
  note: z.string().max(5000)
});

const assigneePatchSchema = z.object({
  assignee: z.string().max(120).nullable()
});

const reviewSchema = z.object({
  date: dateSchema.optional(),
  result: z.enum(insightReviewResults),
  note: z.string().max(5000).nullable().optional()
});

const watchInsightEventSchema = z.object({
  watchLevel: z.enum(asinWatchLevels).optional(),
  watchReason: z.string().max(500).nullable().optional(),
  note: z.string().max(5000).nullable().optional()
});

const watchStatePatchSchema = z.object({
  watchLevel: z.enum(asinWatchLevels),
  watchReason: z.string().max(500).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  firstWatchDate: dateSchema.optional(),
  lastEventDate: dateSchema.nullable().optional()
});

const topSummaryQuerySchema = z.object({
  date: dateSchema,
  limit: z.coerce.number().int().min(1).max(20).optional()
});

const insightEventTrendQuerySchema = insightEventListQuerySchema.extend({
  endDate: dateSchema.optional(),
  days: z.coerce.number().int().min(1).max(30).optional()
});

export function registerInsightEventRoutes(app: Express, store: Store): void {
  app.get("/api/insight-events", (request, response) => {
    const query = validateQuery(insightEventListQuerySchema, request.query);
    response.json(listInsightEventsForQuery(store, query, query.date ?? getDate(request)));
  });

  // Dashboard "今日必须关注 N 件事" feed.
  // Returns up to N actionable ASIN-level events ranked by composite score.
  // Registered before /:id so the literal segment wins over the param route.
  app.get("/api/insight-events/top-summary", (request, response) => {
    const query = validateQuery(topSummaryQuerySchema, request.query);
    response.json(store.listTopInsights(query.date, query.limit ?? 5));
  });

  app.get("/api/insight-events/review-due", (request, response) => {
    const query = validateQuery(insightEventListQuerySchema, request.query);
    const { date, ...params } = query;
    const targetDate = date ?? getDate(request);
    response.json(listReviewDueEventsForQuery(store, targetDate, params));
  });

  app.get("/api/insight-events/trend", (request, response) => {
    const query = validateQuery(insightEventTrendQuerySchema, request.query);
    const { date, endDate: requestedEndDate, days, limit: _limit, offset: _offset, ...filters } = query;
    const endDate = requestedEndDate ?? date ?? getDate(request);
    response.json(buildInsightEventTrend(store, endDate, days ?? 7, filters));
  });

  app.get("/api/insight-events/:id/notes", (request, response) => {
    const id = validateEventId(request.params.id);
    const event = store.getInsightEvent(id);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    response.json(store.listInsightEventNotes(id));
  });

  app.post("/api/insight-events/review-due/evaluate", (request, response) => {
    const body = validateBody(evaluateReviewDueSchema, request.body ?? {});
    const date = optionalString(request.query.date) ?? body.date ?? getDate(request);
    response.json(evaluateDueInsightEventReviews(store, date));
  });

  app.post("/api/insight-events/generate", asyncHandler(async (request, response) => {
    const body = validateBody(generateInsightEventsSchema, request.body ?? {});
    const date = optionalString(request.query.date) ?? body.date ?? getDate(request);
    const categoryId = optionalNumber(request.query.categoryId) ?? body.categoryId;
    response.status(201).json(generateInsightEvents(store, date, { categoryId }));
  }));

  app.get("/api/insight-events/:id", (request, response) => {
    const id = validateEventId(request.params.id);
    const event = store.getInsightEvent(id);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    response.json(event);
  });

  app.patch("/api/insight-events/:id/status", (request, response) => {
    const id = validateEventId(request.params.id);
    const body = validateBody(statusPatchSchema, request.body);
    const event = store.updateInsightEventStatus(id, body.status, body.reviewDueDate);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    response.json(event);
  });

  app.patch("/api/insight-events/:id/note", (request, response) => {
    const id = validateEventId(request.params.id);
    const body = validateBody(notePatchSchema, request.body);
    const event = store.updateInsightEventNote(id, body.note);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    response.json(event);
  });

  app.patch("/api/insight-events/:id/assignee", (request, response) => {
    const id = validateEventId(request.params.id);
    const body = validateBody(assigneePatchSchema, request.body);
    const event = store.updateInsightEventAssignee(id, body.assignee);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    response.json(event);
  });

  app.post("/api/insight-events/:id/watch", (request, response) => {
    const id = validateEventId(request.params.id);
    const body = validateBody(watchInsightEventSchema, request.body ?? {});
    const event = store.getInsightEvent(id);
    if (!event) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    if (!event.asin) {
      response.status(400).json({ message: "brand-level event cannot be added to ASIN watch states" });
      return;
    }
    // 一次操作 = 创建/更新 watch state + 把 event 状态翻到 WATCHING。
    // 包在同一个事务里,避免 watch 写成功但 status 写失败造成的
    // "chip 显示在 watch 但事件还在 TODO" 的脏状态。
    let watchState: ReturnType<typeof store.upsertAsinWatchState> | null = null;
    let updated: ReturnType<typeof store.updateInsightEventStatus> | null = null;
    store.runInTransaction(() => {
      watchState = store.upsertAsinWatchState({
        asin: event.asin!,
        watchLevel: body.watchLevel ?? "POTENTIAL",
        watchReason: body.watchReason ?? event.eventTitle,
        firstWatchDate: event.eventDate,
        lastEventDate: event.eventDate,
        note: body.note ?? null
      });
      updated = store.updateInsightEventStatus(id, "WATCHING");
    });
    response.json({ event: updated, watchState });
  });

  app.post("/api/insight-events/:id/review", (request, response) => {
    const id = validateEventId(request.params.id);
    const body = validateBody(reviewSchema, request.body);
    const current = store.getInsightEvent(id);
    if (!current) {
      response.status(404).json({ message: "insight event not found" });
      return;
    }
    const reviewDate = body.date ?? getDate(request);
    const nextReviewDueDate = scheduleNextReviewDate({
      eventDate: current.eventDate,
      eventType: current.eventType,
      scoreLevel: current.scoreLevel,
      attributionTags: current.attributionTags
    }, reviewDate);
    response.json(store.markInsightEventReviewed(id, body.result, body.note ?? null, nextReviewDueDate));
  });

  app.get("/api/asin-watch-states", (_request, response) => {
    response.json(store.listAsinWatchStates());
  });

  app.patch("/api/asin-watch-states/:asin", (request, response) => {
    const asin = validateAsin(request.params.asin);
    const body = validateBody(watchStatePatchSchema, request.body);
    response.json(
      store.upsertAsinWatchState({
        asin,
        watchLevel: body.watchLevel,
        watchReason: body.watchReason ?? null,
        firstWatchDate: body.firstWatchDate ?? getDate(request),
        lastEventDate: body.lastEventDate ?? null,
        note: body.note ?? null
      })
    );
  });
}

function validateEventId(id: string): string {
  const decoded = decodeURIComponent(id);
  if (!decoded || decoded.length > 500) {
    throw Object.assign(new Error("Invalid insight event id"), { statusCode: 400 });
  }
  return decoded;
}

function buildInsightEventTrend(
  store: Store,
  endDate: string,
  days: number,
  filters: Omit<InsightEventListParams, "date" | "limit" | "offset">
): InsightEventTrendPoint[] {
  return dateWindow(endDate, days).map((date) => {
    const events = applyDerivedInsightEventFilters(
      store.listInsightEvents({ ...filters, date, limit: 1000 }),
      filters,
      date
    );
    const reviewDueEvents = applyDerivedInsightEventFilters(
      store.listReviewDueEvents(date, { ...filters, limit: 1000 }),
      filters,
      date
    );
    return summarizeTrendPoint(date, events, reviewDueEvents.length);
  });
}

function listInsightEventsForQuery(store: Store, query: InsightEventListParams, currentDate: string): InsightEvent[] {
  const effectiveQuery = query.reviewedOnDate && !query.date ? { ...query, date: currentDate } : query;
  if (!hasDerivedInsightFilters(effectiveQuery)) {
    return store.listInsightEvents(effectiveQuery);
  }

  const { limit, offset, ...filters } = effectiveQuery;
  const events = store.listInsightEvents({ ...filters, limit: 1000 });
  return paginateEvents(
    applyDerivedInsightEventFilters(events, filters, currentDate),
    limit ?? 50,
    offset
  );
}

function listReviewDueEventsForQuery(
  store: Store,
  date: string,
  query: Omit<InsightEventListParams, "date">
): InsightEvent[] {
  if (!hasDerivedInsightFilters(query)) {
    return store.listReviewDueEvents(date, query);
  }

  const { limit, offset, ...filters } = query;
  const events = store.listReviewDueEvents(date, { ...filters, limit: 1000 });
  return paginateEvents(
    applyDerivedInsightEventFilters(events, filters, date),
    limit,
    offset
  );
}

function applyDerivedInsightEventFilters(
  events: InsightEvent[],
  filters: Pick<InsightEventListParams, "evidenceMovement" | "reviewCadence" | "actionStage" | "scoreDriver">,
  currentDate: string
): InsightEvent[] {
  return events
    .filter((event) => !filters.evidenceMovement || isActionEvidenceMovementMatch(event, filters.evidenceMovement))
    .filter((event) => !filters.reviewCadence || isReviewCadenceBucketMatch(event, filters.reviewCadence, currentDate))
    .filter((event) => !filters.actionStage || isActionStageMatch(event, filters.actionStage, currentDate))
    .filter((event) => !filters.scoreDriver || isActionScoreDriverMatch(event, filters.scoreDriver));
}

function hasDerivedInsightFilters(
  filters: Pick<InsightEventListParams, "evidenceMovement" | "reviewCadence" | "actionStage" | "scoreDriver">
): boolean {
  return Boolean(filters.evidenceMovement || filters.reviewCadence || filters.actionStage || filters.scoreDriver);
}

function paginateEvents(events: InsightEvent[], limit: number | undefined, offset: number | undefined): InsightEvent[] {
  const start = offset ?? 0;
  if (limit === undefined) {
    return start > 0 ? events.slice(start) : events;
  }
  return events.slice(start, start + limit);
}

function summarizeTrendPoint(date: string, events: InsightEvent[], reviewDueCount: number): InsightEventTrendPoint {
  const openCount = events.filter((event) => isOpenEvent(event)).length;
  const reviewedEvents = events.filter((event) => event.reviewResult !== null);

  return {
    date,
    totalCount: events.length,
    openCount,
    closedCount: events.length - openCount,
    reviewDueCount,
    p0Count: events.filter((event) => event.eventLevel === "P0").length,
    reviewedCount: reviewedEvents.length,
    validatedCount: reviewedEvents.filter((event) => event.reviewResult === "CONFIRMED" || event.reviewResult === "CONTINUING").length
  };
}

function isOpenEvent(event: InsightEvent): boolean {
  return event.status === "TODO" || event.status === "WATCHING" || event.status === "REVIEW_PENDING";
}

function dateWindow(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_value, index) => isoDateOffset(endDate, index - days + 1));
}

function isoDateOffset(date: string, offsetDays: number): string {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return date;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

function validateAsin(asin: string): string {
  const decoded = decodeURIComponent(asin);
  if (!/^[A-Z0-9]{10,20}$/i.test(decoded)) {
    throw Object.assign(new Error("Invalid ASIN"), { statusCode: 400 });
  }
  return decoded;
}
