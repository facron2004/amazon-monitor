import type { Express, Request, Response } from "express";
import { classifyAgentTask } from "@amazon-monitor/agent";
import {
  agentRunStatuses,
  agentTaskTypes,
  type SessionContext,
} from "@amazon-monitor/shared";
import { z } from "zod";
import type { AgentRuntimeService } from "../services/agent-runtime-service.js";
import type { AgentActionService } from "../services/agent-action-service.js";
import type { Store } from "../store.js";
import { asyncHandler, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const sessionSchema = z.object({
  title: z.string().trim().min(1).max(200).default("New Agent session"),
}).strict();
const runSchema = z.object({
  input: z.string().trim().min(1).max(10_000),
  taskType: z.enum(agentTaskTypes).optional(),
  freshness: z.object({
    datasets: z.array(z.enum([
      "category", "keyword", "price", "promotion", "review", "listing",
    ])).min(1).max(6),
    categoryId: z.number().int().positive().optional(),
    keywordId: z.number().int().positive().optional(),
    asin: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/).optional(),
    marketplace: z.string().trim().min(3).max(100).optional(),
    maxAgeHours: z.number().int().min(1).max(168).default(24),
  }).strict(),
}).strict();
const listSchema = z.object({
  status: z.enum(agentRunStatuses).optional(),
  sessionId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});
const actionListSchema = z.object({
  status: z.enum([
    "pending", "approved", "rejected", "executing", "completed", "failed", "expired",
  ]).optional(),
  runId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});
