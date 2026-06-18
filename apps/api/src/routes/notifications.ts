import type { Express } from "express";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { sendNotificationSchedule, type NotificationSender } from "../notifier.js";
import { asyncHandler, optionalString } from "./http-utils.js";
import { notificationSchedulePatchSchema, notificationScheduleSchema, paginationQuerySchema, validateBody, validateIdParam, validateQuery } from "./validation.js";

export function registerNotificationRoutes(
  app: Express,
  store: Store,
  options: { notificationSender?: NotificationSender } = {}
): void {
  app.get("/api/notifications/schedules", (_request, response) => {
    response.json(store.listNotificationSchedules());
  });

  app.post("/api/notifications/schedules", asyncHandler(async (request, response) => {
    const data = validateBody(notificationScheduleSchema, request.body);
    response.status(201).json(
      store.createNotificationSchedule({
        name: data.name,
        channel: data.channel ?? "email",
        target: data.target,
        sendTime: data.sendTime,
        timezone: data.timezone ?? "Asia/Shanghai",
        status: data.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.patch("/api/notifications/schedules/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    const data = validateBody(notificationSchedulePatchSchema, request.body);
    response.json(
      store.updateNotificationSchedule(id, {
        name: data.name,
        channel: data.channel,
        target: data.target,
        sendTime: data.sendTime,
        timezone: data.timezone,
        status: data.status
      })
    );
  }));

  app.delete("/api/notifications/schedules/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    store.deleteNotificationSchedule(id);
    response.status(204).end();
  }));

  app.post("/api/notifications/schedules/:id/send", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    const schedule = store.getNotificationSchedule(id);
    if (!schedule) {
      response.status(404).json({ message: "notification schedule not found" });
      return;
    }
    const date = optionalString(request.body?.date) ?? isoDate();
    response.json(await sendNotificationSchedule(store, schedule, date, options.notificationSender));
  }));

  app.get("/api/notifications/logs", (request, response) => {
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listNotificationSendLogs(query.limit ?? 50, query.offset ?? 0));
  });
}
