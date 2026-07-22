<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElOption, ElSelect, ElSwitch, ElTag } from "element-plus";
import { AlertTriangle, Play, RefreshCw, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from "@lucide/vue";
import {
  alertRuleCategories,
  alertRuleCategoryLabels,
  alertRuleCapabilityLabels,
  alertRuleOperators,
  alertRuleSeverities,
  alertRuleSeverityLabels,
  type AlertRule,
  type AlertRuleCondition,
  type AlertRuleConditionValue,
  type AlertRuleSeverity
} from "@amazon-monitor/shared";
import { useRulesStore } from "../stores/rules";
import { useWriteAccess } from "../composables/useWriteAccess";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";

interface ConditionDraft {
  metric: string;
  operator: AlertRuleCondition["operator"];
  value: string;
  unit: string;
}

const store = useRulesStore();
const { canWrite } = useWriteAccess("manage_rules");
const { rules, selectedRule, selectedRuleId, loading, saving, running, error, query, category, enabled } = storeToRefs(store);

const props = defineProps<{
  date: string;
}>();

const enabledCount = computed(() => rules.value.filter((rule) => rule.config.enabled).length);
const customizedCount = computed(() => rules.value.filter((rule) => rule.config.source === "customized").length);
const liveCount = computed(() => rules.value.filter((rule) => rule.capability === "live" && rule.config.enabled).length);

const editOpen = ref(false);
const editingRuleId = ref<string | null>(null);
const editForm = reactive({
  enabled: true,
  severity: "high" as AlertRuleSeverity,
  cooldownHours: 24,
  notes: ""
});
const conditionDrafts = ref<ConditionDraft[]>([]);

onMounted(async () => {
  await store.fetchRules();
});

function selectRule(rule: AlertRule): void {
  store.selectRule(rule.ruleId);
}

async function refresh(): Promise<void> {
  await store.fetchRules();
}

async function runRules(): Promise<void> {
  if (!canWrite.value) return;
  try {
    const triggeredCount = await store.runRules(props.date);
    ElMessage.success(triggeredCount > 0
      ? `已生成 ${triggeredCount} 条规则事件`
      : "评估完成，当前没有新的触发事件");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function openEdit(rule: AlertRule | null = selectedRule.value): void {
  if (!rule) return;
  editingRuleId.value = rule.ruleId;
  editForm.enabled = rule.config.enabled;
  editForm.severity = rule.config.severity;
  editForm.cooldownHours = rule.config.cooldownHours;
  editForm.notes = rule.config.notes ?? "";
  conditionDrafts.value = rule.config.conditions.map(toConditionDraft);
  editOpen.value = true;
}

function addCondition(): void {
  conditionDrafts.value.push({ metric: "", operator: ">=", value: "", unit: "" });
}

function removeCondition(index: number): void {
  conditionDrafts.value = conditionDrafts.value.filter((_, idx) => idx !== index);
}

async function toggleRule(rule: AlertRule, value: boolean): Promise<void> {
  if (!canWrite.value) return;
  try {
    await store.updateRule(rule.ruleId, { enabled: value });
    ElMessage.success(value ? "规则已开启" : "规则已关闭");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function submitEdit(): Promise<void> {
  if (!canWrite.value) return;
  if (!editingRuleId.value) return;
  const conditions = conditionDrafts.value.map(fromConditionDraft);
  if (conditions.some((condition) => condition.metric.trim().length === 0)) {
    ElMessage.warning("Each condition needs a metric.");
    return;
  }
  try {
    await store.updateRule(editingRuleId.value, {
      enabled: editForm.enabled,
      severity: editForm.severity,
      cooldownHours: editForm.cooldownHours,
      notes: editForm.notes.trim() || null,
      conditions
    });
    editOpen.value = false;
    ElMessage.success("规则已保存");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function resetSelected(): Promise<void> {
  if (!canWrite.value) return;
  if (!selectedRule.value) return;
  try {
    await store.resetRule(selectedRule.value.ruleId);
    ElMessage.success("已恢复系统默认配置");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function conditionText(condition: AlertRuleCondition): string {
  return `${condition.metric} ${condition.operator} ${String(condition.value)}${condition.unit ? ` ${condition.unit}` : ""}`;
}

function severityType(severity: AlertRuleSeverity): "info" | "success" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "info";
  return "success";
}

function toConditionDraft(condition: AlertRuleCondition): ConditionDraft {
  return {
    metric: condition.metric,
    operator: condition.operator,
    value: String(condition.value),
    unit: condition.unit ?? ""
  };
}

function fromConditionDraft(draft: ConditionDraft): AlertRuleCondition {
  return {
    metric: draft.metric.trim(),
    operator: draft.operator,
    value: parseConditionValue(draft.value),
    unit: draft.unit.trim() || null
  };
}

function parseConditionValue(value: string): AlertRuleConditionValue {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
</script>

<template>
  <section class="view rules-view">
    <header class="rules-toolbar panel">
      <div>
        <p class="eyebrow">规则中心</p>
        <h2>异常监控策略</h2>
      </div>
      <div class="rules-toolbar__actions">
        <ElButton type="primary" :loading="running" :disabled="!canWrite" @click="runRules">
          <template #icon><Play :size="14" /></template>
          立即评估
        </ElButton>
        <ElInput v-model="query" clearable placeholder="搜索规则或事件" style="width: 240px" @keyup.enter="refresh" />
        <ElSelect v-model="category" clearable placeholder="分类" style="width: 150px" @change="refresh">
          <ElOption v-for="item in alertRuleCategories" :key="item" :label="alertRuleCategoryLabels[item]" :value="item" />
        </ElSelect>
        <ElSelect v-model="enabled" clearable placeholder="配置状态" style="width: 130px" @change="refresh">
          <ElOption label="已开启" value="enabled" />
          <ElOption label="已关闭" value="disabled" />
        </ElSelect>
        <ElButton :loading="loading" @click="refresh">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
      </div>
    </header>

    <ReadOnlyNotice v-if="!canWrite" />

    <div class="metrics rules-metrics">
      <article class="metric">
        <span>规则总数</span>
        <strong>{{ rules.length }}</strong>
      </article>
      <article class="metric review-metric">
        <span>配置已开启</span>
        <strong>{{ enabledCount }}</strong>
      </article>
      <article class="metric hot">
        <span>实际运行</span>
        <strong>{{ liveCount }}</strong>
      </article>
      <article class="metric">
        <span>已自定义</span>
        <strong>{{ customizedCount }}</strong>
      </article>
    </div>

    <p v-if="error" class="rules-error">{{ error }}</p>

    <div class="rules-layout">
      <section class="panel rules-list-panel">
        <div class="panel-head">
          <div>
            <h2>规则目录</h2>
            <span>运行状态基于当前数据链路；高风险动作始终需要人工确认。</span>
          </div>
        </div>

        <div v-if="loading && rules.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading alert rules</p>
        </div>

        <div v-else-if="rules.length === 0" class="empty-state">
          <SlidersHorizontal :size="28" />
          <p>No rules match the current filters.</p>
        </div>

        <div v-else class="rules-list">
          <article
            v-for="rule in rules"
            :key="rule.ruleId"
            :class="['rules-row', { selected: selectedRuleId === rule.ruleId }]"
            @click="selectRule(rule)"
          >
            <div class="rules-row__main">
              <div class="rules-row__title">
                <ElTag size="small" :type="severityType(rule.config.severity)">{{ alertRuleSeverityLabels[rule.config.severity] }}</ElTag>
                <strong>{{ rule.name }}</strong>
              </div>
              <p>{{ rule.description }}</p>
              <small>{{ rule.eventType }} / {{ rule.ruleId }}</small>
            </div>
            <div class="rules-row__meta">
              <ElTag size="small" type="info">{{ alertRuleCategoryLabels[rule.category] }}</ElTag>
              <ElTag size="small" :type="rule.capability === 'live' ? 'success' : 'info'">
                {{ alertRuleCapabilityLabels[rule.capability] }}
              </ElTag>
              <ElTag v-if="rule.config.source === 'customized'" size="small" type="warning">Custom</ElTag>
              <ElSwitch :model-value="rule.config.enabled" :disabled="!canWrite" @click.stop @change="(value) => toggleRule(rule, Boolean(value))" />
            </div>
          </article>
        </div>
      </section>

      <aside class="panel rules-detail-panel">
        <div v-if="!selectedRule" class="empty-state">
          <ShieldCheck :size="28" />
          <p>Select a rule to review its trigger conditions.</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ selectedRule.name }}</h2>
              <span>{{ selectedRule.eventType }}</span>
            </div>
            <ElButton type="primary" size="small" :disabled="!canWrite" @click="openEdit(selectedRule)">
              <template #icon><SlidersHorizontal :size="12" /></template>
              Edit
            </ElButton>
          </div>

          <section class="rules-detail-grid">
            <div>
              <span>配置状态</span>
              <strong>{{ selectedRule.config.enabled ? "已开启" : "已关闭" }}</strong>
            </div>
            <div>
              <span>优先级</span>
              <strong>{{ alertRuleSeverityLabels[selectedRule.config.severity] }}</strong>
            </div>
            <div>
              <span>冷却周期</span>
              <strong>{{ selectedRule.config.cooldownHours }}h</strong>
            </div>
            <div>
              <span>配置来源</span>
              <strong>{{ selectedRule.config.source === "default" ? "系统默认" : "已自定义" }}</strong>
            </div>
          </section>

          <section class="rules-section">
            <h3>数据就绪度</h3>
            <div :class="['rules-readiness', `is-${selectedRule.capability}`]">
              <div>
                <strong>{{ alertRuleCapabilityLabels[selectedRule.capability] }}</strong>
                <span>新鲜度要求：{{ selectedRule.freshnessExpectation }}</span>
              </div>
              <ul>
                <li v-for="requirement in selectedRule.dataRequirements" :key="requirement">{{ requirement }}</li>
              </ul>
            </div>
          </section>

          <section class="rules-section">
            <h3>触发条件</h3>
            <ul class="rules-condition-list">
              <li v-for="condition in selectedRule.config.conditions" :key="conditionText(condition)">
                {{ conditionText(condition) }}
              </li>
            </ul>
          </section>

          <section class="rules-section">
            <h3>人工确认边界</h3>
            <div class="rules-approval">
              <AlertTriangle :size="16" />
              <p>{{ selectedRule.suggestion }}</p>
            </div>
          </section>

          <section class="rules-section">
            <h3>运营备注</h3>
            <p class="rules-notes">{{ selectedRule.config.notes || "暂无自定义备注" }}</p>
          </section>

          <div class="rules-detail-actions">
            <ElButton :disabled="!canWrite || selectedRule.config.source === 'default' || saving" @click="resetSelected">
              <template #icon><RotateCcw :size="14" /></template>
              恢复默认
            </ElButton>
          </div>
        </template>
      </aside>
    </div>

    <ElDialog v-model="editOpen" title="编辑预警规则" width="min(760px, calc(100vw - 32px))">
      <div class="rules-edit-form">
        <label>
          <span>配置开启</span>
          <ElSwitch v-model="editForm.enabled" />
        </label>
        <label>
          <span>优先级</span>
          <ElSelect v-model="editForm.severity">
            <ElOption v-for="severity in alertRuleSeverities" :key="severity" :label="alertRuleSeverityLabels[severity]" :value="severity" />
          </ElSelect>
        </label>
        <label>
          <span>冷却时间（小时）</span>
          <ElInputNumber v-model="editForm.cooldownHours" :min="0" :max="720" />
        </label>
        <label class="wide">
          <span>运营备注</span>
          <ElInput v-model="editForm.notes" type="textarea" :rows="2" placeholder="可选，记录规则调整原因" />
        </label>

        <div class="rules-condition-editor wide">
          <div class="rules-condition-editor__head">
            <strong>触发条件</strong>
            <ElButton size="small" @click="addCondition">添加条件</ElButton>
          </div>
          <div v-for="(condition, index) in conditionDrafts" :key="index" class="rules-condition-editor__row">
            <ElInput v-model="condition.metric" placeholder="指标" />
            <ElSelect v-model="condition.operator" placeholder="运算符">
              <ElOption v-for="operator in alertRuleOperators" :key="operator" :label="operator" :value="operator" />
            </ElSelect>
            <ElInput v-model="condition.value" placeholder="阈值" />
            <ElInput v-model="condition.unit" placeholder="单位" />
            <ElButton :disabled="conditionDrafts.length <= 1" @click="removeCondition(index)">移除</ElButton>
          </div>
        </div>
      </div>
      <template #footer>
        <ElButton @click="editOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitEdit">
          <template #icon><Save :size="14" /></template>
          保存规则
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped src="../styles/rules.css"></style>