const decisionSchema = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();
const modifySchema = decisionSchema.extend({
  title: z.string().trim().min(1).max(500),
  payload: z.record(z.string(), z.unknown()),
}).strict();
const executeSchema = z.object({
  confirmL3: z.literal(true).optional(),
}).strict();
const auditSchema = z.object({
  runId: z.number().int().positive().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).refine(
  ({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to),
  { message: "from must be before to" },
).refine(
  ({ from, to }) => !from || !to || Date.parse(to) - Date.parse(from) <= 90 * 86_400_000,
  { message: "audit range cannot exceed 90 days" },
);

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

function sendSseEvent(response: Response, event: ReturnType<Store["appendAgentRunEvent"]>) {
  response.write(`id: ${event.sequence}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event.payload)}\n\n`);
}

export function registerAgentRoutes(
  app: Express,
  store: Store,
  runtime: AgentRuntimeService,
  actions: AgentActionService,
): void {
  app.post("/api/agent/sessions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(sessionSchema, request.body ?? {});
    response.status(201).json(store.createAgentSession({
      orgId: context.organization.id,
      userId: context.user.id,
      title: body.title,
    }));
  }));

  app.get("/api/agent/sessions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.pick({ limit: true, offset: true }), {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
    });
    response.json(store.listAgentSessions({
      orgId: context.organization.id,
      userId: context.user.id,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    }));
  }));

  app.get("/api/agent/sessions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const session = store.getAgentSession(
      validateIdParam(request.params.id),
      context.organization.id,
    );
    if (!session) {
      response.status(404).json({ message: "Agent session not found" });
      return;
    }
    response.json({
      ...session,
      messages: store.listAgentMessages(session.id).filter(
        (message) => message.content !== "[sdk session item]",
      ),
      runs: store.listAgentRuns({
        orgId: context.organization.id,
        sessionId: session.id,
        limit: 100,
      }),
    });
  }));

  app.post("/api/agent/sessions/:id/runs", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const sessionId = validateIdParam(request.params.id);
    const session = store.getAgentSession(sessionId, context.organization.id);
    if (!session || session.userId !== context.user.id) {
      response.status(404).json({ message: "Agent session not found" });
      return;
    }
    if (!runtime.effectiveConfig.enabled) {
      response.status(503).json({ message: "Agent SDK is disabled" });
      return;
    }
    const body = validateBody(runSchema, request.body ?? {});
    const run = store.createAgentRun({
      sessionId,
      orgId: context.organization.id,
      userId: context.user.id,
      taskType: body.taskType ?? classifyAgentTask(body.input),
      input: body.input,
      model: runtime.effectiveConfig.primaryModel,
      fallbackModel: runtime.effectiveConfig.fallbackModel,
    });
    store.appendAgentMessage({
      sessionId,
      runId: run.id,
      role: "user",
      content: body.input,
    });
    store.appendAgentRunEvent({ runId: run.id, type: "run.created" });
    runtime.start(run, body.freshness);
    response.status(202).json(store.getAgentRun(run.id, context.organization.id));
  }));

  app.get("/api/agent/runs/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const run = store.getAgentRun(
      validateIdParam(request.params.id),
      context.organization.id,
    );
    if (!run) {
      response.status(404).json({ message: "Agent run not found" });
      return;
    }
    response.json({
      ...run,
      events: store.listAgentRunEvents(run.id),
      steps: store.listAgentSteps(run.id),
      toolCalls: store.listAgentToolCalls(run.id),
      proposals: store.listActionProposals({
        orgId: context.organization.id,
        runId: run.id,
      }),
    });
  }));

  app.get("/api/agent/runs/:id/events", (request, response) => {
    const context = sessionContext(request);
    const runId = validateIdParam(request.params.id);
    const run = store.getAgentRun(runId, context.organization.id);
    if (!run) {
      response.status(404).json({ message: "Agent run not found" });
      return;
    }
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    let sequence = Math.max(
      0,
      Number(request.get("Last-Event-ID") ?? request.query.after ?? 0) || 0,
    );
    const flush = () => {
      const events = store.listAgentRunEvents(runId, sequence);
      for (const event of events) {
        sendSseEvent(response, event);
        sequence = event.sequence;
      }
      const current = store.getAgentRun(runId, context.organization.id);
      if (current && ["completed", "failed", "cancelled", "waiting_approval"].includes(current.status)) {
        clearInterval(timer);
        response.end();
      }
    };
    const timer = setInterval(flush, 500);
    request.on("close", () => clearInterval(timer));
    flush();
  });

  app.post("/api/agent/runs/:id/cancel", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const run = runtime.cancel(
      validateIdParam(request.params.id),
      context.organization.id,
    );
    if (!run) {
      response.status(404).json({ message: "Agent run not found" });
      return;
    }
    response.json(run);
  }));

  app.get("/api/agent/runs", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema, {
      status: optionalString(request.query.status),
      sessionId: optionalNumber(request.query.sessionId),
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
    });
    response.json(store.listAgentRuns({
      orgId: context.organization.id,
      ...query,
    }));
  }));

  app.get("/api/agent/audit", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(auditSchema, {
      runId: optionalNumber(request.query.runId),
      from: optionalString(request.query.from),
      to: optionalString(request.query.to),
    });
    const runs = query.runId
      ? [store.getAgentRun(query.runId, context.organization.id)].filter(
          (run) => run !== null,
        )
      : store.listAgentRuns({ orgId: context.organization.id, limit: 1000 });
    const filteredRuns = runs.filter((run) =>
      (!query.from || run.createdAt >= query.from)
      && (!query.to || run.createdAt <= query.to));
    response.json({
      exportedAt: new Date().toISOString(),
      organizationId: context.organization.id,
      runs: filteredRuns.map((run) => {
        const proposals = store.listActionProposals({
          orgId: context.organization.id,
          runId: run.id,
          limit: 1000,
        });
        return {
          ...run,
          events: store.listAgentRunEvents(run.id),
          steps: store.listAgentSteps(run.id),
          toolCalls: store.listAgentToolCalls(run.id),
          proposals: proposals.map((proposal) => ({
            ...proposal,
            approvals: store.listActionApprovals(proposal.id),
            executions: store.listActionExecutions(proposal.id),
          })),
        };
      }),
    });
  }));

  app.get("/api/agent/actions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(actionListSchema, {
      status: optionalString(request.query.status),
      runId: optionalNumber(request.query.runId),
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
    });
    response.json(store.listActionProposals({
      orgId: context.organization.id,
      ...query,
    }));
  }));

  app.post("/api/agent/actions/:id/approve", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(decisionSchema, request.body ?? {});
    response.json(await actions.approve(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
      body.expectedVersion,
    ));
  }));

  app.post("/api/agent/actions/:id/reject", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(decisionSchema, request.body ?? {});
    response.json(actions.reject(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
      body.expectedVersion,
    ));
  }));

  app.post("/api/agent/actions/:id/modify", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(modifySchema, request.body ?? {});
    response.status(201).json(actions.modify(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
      body.expectedVersion,
      { title: body.title, payload: body.payload },
    ));
  }));

  app.post("/api/agent/actions/:id/execute", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(executeSchema, request.body ?? {});
    response.json(await actions.execute(
      validateIdParam(request.params.id),
      context.organization.id,
      context.user.id,
      body.confirmL3 === true,
    ));
  }));
}
