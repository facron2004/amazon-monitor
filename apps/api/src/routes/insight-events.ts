import type { Express } from "express";
import { asinWatchLevels, insightEventLevels, insightEventStatuses, insightEventTypes, insightReviewResults } from "@amazon-monitor/shared";
import { generateInsightEvents } from "../insights/insight-event-generator.js";
import { evaluateDueInsightEventReviews } from "../insights/review-evaluator.js";
import { scheduleNextReviewDate } from "../insights/review-scheduler.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateQuery } from "./validation.js";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const insightEventListQuerySchema = z.object({
  date: dateSchema.optional(),
  status: z.enum(insightEventStatuses).optional(),
  level: z.enum(insightEventLevels).optional(),
  eventType: z.enum(insightEventTypes).optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  keywordId: z.coerce.number().int().min(1).optional(),
  brand: z.string().min(1).max(200).optional(),
  asin: z.string().min(1).max(30).optional(),
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

const reviewSchema = z.object({
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

export function registerInsightEventRoutes(app: Express, store: Store): void {
  app.get("/api/insight-events", (request, response) => {
    const query = validateQuery(insightEventListQuerySchema, request.query);
    response.json(store.listInsightEvents(query));
  });

  app.get("/api/insight-events/review-due", (request, response) => {
    response.json(store.listReviewDueEvents(getDate(request)));
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
    const reviewDate = getDate(request);
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

function validateAsin(asin: string): string {
  const decoded = decodeURIComponent(asin);
  if (!/^[A-Z0-9]{10,20}$/i.test(decoded)) {
    throw Object.assign(new Error("Invalid ASIN"), { statusCode: 400 });
  }
  return decoded;
}
