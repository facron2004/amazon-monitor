import { describe, expect, it } from "vitest";
import { evaluateActionGatewayPolicy, isAllowedActionStatusTransition } from "./action-gateway-policy.js";

const base = {
  type: "CREATE_TASK",
  riskLevel: "LOW" as const,
  confidence: 0.92,
  requiresApproval: false,
  status: "PROPOSED" as const,
  hasExistingExecution: false,
};

describe("Agent OS Action Gateway policy", () => {
  it("allows only low-risk auto-execution or approved proposals", () => {
    expect(evaluateActionGatewayPolicy(base)).toMatchObject({ allowed: true, reason: "eligible", executor: "CREATE_TASK" });
    expect(evaluateActionGatewayPolicy({ ...base, requiresApproval: true })).toMatchObject({ allowed: false, reason: "approval_required" });
    expect(evaluateActionGatewayPolicy({ ...base, requiresApproval: true, status: "APPROVED" })).toMatchObject({ allowed: true });
  });

  it("fails closed for unsupported, risky, and low-confidence actions", () => {
    expect(evaluateActionGatewayPolicy({ ...base, type: "UPDATE_PRICE" })).toMatchObject({ allowed: false, reason: "unsupported_action" });
    expect(evaluateActionGatewayPolicy({ ...base, riskLevel: "HIGH" })).toMatchObject({ allowed: false, reason: "risk_requires_approval" });
    expect(evaluateActionGatewayPolicy({ ...base, confidence: 0.69 })).toMatchObject({ allowed: false, reason: "low_confidence_requires_approval" });
  });

  it("treats a recorded execution as idempotent and enforces lifecycle transitions", () => {
    expect(evaluateActionGatewayPolicy({ ...base, hasExistingExecution: true })).toMatchObject({ allowed: true, idempotent: true });
    expect(isAllowedActionStatusTransition("PROPOSED", "EXECUTING")).toBe(true);
    expect(isAllowedActionStatusTransition("EFFECTIVE", "EXECUTING")).toBe(false);
  });
});
