import type {
  WorkflowDefinition,
  WorkflowNodeContext,
  WorkflowNodeHandler,
  WorkflowNode,
  WorkflowNodeResult,
  WorkflowDecision,
} from "./workflow-runtime.js";

export const workflowTemplateIds = [
  "rank-drop-investigation",
  "ranking-jump-analysis",
  "product-opportunity-launch",
  "inventory-risk-adjustment",
  "ads-waste-governance",
  "review-voc-remediation",
  "competitor-price-drop",
] as const;

export type WorkflowTemplateId = (typeof workflowTemplateIds)[number];
type DataQualityStatus = "TRUSTED" | "PARTIAL" | "STALE" | "INVALID";

interface WorkflowTemplateConfig {
  id: WorkflowTemplateId;
  trigger: string;
  agent: string;
  decisionField: string;
  defaultDecision: string;
  decisionRoutes: Readonly<Record<string, string>>;
  analysisStages: readonly string[];
  proposalType: string;
  proposalPlan: readonly string[];
  reviewCadence: readonly string[];
  memoryTopic: string;
}

type ContextHandler = (context: WorkflowNodeContext) => WorkflowNodeResult;
type ContextDecision = (context: WorkflowNodeContext) => string | boolean;

const templateConfigs: readonly WorkflowTemplateConfig[] = [
  {
    id: "rank-drop-investigation",
    trigger: "RANK_DROP_EVENT",
    agent: "rank-investigation",
    decisionField: "rankResponse",
    defaultDecision: "investigate",
    decisionRoutes: { investigate: "human-approval", monitor: "human-approval" },
    analysisStages: [
      "SERP_ANALYSIS",
      "COMPETITOR_ANALYSIS",
      "ADS_ANALYSIS",
      "LISTING_ANALYSIS",
      "REVIEW_ANALYSIS",
      "INVENTORY_ANALYSIS",
      "ROOT_CAUSE_RANKING",
    ],
    proposalType: "RANK_RECOVERY_PLAN",
    proposalPlan: [
      "Increase exact campaign budget proposal",
      "Enable coupon proposal",
      "Check listing conversion",
      "Recollect SERP after 24 hours",
    ],
    reviewCadence: ["T+1D", "T+3D", "T+7D"],
    memoryTopic: "rank-drop-root-cause",
  },
  {
    id: "ranking-jump-analysis",
    trigger: "RANKING_JUMP_SIGNAL",
    agent: "ranking-jump-research",
    decisionField: "rankingResponse",
    defaultDecision: "monitor",
    decisionRoutes: { investigate: "human-approval", monitor: "human-approval" },
    analysisStages: [
      "PRICE_ANALYSIS",
      "PROMOTION_ANALYSIS",
      "LISTING_ANALYSIS",
      "REVIEW_ANALYSIS",
      "ADS_ANALYSIS",
      "HISTORICAL_RANK_ANALYSIS",
    ],
    proposalType: "RANKING_JUMP_RESPONSE_PLAN",
    proposalPlan: [
      "Monitor the ASIN's keyword and BSR movement for the next 3 days",
      "Compare price, promotion, listing, review, and ads evidence before changing strategy",
      "Do not automatically follow the competitor or change pricing",
    ],
    reviewCadence: ["T+1D", "T+3D", "T+7D"],
    memoryTopic: "ranking-jump-response",
  },
  {
    id: "product-opportunity-launch",
    trigger: "PRODUCT_OPPORTUNITY_SIGNAL",
    agent: "product-research",
    decisionField: "opportunityDecision",
    defaultDecision: "go",
    decisionRoutes: {
      go: "human-approval",
      "no-go": "human-approval",
      "need-more-evidence": "human-approval",
    },
    analysisStages: [
      "OPPORTUNITY_RADAR",
      "MARKET_SIZE_SIGNAL",
      "COMPETITIVE_INTENSITY",
      "PRICE_BAND",
      "REVIEW_BARRIER",
      "PRODUCT_GAP",
      "FEATURE_OPPORTUNITY",
      "VOC_PROFIT_COMPLIANCE_SUPPLY_CHAIN_VALIDATION",
    ],
    proposalType: "PRODUCT_PROJECT_PLAN",
    proposalPlan: [
      "Create product project brief",
      "Validate review VOC and profit assumptions",
      "Validate compliance and supply chain constraints",
      "Record Go/No-Go/Need-More-Evidence decision",
    ],
    reviewCadence: ["T+7D", "T+14D", "T+30D"],
    memoryTopic: "product-opportunity-validation",
  },
  {
    id: "inventory-risk-adjustment",
    trigger: "STOCKOUT_RISK",
    agent: "inventory-risk",
    decisionField: "inventoryResponse",
    defaultDecision: "protect-stock",
    decisionRoutes: { "protect-stock": "human-approval", monitor: "human-approval" },
    analysisStages: [
      "INVENTORY",
      "SALES_VELOCITY",
      "ADS",
      "PROMOTION",
      "PRICE",
      "ORGANIC_RANK",
      "INBOUND_SHIPMENT",
    ],
    proposalType: "INVENTORY_RISK_ADJUSTMENT_PLAN",
    proposalPlan: [
      "Pause deal proposal",
      "Reduce ads proposal",
      "Increase price by 5% proposal",
      "Accelerate replenishment task proposal",
      "Monitor stockout, BSR, and profit after approval",
    ],
    reviewCadence: ["T+1D", "T+3D", "T+7D"],
    memoryTopic: "stockout-risk-response",
  },
  {
    id: "ads-waste-governance",
    trigger: "ADS_WASTE_SIGNAL",
    agent: "ads-governance",
    decisionField: "adsResponse",
    defaultDecision: "govern",
    decisionRoutes: { govern: "human-approval", monitor: "human-approval" },
    analysisStages: [
      "SEARCH_TERM_ANALYSIS",
      "KEYWORD_RANK",
      "ORGANIC_CONVERSION",
      "COMPETITOR_PRICE",
      "NEGATIVE_KEYWORD_CANDIDATES",
      "BUDGET_ADJUSTMENT",
      "BID_ADJUSTMENT",
    ],
    proposalType: "ADS_WASTE_GOVERNANCE_PLAN",
    proposalPlan: [
      "Review negative keyword candidates",
      "Propose budget adjustment",
      "Propose bid adjustment",
      "Review ACOS and orders after 7 days",
    ],
    reviewCadence: ["T+1D", "T+7D", "T+14D"],
    memoryTopic: "ads-waste-governance",
  },
  {
    id: "review-voc-remediation",
    trigger: "NEGATIVE_REVIEW_TOPIC_SPIKE",
    agent: "review-voc",
    decisionField: "remediationResponse",
    defaultDecision: "remediate",
    decisionRoutes: { remediate: "human-approval", monitor: "human-approval" },
    analysisStages: [
      "TOPIC_CLUSTERING",
      "EVIDENCE_EXTRACTION",
      "PRODUCT_IMPACT",
      "LISTING_IMPACT",
      "CUSTOMER_SERVICE_IMPACT",
      "SUPPLIER_TASK",
      "PRODUCT_IMPROVEMENT_TASK",
    ],
    proposalType: "REVIEW_VOC_REMEDIATION_PLAN",
    proposalPlan: [
      "Create supplier task proposal",
      "Create product improvement task proposal",
      "Review listing and customer-service impact",
      "Measure topic share and rating after remediation",
    ],
    reviewCadence: ["T+7D", "T+14D", "T+30D"],
    memoryTopic: "review-voc-remediation",
  },
  {
    id: "competitor-price-drop",
    trigger: "COMPETITOR_PRICE_DROP",
    agent: "competitor-pricing",
    decisionField: "priceResponse",
    defaultDecision: "defend-margin",
    decisionRoutes: { "defend-margin": "human-approval", wait: "human-approval" },
    analysisStages: [
      "CHECK_COUPON",
      "CHECK_DEAL",
      "CHECK_INVENTORY",
      "CHECK_RANKING",
      "CHECK_REVIEW",
      "CHECK_PROMOTION_PATTERN",
      "PRICING_AGENT",
      "PROFIT_AGENT",
      "RESPONSE_STRATEGY",
    ],
    proposalType: "COMPETITOR_PRICE_RESPONSE_PLAN",
    proposalPlan: [
      "Compare Ignore, Follow Price, Coupon, Ads Defense, Bundle, and Wait options",
      "Protect profit floor and document the selected response",
      "Monitor competitor price and rank after approval",
    ],
    reviewCadence: ["T+1D", "T+3D", "T+7D"],
    memoryTopic: "competitor-price-response",
  },
];

