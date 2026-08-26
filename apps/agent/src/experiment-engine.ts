import type { DataQualityReport } from "./data-quality-engine.js";
import { measureOutcome } from "./outcome-engine.js";
import {
  validateExperiment,
  type Experiment,
  type ExperimentEvaluation,
  type IntelligenceLearningAction,
  type IntelligenceLearning,
} from "@amazon-monitor/shared";
import {
  evaluateIntelligenceConstraints,
  intelligenceApproval,
  isEvidenceAllowed,
} from "./intelligence-engine-utils.js";

export interface ExperimentEvaluationInput {
  experiment: Experiment;
  dataQuality?: DataQualityReport;
}

export function evaluateExperiment(input: ExperimentEvaluationInput): ExperimentEvaluation {
  const experiment = input.experiment;
  const validation = validateExperiment(experiment);
  const evidenceAllowed = input.dataQuality ? isEvidenceAllowed(input.dataQuality.status) : true;
  const constraints = evaluateIntelligenceConstraints(experiment.constraints, experiment.constraintValues);
  const measurement = measureOutcome({
    metric: experiment.metric,
    before: experiment.before,
    after: experiment.after,
    expectedValue: experiment.expectedValue,
    expectedDirection: experiment.expectedDirection,
    evidenceScore: evidenceAllowed ? experiment.evidenceScore : 0,
    observationDays: experiment.observationDays,
    plannedObservationDays: experiment.plannedObservationDays,
    confounders: experiment.confounders,
  });
  const learning: IntelligenceLearning = {
    kind: "learning",
    experimentId: experiment.id,
    conclusion: measurement.conclusion,
    nextAction: learningAction(measurement.status),
    confidence: measurement.confidence,
  };
  const approval = intelligenceApproval(experiment.confidence, experiment.riskLevel);
  const automaticExecutionEligible = validation.valid
    && evidenceAllowed
    && !constraints.conflict
    && experiment.confidence >= 0.7
    && measurement.status === "EFFECTIVE"
    && approval.automatic;
  return {
    experiment,
    outcome: {
      experimentId: experiment.id,
      metric: measurement.metric,
      status: measurement.status,
      attribution: measurement.attribution,
      before: measurement.before,
      after: measurement.after,
      delta: measurement.delta,
      deltaPercent: measurement.deltaPercent,
      observationDays: measurement.observationDays,
      conclusion: measurement.conclusion,
      confidence: measurement.confidence,
      confounders: measurement.confounders,
    },
    attribution: measurement.attribution,
    learning,
    constraints,
    approval,
    automaticExecutionEligible,
  };
}

function learningAction(status: "EFFECTIVE" | "INEFFECTIVE" | "INCONCLUSIVE" | "PENDING"): IntelligenceLearningAction {
  if (status === "EFFECTIVE") return "REUSE";
  if (status === "INEFFECTIVE") return "ADJUST";
  if (status === "INCONCLUSIVE") return "REJECT";
  return "CONTINUE_OBSERVING";
}
