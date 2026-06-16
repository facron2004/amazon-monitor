import type { Express } from "express";
import type { Store } from "../store.js";
import { optionalNumber, optionalString } from "./http-utils.js";

export function registerOperationRoutes(app: Express, store: Store): void {
  app.get("/api/alerts", (request, response) => {
    response.json(
      store.listAlerts({
        date: optionalString(request.query.date),
        status: optionalString(request.query.status),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.patch("/api/alerts/:id/status", (request, response) => {
    const result = store.updateAlertStatus(Number(request.params.id), request.body?.status ?? "viewed");
    if (!result) {
      response.status(404).json({ message: "alert not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/changes", (request, response) => {
    response.json(
      store.listDailyChanges({
        date: optionalString(request.query.date),
        keyword: optionalString(request.query.keyword)
      })
    );
  });

  app.get("/api/task-logs", (request, response) => {
    response.json(store.listTaskLogs(optionalNumber(request.query.limit) ?? 50, optionalNumber(request.query.offset) ?? 0));
  });

  app.get("/api/collect/jobs", (request, response) => {
    const limit = optionalNumber(request.query.limit) ?? 50;
    response.json(store.listJobs(limit, optionalNumber(request.query.offset) ?? 0));
  });

  app.get("/api/collect/jobs/:id", (request, response) => {
    const job = store.getJobStatus(Number(request.params.id));
    if (!job) {
      response.status(404).json({ message: "Job not found" });
      return;
    }
    response.json(job);
  });
}
