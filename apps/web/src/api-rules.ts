import type {
  AlertRule,
  AlertRuleCategory,
  AlertRuleCondition,
  AlertRuleRunResult,
  AlertRuleSeverity
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export interface RuleListQuery {
  category?: AlertRuleCategory;
  enabled?: boolean;
  q?: string;
}

export interface UpdateRulePayload {
  enabled?: boolean;
  severity?: AlertRuleSeverity;
  conditions?: AlertRuleCondition[];
  cooldownHours?: number;
  notes?: string | null;
}

export const rulesApi = {
  listRules: (query: RuleListQuery = {}) =>
    request<AlertRule[]>(`/rules?${buildQuery(query).toString()}`),
  runRules: (date: string, ruleIds?: string[]) =>
    request<AlertRuleRunResult>("/rules/run", {
      method: "POST",
      body: JSON.stringify({ date, ruleIds })
    }),
  updateRule: (ruleId: string, payload: UpdateRulePayload) =>
    request<AlertRule>(`/rules/${encodeURIComponent(ruleId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  resetRule: (ruleId: string) =>
    request<AlertRule>(`/rules/${encodeURIComponent(ruleId)}/config`, {
      method: "DELETE"
    })
};

function buildQuery(query: RuleListQuery): URLSearchParams {
  const params = new URLSearchParams();
  setOptional(params, "category", query.category);
  if (query.enabled !== undefined) params.set("enabled", String(query.enabled));
  setOptional(params, "q", query.q?.trim());
  return params;
}

function setOptional(params: URLSearchParams, key: string, value: string | undefined | null): void {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, value);
  }
}
