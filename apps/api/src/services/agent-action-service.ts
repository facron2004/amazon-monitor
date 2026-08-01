import {
  TASK_PRIORITIES,
  TASK_TYPES,
  asinWatchLevels,
  type ActionProposal,
} from "@amazon-monitor/shared";
import { z } from "zod";
import {
  sendNotificationSchedule,
  type NotificationSender,
} from "../notifier.js";
import type { Store } from "../store.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const actionPayloadSchemas = {
  recollect: z.object({
    taskType: z.enum(["keyword", "category"]),
    targetId: z.number().int().positive(),
    date: isoDate,
  }).strict(),
  monitor_asin: z.object({
    asin: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/),
    watchLevel: z.enum(asinWatchLevels).default("NORMAL"),
    watchReason: z.string().max(1000).nullable().optional(),
    firstWatchDate: isoDate,
    lastEventDate: isoDate.nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  }).strict(),
  create_task: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    taskType: z.enum(TASK_TYPES).default("other"),
    priority: z.enum(TASK_PRIORITIES).default("P1"),
    relatedAsin: z.string().max(20).nullable().optional(),
    relatedCategoryId: z.number().int().positive().nullable().optional(),
  }).strict(),
  send_feishu_report: z.object({
    scheduleId: z.number().int().positive(),
    date: isoDate,
  }).strict(),
  export_report: z.object({
    format: z.enum(["md", "json"]).default("md"),
  }).strict(),
};

export class AgentActionService {
  constructor(
    private readonly store: Store,
    private readonly notificationSender?: NotificationSender,
  ) {}

  async approve(
    id: number,
    orgId: number,
    userId: number,
    expectedVersion: number,
  ) {
    const current = this.store.getActionProposal(id, orgId);
    if (!current) throw notFound();
    if (["approved", "executing", "completed"].includes(current.status)) {
      return {
        proposal: current,
        execution: this.store.getActionExecutionByKey(current.idempotencyKey),
      };
    }
    const proposal = this.pendingProposal(id, orgId, expectedVersion);
    const decision = this.store.decideActionProposal(id, orgId, expectedVersion, {
      userId,
      decision: "approved",
    });
    if (!decision) throw conflict();
    const execution = proposal.riskLevel === "L3"
      ? null
      : await this.execute(id, orgId, userId, false);
    return { proposal: this.store.getActionProposal(id, orgId), execution };
  }

  reject(
    id: number,
    orgId: number,
    userId: number,
    expectedVersion: number,
  ) {
    this.pendingProposal(id, orgId, expectedVersion);
    const decision = this.store.decideActionProposal(id, orgId, expectedVersion, {
      userId,
      decision: "rejected",
    });
    if (!decision) throw conflict();
    return decision.proposal;
  }

  modify(
    id: number,
    orgId: number,
    userId: number,
    expectedVersion: number,
    input: { title: string; payload: Record<string, unknown> },
  ) {
    const current = this.pendingProposal(id, orgId, expectedVersion);
    actionPayloadSchemas[current.actionType].parse(input.payload);
    const result = this.store.modifyActionProposal(id, orgId, expectedVersion, {
      userId,
      title: input.title,
      payload: input.payload,
    });
    if (!result) throw conflict();
    return result;
  }

  async execute(
    id: number,
    orgId: number,
    userId: number,
    confirmL3: boolean,
  ) {
    const proposal = this.store.getActionProposal(id, orgId);
    if (!proposal) throw notFound();
    if (proposal.status === "completed") {
      return this.store.getActionExecutionByKey(proposal.idempotencyKey);
    }
    if (proposal.status !== "approved") throw conflict("Proposal is not approved");
    if (proposal.riskLevel === "L3" && !confirmL3) {
      throw Object.assign(new Error("L3 action requires explicit second confirmation"), {
        statusCode: 409,
      });
    }
    const existing = this.store.getActionExecutionByKey(proposal.idempotencyKey);
    if (existing) return existing;
    const started = this.store.beginActionExecution({
      proposalId: id,
      orgId,
      expectedVersion: proposal.expectedVersion,
      idempotencyKey: proposal.idempotencyKey,
    });
    if (!started) throw conflict("Action execution could not be started");
    try {
      const result = await this.executeDomainAction(proposal, userId);
      const completed = this.store.finishActionExecution({
        executionId: started.execution.id,
        proposalId: id,
        orgId,
        expectedVersion: started.proposal.expectedVersion,
        executionStatus: result.uncertain ? "uncertain" : "completed",
        proposalStatus: result.uncertain ? "failed" : "completed",
        result: result.data,
        errorMessage: result.errorMessage,
      });
      if (!completed) throw conflict("Action execution could not be finalized");
      return completed.execution;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.finishActionExecution({
        executionId: started.execution.id,
        proposalId: id,
        orgId,
        expectedVersion: started.proposal.expectedVersion,
        executionStatus: "failed",
        proposalStatus: "failed",
        errorMessage: message,
      });
      throw error;
    }
  }

