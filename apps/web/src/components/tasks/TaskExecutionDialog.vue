<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElDialog, ElInput, ElMessage } from "element-plus";
import { Plus, X } from "@lucide/vue";
import type { Task, TaskExecutionInput, TaskMetricEntry } from "@amazon-monitor/shared";
import { parseTaskMetricEntries } from "../../utils/task-metrics.js";

interface MetricRow {
  id: number;
  label: string;
  before: string;
  after: string;
  unit: string;
}

const props = defineProps<{
  task: Task | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: TaskExecutionInput];
}>();

const actionTaken = ref("");
const metricRows = ref<MetricRow[]>([]);
let nextMetricId = 1;

const visible = computed({
  get: () => props.task !== null,
  set: (value: boolean) => {
    if (!value) emit("close");
  }
});

watch(() => props.task, (task) => {
  actionTaken.value = task?.actionTaken ?? "";
  metricRows.value = mergeMetricRows(task?.resultBeforeJson, task?.resultAfterJson);
}, { immediate: true });

function addMetric(): void {
  metricRows.value.push(createMetricRow());
}

function removeMetric(id: number): void {
  metricRows.value = metricRows.value.filter((row) => row.id !== id);
}

function submit(): void {
  const action = actionTaken.value.trim();
  if (!action) {
    ElMessage.warning("请记录本次实际执行的动作。");
    return;
  }
  if (metricRows.value.some((row) => !row.label.trim() && (row.before.trim() || row.after.trim()))) {
    ElMessage.warning("已填写指标值时，请补充指标名称。");
    return;
  }
  const resultBefore = toSnapshot("before");
  const resultAfter = toSnapshot("after");
  emit("submit", {
    actionTaken: action,
    ...(resultBefore.length ? { resultBefore } : {}),
    ...(resultAfter.length ? { resultAfter } : {})
  });
}

function toSnapshot(side: "before" | "after"): TaskMetricEntry[] {
  return metricRows.value.flatMap((row) => {
    const value = row[side].trim();
    const label = row.label.trim();
    if (!value || !label) return [];
    return [{ label, value, unit: row.unit.trim() || null }];
  });
}

function mergeMetricRows(beforeRaw: string | null | undefined, afterRaw: string | null | undefined): MetricRow[] {
  const rows = new Map<string, MetricRow>();
  for (const [side, entries] of [["before", parseTaskMetricEntries(beforeRaw)], ["after", parseTaskMetricEntries(afterRaw)]] as const) {
    for (const entry of entries) {
      const key = `${entry.label}\u0000${entry.unit ?? ""}`;
      const row = rows.get(key) ?? createMetricRow(entry.label, entry.unit ?? "");
      row[side] = entry.value;
      rows.set(key, row);
    }
  }
  return rows.size ? [...rows.values()] : [createMetricRow()];
}

function createMetricRow(label = "", unit = ""): MetricRow {
  return { id: nextMetricId++, label, before: "", after: "", unit };
}
</script>

<template>
  <ElDialog v-model="visible" :title="task ? `登记执行｜${task.title}` : '登记执行'" width="720px" destroy-on-close>
    <div class="execution-dialog">
      <div class="execution-context">
        <span>{{ task?.taskType }}</span>
        <span>{{ task?.relatedAsin || task?.relatedBrand || task?.relatedKeyword || '未关联对象' }}</span>
      </div>

      <label class="execution-field">
        <span>人工执行记录</span>
        <ElInput v-model="actionTaken" type="textarea" :rows="4" placeholder="例如：将主推词 Campaign 日预算从 $80 调整为 $100，并暂停 2 个高 ACOS 搜索词。" />
      </label>

      <section class="metric-section">
        <header>
          <div>
            <strong>结果指标</strong>
            <span>可选，记录可比较的关键数据。</span>
          </div>
          <ElButton size="small" @click="addMetric">
            <Plus :size="14" />
            添加指标
          </ElButton>
        </header>

        <div class="metric-head" aria-hidden="true">
          <span>指标</span><span>执行前</span><span>执行后</span><span>单位</span><span></span>
        </div>
        <div v-for="row in metricRows" :key="row.id" class="metric-row">
          <ElInput v-model="row.label" placeholder="例如 ACOS" />
          <ElInput v-model="row.before" placeholder="18.6" />
          <ElInput v-model="row.after" placeholder="15.2" />
          <ElInput v-model="row.unit" placeholder="% / $ / 天" />
          <ElButton text type="danger" title="删除指标" @click="removeMetric(row.id)"><X :size="15" /></ElButton>
        </div>
      </section>
    </div>

    <template #footer>
      <ElButton :disabled="saving" @click="emit('close')">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">登记并提交复核</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.execution-dialog { display: grid; gap: 18px; }
.execution-context { color: #667085; display: flex; font-size: 12px; gap: 8px; }
.execution-context span + span { border-left: 1px solid #d0d5dd; padding-left: 8px; }
.execution-field { display: grid; gap: 7px; }
.execution-field > span, .metric-section header span { color: #667085; font-size: 12px; }
.execution-field > span { color: #344054; font-weight: 700; }
.metric-section { border-top: 1px solid #eaecf0; display: grid; gap: 8px; padding-top: 14px; }
.metric-section header { align-items: center; display: flex; justify-content: space-between; }
.metric-section header > div { display: grid; gap: 3px; }
.metric-head, .metric-row { display: grid; gap: 8px; grid-template-columns: minmax(120px, 1.2fr) repeat(3, minmax(88px, 1fr)) 30px; }
.metric-head { color: #667085; font-size: 11px; padding: 0 4px; }
.metric-row :deep(.el-button) { min-width: 30px; padding: 0; }
@media (max-width: 640px) {
  .metric-head { display: none; }
  .metric-row { grid-template-columns: 1fr 1fr; }
  .metric-row :deep(.el-button) { grid-column: 2; justify-self: end; }
}
</style>
