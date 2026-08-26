import type { GoalConstraint, JsonValue } from "@amazon-monitor/shared";
import {
  applyEvidenceGate,
  assessDataQuality,
  type DataQualityReport,
  type DataQualitySourceCheck,
  type EvidenceGateDecision,
} from "./data-quality-engine.js";
import type {
  WorkflowDefinition,
  WorkflowEvidenceRef,
  WorkflowNode,
  WorkflowNodeContext,
  WorkflowNodeHandler,
} from "./workflow-runtime.js";

export const supervisorSkillNames = [
  "daily_operator",
  "product_research",
  "competitor_analyst",
  "listing_optimizer",
  "ads_analyst",
  "review_voc",
  "report_writer",
] as const;
export type SupervisorSkillName = (typeof supervisorSkillNames)[number];

export type SupervisorDataSource = "category" | "keyword" | "price" | "promotion" | "review" | "listing" | "ads" | "inventory";

export interface SupervisorGoal {
  id: string;
  metric: string;
  targetValue: JsonValue;
  currentValue: JsonValue | null;
  constraints: readonly GoalConstraint[];
}

export interface SupervisorInput {
  request: string;
  checkedAt: string;
  dataChecks: readonly DataQualitySourceCheck[];
  goal?: SupervisorGoal | null;
}

export interface SupervisorEvidence extends WorkflowEvidenceRef {
  source: string;
}

export interface SupervisorSkillContext {
  input: SupervisorInput;
  goal: SupervisorGoal | null;
  quality: DataQualityReport;
  priorResults: Readonly<Record<string, unknown>>;
}

export interface SupervisorSkillResult {
  output: unknown;
  evidence?: readonly SupervisorEvidence[];
  actionTypes?: readonly string[];
  confidence: number;
}

export interface SupervisorSkill {
  name: SupervisorSkillName;
  description: string;
  requiredSources: readonly SupervisorDataSource[];
  matches(request: string): boolean;
  execute(context: SupervisorSkillContext): SupervisorSkillResult | Promise<SupervisorSkillResult>;
}

export interface SupervisorTask {
  id: string;
  skill: SupervisorSkillName;
  reason: string;
  requiredSources: readonly SupervisorDataSource[];
}

export interface SupervisorPlan {
  id: string;
  goalId: string | null;
  quality: DataQualityReport;
  evidenceGate: EvidenceGateDecision;
  tasks: SupervisorTask[];
  actionTypes: string[];
}

export interface SupervisorRunResult {
  plan: SupervisorPlan;
  status: "completed" | "refresh_required" | "blocked";
  outputs: Record<string, unknown>;
  evidence: SupervisorEvidence[];
  actionTypes: string[];
  confidence: number;
  conflicts: string[];
}

export class SupervisorSkillRegistry {
  private readonly skills = new Map<SupervisorSkillName, SupervisorSkill>();

  public constructor(skills: readonly SupervisorSkill[] = defaultSkills()) {
    for (const skill of skills) this.register(skill);
  }

  public register(skill: SupervisorSkill): void {
    if (this.skills.has(skill.name)) throw new Error(`Supervisor skill already registered: ${skill.name}`);
    this.skills.set(skill.name, skill);
  }