const workflowTemplates: readonly WorkflowDefinition[] = templateConfigs.map(createWorkflowTemplate);

export function listWorkflowTemplates(): readonly WorkflowDefinition[] {
  return workflowTemplates;
}

export function getWorkflowTemplate(id: string): WorkflowDefinition | undefined {
  return workflowTemplates.find((template) => template.id === id);
}

function createWorkflowTemplate(config: WorkflowTemplateConfig): WorkflowDefinition {
  const nodes: readonly WorkflowNode[] = [
    {
      id: "trigger",
      type: "TRIGGER",
      next: "data-validate",
      config: { trigger: config.trigger },
    },
    {
      id: "data-validate",
      type: "DATA_VALIDATE",
      handler: dataQualityGate,
      next: "agent-analysis",
      config: { gate: "evidence", allowedStatuses: ["TRUSTED", "PARTIAL"] },
    },
    {
      id: "agent-analysis",
      type: "AGENT_CALL",
      handler: createAgentHandler(config),
      next: "decision",
      config: { agent: config.agent, stages: config.analysisStages },
    },
    {
      id: "decision",
      type: "DECISION",
      decide: createDecisionHandler(config),
      branches: config.decisionRoutes,
      next: "human-approval",
      config: { field: config.decisionField, default: config.defaultDecision },
    },
    {
      id: "human-approval",
      type: "HUMAN_APPROVAL",
      next: "action-proposal",
      config: { required: true, risk: "high", reason: "Review proposal before any external execution" },
    },
    {
      id: "action-proposal",
      type: "ACTION",
      handler: createProposalHandler(config),
      next: "review",
      config: { mode: "proposal-only", externalWrites: false },
    },
    {
      id: "review",
      type: "REVIEW",
      handler: createReviewHandler(config),
      next: "memory-write",
      config: { cadence: config.reviewCadence },
    },
    {
      id: "memory-write",
      type: "MEMORY_WRITE",
      handler: createMemoryCandidateHandler(config),
      config: { persisted: false, topic: config.memoryTopic },
    },
  ];

  return { id: config.id, entryNodeId: "trigger", nodes };
}

