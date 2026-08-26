import { TASK_PRIORITIES, TASK_TYPES } from "@amazon-monitor/shared";
import { z } from "zod";
import { evaluateActionGatewayPolicy, type LowRiskActionType } from "./action-gateway-policy.js";
import type { ActionExecution } from "./action-execution-types.js";
import type { ActionProposal, JsonObject, JsonValue } from "./types.js";
import type { Store } from "../store.js";
import { sendNotificationSchedule, type NotificationSender } from "../notifier.js";
import { generateDailyWorkflowReport } from "../reports/daily-workflow-report.js";

const createTaskInput = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional(),
  taskType: z.enum(TASK_TYPES).default("other"),
  priority: z.enum(TASK_PRIORITIES).default("P1"),
  relatedAsin: z.string().max(20).nullable().optional(),
  relatedCategoryId: z.number().int().positive().nullable().optional(),
}).strict();
const recollectInput = z.object({
  taskType: z.enum(["keyword", "category"]),
  targetId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
const createReportInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
const sendNotificationInput = z.object({
  scheduleId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export interface ActionGatewayContext {
  proposal: ActionProposal;
  organizationId: number;
  userId: number;
  store: Store;
}

export interface ActionGatewayExecutionResult {
  result: JsonValue;
}

export interface ActionGatewayVerificationResult {
  status: "EFFECTIVE" | "INEFFECTIVE" | "PENDING";
  result: JsonValue;
}

export type ActionGatewayExecutor = (
  context: ActionGatewayContext,
) => Promise<ActionGatewayExecutionResult>;
export type ActionGatewayVerifier = (
  context: ActionGatewayContext & { execution: ActionExecution },
) => Promise<ActionGatewayVerificationResult>;

export interface ActionGatewayOptions {
  executors?: Partial<Record<LowRiskActionType, ActionGatewayExecutor>>;
  verifiers?: Partial<Record<LowRiskActionType, ActionGatewayVerifier>>;
  notificationSender?: NotificationSender;
}

export interface ActionGatewayResult {
  proposal: ActionProposal;
  execution: ActionExecution;
}

export interface ActionGatewayVerification {
  proposal: ActionProposal;
  execution: ActionExecution;
  status: "EFFECTIVE" | "INEFFECTIVE" | "PENDING";
}

export class AgentOsActionGateway {
  private readonly executors: Partial<Record<LowRiskActionType, ActionGatewayExecutor>>;
  private readonly verifiers: Partial<Record<LowRiskActionType, ActionGatewayVerifier>>;
  private readonly notificationSender?: NotificationSender;

  public constructor(
    private readonly store: Store,
    options: ActionGatewayOptions = {},
  ) {
    this.executors = { ...options.executors };
    this.verifiers = { ...options.verifiers };
    this.notificationSender = options.notificationSender;
  }

  public async execute(id: number, organizationId: number, userId: number): Promise<ActionGatewayResult> {
    const proposal = requireProposal(this.store, id, organizationId);
    const existing = this.store.agentOsActionExecutions.getActionExecutionByKey(organizationId, proposal.idempotencyKey);
    if (existing) return { proposal, execution: existing };
    const policy = evaluateActionGatewayPolicy({
      type: proposal.type,
      riskLevel: proposal.riskLevel,
      confidence: proposal.confidence,
      requiresApproval: proposal.requiresApproval,
      status: proposal.status,
      hasExistingExecution: false,
    });
    if (!policy.allowed || !policy.executor) throw gatewayError(policy.reason === "approval_required" ? 409 : 422, policy.reason);
    const executing = this.store.agentOs.updateActionProposal(id, organizationId, {
      status: "EXECUTING",
      expectedVersion: proposal.version,
    });
    if (!executing) throw gatewayError(409, "Action proposal version or state conflict");
    const execution = this.store.agentOsActionExecutions.createActionExecution({
      organizationId,
      actionProposalId: id,
      idempotencyKey: proposal.idempotencyKey,
      executor: policy.executor,
    });
    const context: ActionGatewayContext = { proposal: executing, organizationId, userId, store: this.store };
    try {
      const result = await this.executor(policy.executor)(context);
      const completedProposal = this.store.agentOs.updateActionProposal(id, organizationId, {
        status: "SUCCEEDED",
        expectedVersion: executing.version,
      });
      const completedExecution = this.store.agentOsActionExecutions.updateActionExecution(execution.id, organizationId, {
        status: "SUCCEEDED",
        result: result.result,
        completedAt: new Date().toISOString(),
        expectedVersion: execution.version,
      });
      if (!completedProposal || !completedExecution) throw gatewayError(409, "Action execution finalization conflict");
      return { proposal: completedProposal, execution: completedExecution };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const current = this.store.agentOs.getActionProposal(id, organizationId);
      if (current && current.status === "EXECUTING") {
        this.store.agentOs.updateActionProposal(id, organizationId, { status: "FAILED", expectedVersion: current.version });
      }
      const currentExecution = this.store.agentOsActionExecutions.getActionExecution(execution.id, organizationId);
      if (currentExecution && currentExecution.status === "RUNNING") {
        this.store.agentOsActionExecutions.updateActionExecution(execution.id, organizationId, {
          status: "FAILED", errorMessage: message, completedAt: new Date().toISOString(), expectedVersion: currentExecution.version,
        });
      }
      throw error;
    }
  }

  public async verify(id: number, organizationId: number, userId: number): Promise<ActionGatewayVerification> {
    const proposal = requireProposal(this.store, id, organizationId);
    const execution = this.store.agentOsActionExecutions.getActionExecutionByKey(organizationId, proposal.idempotencyKey);
    if (!execution) throw gatewayError(404, "Action execution not found");
    if (execution.status === "VERIFIED" && (proposal.status === "EFFECTIVE" || proposal.status === "INEFFECTIVE")) {
      return { proposal, execution, status: proposal.status };
    }
    if (execution.status !== "SUCCEEDED") throw gatewayError(409, "Action execution is not ready for verification");
    if (proposal.status !== "SUCCEEDED" && proposal.status !== "VERIFYING") {
      throw gatewayError(409, "Action proposal is not ready for verification");
    }
    const verifying = proposal.status === "SUCCEEDED"
      ? this.store.agentOs.updateActionProposal(id, organizationId, { status: "VERIFYING", expectedVersion: proposal.version })
      : proposal;
    if (!verifying) throw gatewayError(409, "Action proposal verification conflict");
    const type = proposal.type as LowRiskActionType;
    const verifier = this.verifiers[type] ?? builtInVerifier(type);
    if (!verifier) return { proposal: verifying, execution, status: "PENDING" };
    const result = await verifier({ proposal: verifying, organizationId, userId, store: this.store, execution });
    if (result.status === "PENDING") return { proposal: verifying, execution, status: result.status };
    const nextProposal = this.store.agentOs.updateActionProposal(id, organizationId, {
      status: result.status,
      expectedVersion: verifying.version,
    });
    const nextExecution = this.store.agentOsActionExecutions.updateActionExecution(execution.id, organizationId, {
      status: "VERIFIED",
      result: result.result,
      completedAt: new Date().toISOString(),
      expectedVersion: execution.version,
    });
    if (!nextProposal || !nextExecution) throw gatewayError(409, "Action verification finalization conflict");
    return { proposal: nextProposal, execution: nextExecution, status: result.status };
  }

  private executor(type: LowRiskActionType): ActionGatewayExecutor {
    return this.executors[type] ?? builtInExecutor(type, this.notificationSender);
  }
}

function builtInExecutor(type: LowRiskActionType, notificationSender?: NotificationSender): ActionGatewayExecutor {
  if (type === "CREATE_TASK") return async ({ proposal, organizationId, userId, store }) => {
    const value = parseCreateTaskInput(proposal.proposedValue);
    const task = store.createTask({
      ...value,
      orgId: organizationId,
      sourceType: "ai_run",
      sourceId: String(proposal.id),
      createdBy: userId,
      description: value.description,
      relatedAsin: value.relatedAsin ?? null,
      relatedCategoryId: value.relatedCategoryId ?? null,
    });
    return { result: { taskId: task.id, status: task.status } };
  };
  if (type === "RECOLLECT_DATA") return async ({ proposal, organizationId, store }) => {
    const value = parseRecollectInput(proposal.proposedValue);
    const job = store.pushJob(value.taskType, value.targetId, value.date, organizationId);
    return { result: { jobId: job.id, status: job.status, taskType: value.taskType, targetId: value.targetId } };
  };
  if (type === "CREATE_REPORT") return async ({ proposal, organizationId, userId, store }) => {
    const value = parseCreateReportInput(proposal.proposedValue);
    const report = generateDailyWorkflowReport(store, {
      date: value.date,
      orgId: organizationId,
      generatedBy: userId,
    });
    return {
      result: {
        reportId: report.id,
        reportDate: report.reportDate,
        version: report.version,
        coverageStatus: report.coverageStatus,
      },
    };
  };
  if (type === "SEND_FEISHU" || type === "SEND_EMAIL") return async ({ proposal, organizationId, store }) => {
    const value = parseSendNotificationInput(proposal.proposedValue);
    const schedule = store.getNotificationSchedule(value.scheduleId, organizationId);
    if (!schedule || schedule.channel !== (type === "SEND_FEISHU" ? "feishu" : "email")) {
      throw gatewayError(404, `${type} notification schedule not found`);
    }
    const log = await sendNotificationSchedule(store, schedule, value.date, notificationSender);
    if (log.status !== "success") {
      throw gatewayError(502, log.errorMessage ?? `${type} notification failed`);
    }
    return {
      result: {
        notificationLogId: log.id,
        scheduleId: schedule.id,
        channel: schedule.channel,
        status: log.status,
      },
    };
  };
  return async () => {
    throw gatewayError(422, "No real executor registered for this low-risk action");
  };
}

function builtInVerifier(type: LowRiskActionType): ActionGatewayVerifier | null {
  if (type === "CREATE_REPORT") return async ({ organizationId, execution, store }): Promise<ActionGatewayVerificationResult> => {
    const reportId = readPositiveNumber(execution.result, "reportId");
    const report = reportId === null ? null : store.getDailyReportArchive(organizationId, readString(execution.result, "reportDate"));
    if (!report || report.id !== reportId) {
      return { status: "INEFFECTIVE", result: { reportId, reason: "Daily report archive was not found" } };
    }
    return { status: "EFFECTIVE", result: { reportId: report.id, reportDate: report.reportDate, version: report.version } };
  };
  if (type === "SEND_FEISHU" || type === "SEND_EMAIL") return async ({ organizationId, execution, store }): Promise<ActionGatewayVerificationResult> => {
    const logId = readPositiveNumber(execution.result, "notificationLogId");
    const log = logId === null
      ? null
      : store.listNotificationSendLogs(1000, 0, organizationId).find((item) => item.id === logId);
    if (!log || log.status !== "success") {
      return { status: "INEFFECTIVE", result: { notificationLogId: logId, reason: "Successful notification log was not found" } };
    }
    return { status: "EFFECTIVE", result: { notificationLogId: log.id, channel: log.channel, status: log.status } };
  };
  if (type !== "CREATE_TASK") return null;
  return async ({ proposal, organizationId, execution, store }): Promise<ActionGatewayVerificationResult> => {
    const taskId = readTaskId(execution.result);
    const task = taskId === null ? null : store.getTask(taskId);
    if (!task || task.orgId !== organizationId || task.sourceType !== "ai_run" || task.sourceId !== String(proposal.id)) {
      const result: JsonObject = { taskId, reason: "CREATE_TASK task was not found in the proposal organization" };
      return {
        status: "INEFFECTIVE",
        result,
      };
    }
    const result: JsonObject = { taskId: task.id, status: task.status, sourceType: task.sourceType };
    return {
      status: "EFFECTIVE",
      result,
    };
  };
}

function parseCreateTaskInput(value: JsonValue): z.infer<typeof createTaskInput> {
  const parsed = createTaskInput.safeParse(asObject(value, "CREATE_TASK proposedValue"));
  if (!parsed.success) throw gatewayError(400, "Invalid CREATE_TASK proposedValue");
  return parsed.data;
}

function parseRecollectInput(value: JsonValue): z.infer<typeof recollectInput> {
  const parsed = recollectInput.safeParse(asObject(value, "RECOLLECT_DATA proposedValue"));
  if (!parsed.success) throw gatewayError(400, "Invalid RECOLLECT_DATA proposedValue");
  return parsed.data;
}

function parseCreateReportInput(value: JsonValue): z.infer<typeof createReportInput> {
  const parsed = createReportInput.safeParse(asObject(value, "CREATE_REPORT proposedValue"));
  if (!parsed.success) throw gatewayError(400, "Invalid CREATE_REPORT proposedValue");
  return parsed.data;
}

function parseSendNotificationInput(value: JsonValue): z.infer<typeof sendNotificationInput> {
  const parsed = sendNotificationInput.safeParse(asObject(value, "notification proposedValue"));
  if (!parsed.success) throw gatewayError(400, "Invalid notification proposedValue");
  return parsed.data;
}

function readTaskId(value: JsonValue | null): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const taskId = value.taskId;
  return typeof taskId === "number" && Number.isInteger(taskId) && taskId > 0 ? taskId : null;
}

function readPositiveNumber(value: JsonValue | null, key: string): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value[key];
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

function readString(value: JsonValue | null, key: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : "";
}

function requireProposal(store: Store, id: number, organizationId: number): ActionProposal {
  const proposal = store.agentOs.getActionProposal(id, organizationId);
  if (!proposal) throw gatewayError(404, "Action proposal not found");
  return proposal;
}

function asObject(value: JsonValue, field: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw gatewayError(400, `${field} must be an object`);
  return value as JsonObject;
}

function gatewayError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
