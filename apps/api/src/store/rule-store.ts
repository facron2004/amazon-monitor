import type { DatabaseSync } from "node:sqlite";
import {
  alertRuleDefinitions,
  type AlertRule,
  type AlertRuleListFilter
} from "@amazon-monitor/shared";
import {
  getAlertRuleDefinition,
  mergeAlertRule,
  type AlertRuleConfigRow
} from "../services/alert-rule-service.js";
import { nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";

type RuleStoreMethods = Pick<Store, "listAlertRules" | "getAlertRule" | "upsertAlertRuleConfig" | "resetAlertRuleConfig">;

export function createRuleStore(db: DatabaseSync): RuleStoreMethods {
  return {
    listAlertRules(filter) {
      const orgId = filter.orgId;
      const rows = listRowsByOrg(db, orgId);
      const rowByRuleId = new Map(rows.map((row) => [row.rule_id, row]));
      return alertRuleDefinitions
        .map((definition) => mergeAlertRule(definition, rowByRuleId.get(definition.ruleId) ?? null, orgId))
        .filter((rule) => matchesFilter(rule, filter));
    },

    getAlertRule(orgId, ruleId) {
      const definition = getAlertRuleDefinition(ruleId);
      if (!definition) return null;
      return mergeAlertRule(definition, getRow(db, orgId, ruleId), orgId);
    },

    upsertAlertRuleConfig(input) {
      const definition = getAlertRuleDefinition(input.ruleId);
      if (!definition) {
        throw Object.assign(new Error(`Alert rule ${input.ruleId} not found`), { statusCode: 404 });
      }
      const current = mergeAlertRule(definition, getRow(db, input.orgId, input.ruleId), input.orgId).config;
      const now = nowIso();
      const next = {
        enabled: input.enabled ?? current.enabled,
        severity: input.severity ?? current.severity,
        conditions: input.conditions ?? current.conditions,
        cooldownHours: input.cooldownHours ?? current.cooldownHours,
        notes: normalizeNotes(input.notes === undefined ? current.notes : input.notes),
        updatedBy: input.updatedBy ?? current.updatedBy
      };
      db.prepare(
        `INSERT INTO alert_rule_configs
         (org_id, rule_id, enabled, severity, conditions_json, cooldown_hours, notes, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, rule_id) DO UPDATE SET
          enabled = excluded.enabled,
          severity = excluded.severity,
          conditions_json = excluded.conditions_json,
          cooldown_hours = excluded.cooldown_hours,
          notes = excluded.notes,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`
      ).run(
        input.orgId,
        input.ruleId,
        next.enabled ? 1 : 0,
        next.severity,
        JSON.stringify(next.conditions),
        clampCooldown(next.cooldownHours),
        next.notes,
        next.updatedBy,
        now,
        now
      );
      return mergeAlertRule(definition, getRow(db, input.orgId, input.ruleId), input.orgId);
    },

    resetAlertRuleConfig(orgId, ruleId) {
      const definition = getAlertRuleDefinition(ruleId);
      if (!definition) {
        throw Object.assign(new Error(`Alert rule ${ruleId} not found`), { statusCode: 404 });
      }
      db.prepare("DELETE FROM alert_rule_configs WHERE org_id = ? AND rule_id = ?").run(orgId, ruleId);
      return mergeAlertRule(definition, null, orgId);
    }
  };
}

function listRowsByOrg(db: DatabaseSync, orgId: number): AlertRuleConfigRow[] {
  return db
    .prepare("SELECT * FROM alert_rule_configs WHERE org_id = ?")
    .all(orgId) as unknown as AlertRuleConfigRow[];
}

function getRow(db: DatabaseSync, orgId: number, ruleId: string): AlertRuleConfigRow | null {
  const row = db
    .prepare("SELECT * FROM alert_rule_configs WHERE org_id = ? AND rule_id = ?")
    .get(orgId, ruleId) as unknown as AlertRuleConfigRow | undefined;
  return row ?? null;
}

function matchesFilter(rule: AlertRule, filter: AlertRuleListFilter): boolean {
  if (filter.category && rule.category !== filter.category) return false;
  if (filter.enabled !== undefined && rule.config.enabled !== filter.enabled) return false;
  const query = filter.q?.trim().toLowerCase();
  if (!query) return true;
  return (
    rule.name.toLowerCase().includes(query) ||
    rule.description.toLowerCase().includes(query) ||
    rule.ruleId.toLowerCase().includes(query) ||
    rule.eventType.toLowerCase().includes(query)
  );
}

function normalizeNotes(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clampCooldown(value: number): number {
  if (!Number.isFinite(value)) return 24;
  return Math.min(720, Math.max(0, Math.floor(value)));
}