function dataQualityGate(context: WorkflowNodeContext): WorkflowNodeResult {
  const status = readDataQualityStatus(context.input);
  const allowed = status === "TRUSTED" || status === "PARTIAL";
  const data = { dataQualityStatus: status, dataQualityGate: allowed ? "passed" : "blocked" };
  if (!allowed) {
    return {
      valid: false,
      data,
      message: `Data quality gate blocked workflow: ${status}`,
    };
  }
  return { valid: true, data };
}

function createAgentHandler(config: WorkflowTemplateConfig): ContextHandler {
  return (context) => ({
    output: {
      kind: "ANALYSIS_RESULT",
      workflowId: config.id,
      agent: config.agent,
      stages: [...config.analysisStages],
      inputReceived: context.input !== null,
    },
    data: {
      [`analysis:${config.agent}`]: {
        status: "completed",
        stages: [...config.analysisStages],
      },
    },
    evidence: [{
      id: `${config.id}:analysis`,
      kind: "workflow-analysis",
      label: `${config.agent} analysis result`,
    }],
  });
}

function createDecisionHandler(config: WorkflowTemplateConfig): WorkflowDecision {
  const decision: ContextDecision = (context) => {
    const input = asRecord(context.input);
    const candidate = input[config.decisionField];
    return typeof candidate === "string" && candidate.length > 0
      ? candidate
      : config.defaultDecision;
  };
  return decision;
}

function createProposalHandler(config: WorkflowTemplateConfig): WorkflowNodeHandler {
  const handler: ContextHandler = (context) => ({
    output: {
      kind: "ACTION_PROPOSAL",
      proposalId: `${config.id}:${context.runId}:proposal`,
      workflowId: config.id,
      proposalType: config.proposalType,
      decision: context.snapshot.nodeResults.decision?.decision ?? config.defaultDecision,
      status: "PROPOSED",
      execution: "proposal-only",
      writesApplied: false,
      requiresHumanApproval: true,
      plan: [...config.proposalPlan],
    },
  });
  return handler;
}

function createReviewHandler(config: WorkflowTemplateConfig): ContextHandler {
  return () => ({
    output: {
      kind: "REVIEW_PLAN",
      status: "SCHEDULED",
      cadence: [...config.reviewCadence],
      topic: config.memoryTopic,
    },
    data: {
      [`review:${config.id}`]: {
        status: "scheduled",
        cadence: [...config.reviewCadence],
      },
    },
  });
}

function createMemoryCandidateHandler(config: WorkflowTemplateConfig): ContextHandler {
  return (context) => ({
    output: {
      kind: "MEMORY_CANDIDATE",
      topic: config.memoryTopic,
      sourceRunId: context.runId,
      persisted: false,
      reason: "Candidate only; persistence is delegated to the Agent OS store",
    },
    data: {
      [`memory:${config.memoryTopic}`]: {
        status: "candidate",
        persisted: false,
      },
    },
  });
}

function readDataQualityStatus(input: unknown): DataQualityStatus {
  const record = asRecord(input);
  const nested = asRecord(record.dataQuality);
  const candidate = nested.status ?? record.dataQualityStatus;
  return isDataQualityStatus(candidate) ? candidate : "INVALID";
}

function isDataQualityStatus(value: unknown): value is DataQualityStatus {
  return value === "TRUSTED"
    || value === "PARTIAL"
    || value === "STALE"
    || value === "INVALID";
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
