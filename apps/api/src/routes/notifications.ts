import type { Express } from "express";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { sendNotificationSchedule, type NotificationSender } from "../notifier.js";
import { asyncHandler, optionalNumber, optionalString } from "./http-utils.js";
import { validateIdParam } from "./validation.js";

export function registerNotificationRoutes(
  app: Express,
  store: Store,
  options: { notificationSender?: NotificationSender } = {}
): void {
  app.get("/api/notifications/schedules", (_request, response) => {
    response.json(store.listNotificationSchedules());
  });

  app.post("/api/notifications/schedules", asyncHandler(async (request, response) => {
    const body = request.body ?? {};
    response.status(201).json(
      store.createNotificationSchedule({
        name: String(body.name ?? ""),
        channel: body.channel === "feishu" ? "feishu" : "email",
        target: String(body.target ?? ""),
        sendTime: String(body.sendTime ?? ""),
        timezone: optionalString(body.timezone) ?? "Asia/Shanghai",
        status: body.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.patch("/api/notifications/schedules/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    response.json(
      store.updateNotificationSchedule(id, {
        name: request.body.name,
        channel: request.body.channel,
        target: request.body.target,
        sendTime: request.body.sendTime,
        timezone: request.body.timezone,
        status: request.body.status
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
    response.json(store.listNotificationSendLogs(optionalNumber(request.query.limit) ?? 50, optionalNumber(request.query.offset) ?? 0));
  });
}
