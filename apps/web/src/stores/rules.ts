import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { AlertRule, AlertRuleCategory } from "@amazon-monitor/shared";
import { rulesApi, type UpdateRulePayload } from "../api-rules";

export const useRulesStore = defineStore("rules", () => {
  const rules = ref<AlertRule[]>([]);
  const selectedRuleId = ref<string | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const running = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");
  const category = ref<AlertRuleCategory | "">("");
  const enabled = ref<"" | "enabled" | "disabled">("");

  const selectedRule = computed(
    () => rules.value.find((rule) => rule.ruleId === selectedRuleId.value) ?? rules.value[0] ?? null
  );

  async function fetchRules(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      rules.value = await rulesApi.listRules({
        category: category.value || undefined,
        enabled: enabled.value === "" ? undefined : enabled.value === "enabled",
        q: query.value
      });
      if (selectedRuleId.value === null && rules.value.length > 0) {
        selectedRuleId.value = rules.value[0].ruleId;
      }
      if (selectedRuleId.value !== null && !rules.value.some((rule) => rule.ruleId === selectedRuleId.value)) {
        selectedRuleId.value = rules.value[0]?.ruleId ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function updateRule(ruleId: string, payload: UpdateRulePayload): Promise<AlertRule> {
    saving.value = true;
    error.value = null;
    try {
      const updated = await rulesApi.updateRule(ruleId, payload);
      replaceRule(updated);
      selectedRuleId.value = updated.ruleId;
      return updated;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function resetRule(ruleId: string): Promise<AlertRule> {
    saving.value = true;
    error.value = null;
    try {
      const reset = await rulesApi.resetRule(ruleId);
      replaceRule(reset);
      selectedRuleId.value = reset.ruleId;
      return reset;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function runRules(date: string): Promise<number> {
    running.value = true;
    error.value = null;
    try {
      const result = await rulesApi.runRules(date);
      return result.triggeredCount;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      running.value = false;
    }
  }

  function selectRule(ruleId: string): void {
    selectedRuleId.value = ruleId;
  }

  function replaceRule(rule: AlertRule): void {
    const index = rules.value.findIndex((item) => item.ruleId === rule.ruleId);
    if (index >= 0) {
      rules.value[index] = rule;
    } else {
      rules.value = [rule, ...rules.value];
    }
  }

  return {
    rules,
    selectedRuleId,
    selectedRule,
    loading,
    saving,
    running,
    error,
    query,
    category,
    enabled,
    fetchRules,
    updateRule,
    resetRule,
    runRules,
    selectRule
  };
});
