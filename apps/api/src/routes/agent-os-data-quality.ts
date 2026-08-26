import type { Express, Request } from "express";
import { z } from "zod";
import type { SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { collectCurrentDataQualityEvidence } from "../agent-os/data-quality-adapter.js";
import { asyncHandler, optionalNumber, optionalString } from "./http-utils.js";
import { validateQuery } from "./validation.js";

const querySchema = z.object({
  checkedAt: z.string().datetime({ offset: true }).optional(),
  maxAgeHours: z.number().positive().max(720).optional(),
}).strict();

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerAgentOsDataQualityRoutes(app: Express, store: Store): void {
  app.get("/api/agent-os/data-quality", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(querySchema, {
      checkedAt: optionalString(request.query.checkedAt),
      maxAgeHours: optionalNumber(request.query.maxAgeHours),
    });
    response.json(collectCurrentDataQualityEvidence(
      store,
      context.organization.id,
      query.checkedAt ?? new Date().toISOString(),
      query.maxAgeHours ?? 24,
    ));
  }));
}
