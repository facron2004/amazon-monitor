import type { Express, Request } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { optionalNumber, optionalString } from "./http-utils.js";
import { alertStatusSchema, paginationQuerySchema, validateBody, validateIdParam, validateQuery } from "./validation.js";

export function registerOperationRoutes(app: Express, store: Store): void {
  app.get("/api/alerts", (request, response) => {
    response.json(
      store.listAlerts({
        orgId: sessionOrganizationId(request),
        date: optionalString(request.query.date),
        status: optionalString(request.query.status),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.patch("/api/alerts/:id/status", (request, response) => {
    const id = validateIdParam(request.params.id);
    const data = validateBody(alertStatusSchema, request.body);
    const result = store.updateAlertStatus(id, data.status ?? "viewed", sessionOrganizationId(request));
    if (!result) {
      response.status(404).json({ message: "alert not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/changes", (request, response) => {
    response.json(
      store.listDailyChanges({
        orgId: sessionOrganizationId(request),
        date: optionalString(request.query.date),
        keyword: optionalString(request.query.keyword)
      })
    );
  });

  app.get("/api/task-logs", (request, response) => {
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listTaskLogs(query.limit ?? 50, query.offset ?? 0, sessionOrganizationId(request)));
  });

  app.get("/api/collect/jobs", (request, response) => {
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listJobs(query.limit ?? 50, query.offset ?? 0, sessionOrganizationId(request)));
  });

  app.get("/api/collect/jobs/:id", (request, response) => {
    const id = validateIdParam(request.params.id);
    const job = store.getJobStatus(id, sessionOrganizationId(request));
    if (!job) {
      response.status(404).json({ message: "Job not found" });
      return;
    }
    response.json(job);
  });

  // Per-taskType freshness snapshot for the dashboard freshness badge.
  app.get("/api/collect/freshness", (request, response) => {
    response.json(store.getCollectionFreshness(sessionOrganizationId(request)));
  });

  // Aggregate queue health for the topbar "pending/processing" indicator.
  app.get("/api/collect/queue-stats", (request, response) => {
    response.json(store.getQueueStats(sessionOrganizationId(request)));
  });

  // Live health of the background collection Worker — last heart-beat,
  // uptime, and whether it has gone stale. Powers the topbar online dot.
  app.get("/api/collect/worker-status", (_request, response) => {
    response.json(store.getWorkerStatus());
  });
}

function sessionOrganizationId(request: Request): number {
  return (request as Request & { sessionContext?: SessionContext }).sessionContext?.organization.id ?? 1;
}