  public get(name: SupervisorSkillName): SupervisorSkill {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Supervisor skill is not registered: ${name}`);
    return skill;
  }

  public list(): SupervisorSkill[] {
    return [...this.skills.values()];
  }
}

export function createSupervisorSkillRegistry(skills?: readonly SupervisorSkill[]): SupervisorSkillRegistry {
  return new SupervisorSkillRegistry(skills);
}

export function buildSupervisorPlan(
  input: SupervisorInput,
  registry: SupervisorSkillRegistry = createSupervisorSkillRegistry(),
): SupervisorPlan {
  const quality = assessDataQuality(input.dataChecks, input.checkedAt);
  const evidenceGate = applyEvidenceGate(quality);
  const selected = registry.list().filter((skill) => skill.matches(input.request));
  const skills = selected.length > 0 ? selected : [registry.get("daily_operator")];
  const tasks = evidenceGate.allowed
    ? skills.map((skill, index) => ({
        id: `${skill.name}:${index + 1}`,
        skill: skill.name,
        reason: `Supervisor selected ${skill.name} for the request`,
        requiredSources: skill.requiredSources,
      }))
    : [];
  return {
    id: `supervisor:${input.goal?.id ?? "request"}:${input.checkedAt}`,
    goalId: input.goal?.id ?? null,
    quality,
    evidenceGate,
    tasks,
    actionTypes: evidenceGate.allowed ? ["CREATE_TASK"] : ["RECOLLECT_DATA"],
  };
}

export async function executeSupervisorPlan(
  input: SupervisorInput,
  registry: SupervisorSkillRegistry = createSupervisorSkillRegistry(),
): Promise<SupervisorRunResult> {
  const plan = buildSupervisorPlan(input, registry);
  if (plan.evidenceGate.action === "REFRESH") {
    return emptyRunResult(plan, "refresh_required");
  }
  if (plan.evidenceGate.action === "STOP") {
    return emptyRunResult(plan, "blocked");
  }

  const outputs: Record<string, unknown> = {};
  const evidence: SupervisorEvidence[] = [];
  const actionTypes = new Set(plan.actionTypes);
  const conflicts: string[] = [];
  let confidence = plan.quality.score;
  for (const task of plan.tasks) {
    const skill = registry.get(task.skill);
    const result = await skill.execute({
      input,
      goal: input.goal ?? null,
      quality: plan.quality,
      priorResults: outputs,
    });
    outputs[task.id] = result.output;
    confidence = Math.min(confidence, result.confidence);
    for (const item of result.evidence ?? []) mergeEvidence(evidence, item);
    for (const actionType of result.actionTypes ?? []) actionTypes.add(actionType);
    if (isRecord(result.output) && typeof result.output.conflict === "string") {
      conflicts.push(result.output.conflict);
    }
  }
  return {
    plan,
    status: "completed",
    outputs,
    evidence,
    actionTypes: [...actionTypes],
    confidence: round(confidence),
    conflicts: [...new Set(conflicts)],
  };
}

export function buildSupervisorWorkflow(
  input: SupervisorInput,
  registry: SupervisorSkillRegistry = createSupervisorSkillRegistry(),
): WorkflowDefinition {
  const plan = buildSupervisorPlan(input, registry);
  const nodes: WorkflowNode[] = [
    { id: "trigger", type: "TRIGGER", next: "evidence-gate" },
    {
      id: "evidence-gate",
      type: "DATA_VALIDATE",
      handler: () => ({
        valid: plan.evidenceGate.allowed,
        data: { dataQuality: plan.quality, evidenceGate: plan.evidenceGate },
        message: plan.evidenceGate.reason,
      }),
      next: plan.tasks[0]?.id ?? null,
    },
  ];
  for (const [index, task] of plan.tasks.entries()) {
    const skill = registry.get(task.skill);
    nodes.push({
      id: task.id,
      type: "AGENT_CALL",
      handler: skillHandler(skill, input, plan, task.id),
      next: plan.tasks[index + 1]?.id ?? "decision",
    });
  }
  nodes.push({
    id: "decision",
    type: "DECISION",
    handler: () => ({
      output: { actionTypes: plan.actionTypes, taskCount: plan.tasks.length },
      decision: "complete",
    }),
  });
  return { id: plan.id, nodes };
}

function skillHandler(
  skill: SupervisorSkill,
  input: SupervisorInput,
  plan: SupervisorPlan,
  taskId: string,
): WorkflowNodeHandler {
  return async (context: WorkflowNodeContext) => {
    const result = await skill.execute({
      input,
      goal: input.goal ?? null,
      quality: plan.quality,
      priorResults: context.outputs,
    });
    return {
      output: result.output,
      evidence: result.evidence,
      data: { [`supervisor:${taskId}`]: result.output },
    };
  };
}

function emptyRunResult(plan: SupervisorPlan, status: "refresh_required" | "blocked"): SupervisorRunResult {
  return {
    plan,
    status,
    outputs: {},
    evidence: [],
    actionTypes: plan.actionTypes,
    confidence: plan.quality.score,
    conflicts: [],
  };
}

function mergeEvidence(target: SupervisorEvidence[], item: SupervisorEvidence): void {
  const key = `${item.source}:${item.id}`;
  const index = target.findIndex((current) => `${current.source}:${current.id}` === key);
  if (index < 0) target.push(item);
  else target[index] = { ...target[index], ...item };
}

function defaultSkills(): SupervisorSkill[] {
  return [
    skill("daily_operator", "Prioritize the most important current operating issues.", ["category", "keyword"], /今日|daily|巡检|patrol|运营/u),
    skill("product_research", "Assess new product and market opportunities.", ["category", "price"], /新品|机会|market|research|launch/u),
    skill("competitor_analyst", "Compare competitor evidence and response options.", ["category", "price"], /竞品|竞争|competitor|compare/u),
    skill("listing_optimizer", "Identify evidence-backed Listing improvement opportunities.", ["listing", "keyword", "review"], /listing|标题|图片|bullet|内容/u),
    skill("ads_analyst", "Analyze advertising efficiency and bounded changesets.", ["ads", "keyword"], /广告|ACOS|TACOS|ads|bid|budget/u),
    skill("review_voc", "Turn review themes into product and customer actions.", ["review"], /评论|VOC|review|情绪/u),
    skill("report_writer", "Summarize evidence into an operator-readable report.", ["category", "keyword"], /报告|report|汇总|summary/u),
  ];
}

function skill(
  name: SupervisorSkillName,
  description: string,
  requiredSources: readonly SupervisorDataSource[],
  pattern: RegExp,
): SupervisorSkill {
  return {
    name,
    description,
    requiredSources,
    matches: (request) => pattern.test(request),
    execute: ({ quality }) => ({
      output: { skill: name, evidenceGate: quality.status },
      confidence: quality.score,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
