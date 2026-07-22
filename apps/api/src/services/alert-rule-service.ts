import {
  alertRuleDefinitions,
  alertRuleOperators,
  alertRuleSeverities,
  type AlertRule,
  type AlertRuleCondition,
  type AlertRuleConditionValue,
  type AlertRuleConfig,
  type AlertRuleDefinition,
  type AlertRuleOperator,
  type AlertRuleSeverity
} from "@amazon-monitor/shared";

export interface AlertRuleConfigRow {
  id: number;
  org_id: number;
  rule_id: string;
  enabled: number;
  severity: string;
  conditions_json: string;
  cooldown_hours: number;
  notes: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

const definitionsById = new Map(alertRuleDefinitions.map((definition) => [definition.ruleId, definition]));

export function getAlertRuleDefinition(ruleId: string): AlertRuleDefinition | null {
  return definitionsById.get(ruleId) ?? null;
}

export function mergeAlertRule(definition: AlertRuleDefinition, row: AlertRuleConfigRow | null, orgId: number): AlertRule {
  const config: AlertRuleConfig = row
    ? {
        id: row.id,
        orgId: row.org_id,
        ruleId: row.rule_id,
        enabled: row.enabled === 1,
        severity: normalizeSeverity(row.severity, definition.defaultSeverity),
        conditions: parseConditions(row.conditions_json, definition.conditions),
        cooldownHours: normalizeCooldown(row.cooldown_hours),
        notes: row.notes,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: "customized"
      }
    : {
        id: null,
        orgId,
        ruleId: definition.ruleId,
        enabled: definition.defaultEnabled,
        severity: definition.defaultSeverity,
        conditions: definition.conditions,
        cooldownHours: 24,
        notes: null,
        updatedBy: null,
        createdAt: null,
        updatedAt: null,
        source: "default"
      };

  return { ...definition, config };
}

export function normalizeSeverity(value: string | undefined, fallback: AlertRuleSeverity): AlertRuleSeverity {
  return alertRuleSeverities.includes(value as AlertRuleSeverity) ? value as AlertRuleSeverity : fallback;
}

export function parseConditions(raw: string, fallback: AlertRuleCondition[]): AlertRuleCondition[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const conditions = parsed.filter(isAlertRuleCondition);
    return conditions.length > 0 ? conditions : fallback;
  } catch {
    return fallback;
  }
}

function isAlertRuleCondition(value: unknown): value is AlertRuleCondition {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.metric === "string" &&
    isOperator(record.operator) &&
    isConditionValue(record.value) &&
    (record.unit === undefined || record.unit === null || typeof record.unit === "string")
  );
}

function isOperator(value: unknown): value is AlertRuleOperator {
  return alertRuleOperators.includes(value as AlertRuleOperator);
}

function isConditionValue(value: unknown): value is AlertRuleConditionValue {
  return typeof value === "number" || typeof value === "string" || typeof value === "boolean";
}

function normalizeCooldown(value: number): number {
  if (!Number.isFinite(value)) return 24;
  return Math.min(720, Math.max(0, Math.floor(value)));
}