  private pendingProposal(id: number, orgId: number, expectedVersion: number) {
    const proposal = this.store.getActionProposal(id, orgId);
    if (!proposal) throw notFound();
    if (proposal.status !== "pending" || proposal.expectedVersion !== expectedVersion) {
      throw conflict();
    }
    return proposal;
  }

  private async executeDomainAction(proposal: ActionProposal, userId: number) {
    const schema = actionPayloadSchemas[proposal.actionType];
    const payload = schema.parse(proposal.payload);
    if (proposal.actionType === "recollect") {
      const value = actionPayloadSchemas.recollect.parse(payload);
      const job = this.store.pushJob(value.taskType, value.targetId, value.date, proposal.orgId);
      const sourceRun = this.store.getAgentRun(proposal.runId, proposal.orgId);
      if (!sourceRun) throw new Error("Source Agent run not found");
      const recoveryRun = this.store.createAgentRun({
        sessionId: sourceRun.sessionId,
        orgId: sourceRun.orgId,
        userId: sourceRun.userId,
        taskType: "recovery",
        input: [
          `Re-evaluate run #${sourceRun.id} after collection job #${job.id}.`,
          "Original Agent request:",
          sourceRun.input,
        ].join("\n"),
        model: sourceRun.model,
        fallbackModel: sourceRun.fallbackModel,
        recoveryOfRunId: sourceRun.id,
      });
      const freshnessInput = value.taskType === "keyword"
        ? {
            datasets: ["keyword", "price", "promotion", "review"],
            keywordId: value.targetId,
            maxAgeHours: 24,
          }
        : {
            datasets: ["category", "price", "promotion", "review"],
            categoryId: value.targetId,
            maxAgeHours: 24,
          };
      this.store.appendAgentRunEvent({
        runId: recoveryRun.id,
        type: "recovery.waiting_for_collection",
        payload: {
          jobId: job.id,
          freshnessInput,
          sourceRunId: sourceRun.id,
        },
      });
      return {
        data: {
          jobId: job.id,
          status: job.status,
          recoveryRunId: recoveryRun.id,
        },
        uncertain: false,
      };
    }
    if (proposal.actionType === "monitor_asin") {
      const value = actionPayloadSchemas.monitor_asin.parse(payload);
      const state = this.store.upsertAsinWatchState({
        ...value,
        orgId: proposal.orgId,
        watchReason: value.watchReason ?? null,
        lastEventDate: value.lastEventDate ?? null,
        note: value.note ?? null,
      });
      return { data: { asin: state.asin, watchLevel: state.watchLevel }, uncertain: false };
    }
    if (proposal.actionType === "create_task") {
      const value = actionPayloadSchemas.create_task.parse(payload);
      const task = this.store.createTask({
        ...value,
        orgId: proposal.orgId,
        sourceType: "agent_run",
        sourceId: String(proposal.runId),
        createdBy: userId,
      });
      return { data: { taskId: task.id, status: task.status }, uncertain: false };
    }
    if (proposal.actionType === "send_feishu_report") {
      const value = actionPayloadSchemas.send_feishu_report.parse(payload);
      const schedule = this.store.getNotificationSchedule(value.scheduleId, proposal.orgId);
      if (!schedule || schedule.channel !== "feishu") {
        throw Object.assign(new Error("Feishu schedule not found"), { statusCode: 404 });
      }
      const log = await sendNotificationSchedule(
        this.store,
        schedule,
        value.date,
        this.notificationSender,
      );
      const uncertain = log.status === "failed"
        && /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(log.errorMessage ?? "");
      if (log.status === "failed" && !uncertain) throw new Error(log.errorMessage ?? "Feishu send failed");
      return {
        data: { notificationLogId: log.id, status: log.status },
        uncertain,
        errorMessage: uncertain
          ? "Feishu result is uncertain; confirm manually before retrying"
          : undefined,
      };
    }
    const value = actionPayloadSchemas.export_report.parse(payload);
    return {
      data: { runId: proposal.runId, format: value.format, ready: true },
      uncertain: false,
    };
  }
}

function conflict(message = "Action proposal version or state conflict") {
  return Object.assign(new Error(message), { statusCode: 409 });
}
function notFound() {
  return Object.assign(new Error("Action proposal not found"), { statusCode: 404 });
}
