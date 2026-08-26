import type { Express, Request } from "express";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import { AgentOsActionGateway } from "../agent-os/action-gateway.js";
import type { NotificationSender } from "../notifier.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateIdParam } from "./validation.js";

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerAgentOsActionRoutes(
  app: Express,
  store: Store,
  options: { notificationSender?: NotificationSender } = {},
): void {
  const gateway = new AgentOsActionGateway(store, { notificationSender: options.notificationSender });

  app.post("/api/agent-os/actions/:id/execute", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const result = await gateway.execute(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
    );
    response.json(result);
  }));

  app.post("/api/agent-os/actions/:id/verify", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const result = await gateway.verify(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
    );
    response.json(result);
  }));

  app.get("/api/agent-os/actions/:id/execution", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const execution = store.agentOsActionExecutions.listActionExecutions({
      organizationId: context.organization.id,
      actionProposalId: validateIdParam(request.params.id),
      limit: 1,
    })[0];
    if (!execution) { response.status(404).json({ message: "Action execution not found" }); return; }
    response.json(execution);
  }));
}

function requireWorkflowWrite(context: SessionContext): void {
  if (!hasBusinessCapability(context.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot execute Agent OS workflows"), { statusCode: 403 });
  }
}
