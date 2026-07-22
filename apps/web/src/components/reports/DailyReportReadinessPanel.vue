<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import {
  CircleCheck,
  CircleAlert,
  Database,
  Play,
  RefreshCw,
  TriangleAlert
} from "@lucide/vue";
import type { DailyReportReadinessState } from "@amazon-monitor/shared";
import { ElButton, ElCard, ElEmpty, ElTag, ElTooltip } from "element-plus";
import { useReportsStore } from "../../stores/reports";

const reportsStore = useReportsStore();
const { readiness, readinessLoading } = storeToRefs(reportsStore);

const emit = defineEmits<{
  navigate: [target: "data-sources" | "logs"];
}>();

const actionItems = computed(() => readiness.value?.items.filter((item) => item.state !== "ready") ?? []);
const readyCount = computed(() => readiness.value?.items.length
  ? readiness.value.items.length - readiness.value.gapsCount
  : 0);

function stateLabel(state: DailyReportReadinessState): string {
  if (state === "attention") return "需处理";
  if (state === "missing") return "待补齐";
  return "已覆盖";
}

function stateType(state: DailyReportReadinessState): "success" | "warning" | "danger" {
  if (state === "attention") return "danger";
  if (state === "missing") return "warning";
  return "success";
}

function sourceText(index: number): string {
  const item = actionItems.value[index];
  if (!item || item.sources.length === 0) return "尚未配置匹配的数据源";
  return item.sources.map((source) => source.name).join("、");
}

function navigate(target: "data-sources" | "collectors"): void {
  emit("navigate", target === "collectors" ? "logs" : "data-sources");
}
</script>

<template>
  <ElCard shadow="never" class="report-card readiness-card" :aria-busy="readinessLoading">
    <template #header>
      <div class="readiness-title">
        <span><TriangleAlert :size="16" /> 数据缺口</span>
        <ElTag size="small" :type="actionItems.length ? 'warning' : 'success'" effect="light">
          {{ actionItems.length ? `${actionItems.length} 项待处理` : "已覆盖" }}
        </ElTag>
      </div>
    </template>

    <template v-if="readiness">
      <div class="readiness-summary">
        <span>{{ readiness.archiveGenerated ? "基于归档日报" : "基于当前证据" }}</span>
        <strong>{{ readyCount }} / {{ readiness.items.length }}</strong>
        <span>核心数据已覆盖</span>
      </div>

      <div v-if="actionItems.length" class="readiness-list">
        <article v-for="(item, index) in actionItems" :key="item.feed" class="readiness-row">
          <div class="readiness-row-head">
            <span class="readiness-row-label">
              <CircleAlert v-if="item.state === 'attention'" :size="15" />
              <Database v-else :size="15" />
              <strong>{{ item.label }}</strong>
            </span>
            <ElTag size="small" :type="stateType(item.state)" effect="light">{{ stateLabel(item.state) }}</ElTag>
          </div>
          <p>{{ item.message }}</p>
          <div class="readiness-row-footer">
            <ElTooltip :content="sourceText(index)" placement="top">
              <span class="readiness-source">{{ sourceText(index) }}</span>
            </ElTooltip>
            <ElButton link type="primary" @click="navigate(item.action.target)">
              <Play v-if="item.action.target === 'collectors'" :size="13" />
              <RefreshCw v-else :size="13" />
              <span>{{ item.action.label }}</span>
            </ElButton>
          </div>
        </article>
      </div>

      <div v-else class="readiness-complete">
        <CircleCheck :size="16" />
        <span>五类核心数据均已写入当日日报。</span>
      </div>
    </template>

    <ElEmpty v-else description="正在读取日报数据可用性。" :image-size="48" />
  </ElCard>
</template>

<style scoped>
.readiness-card {
  min-width: 0;
}

.readiness-title,
.readiness-title > span,
.readiness-row-label,
.readiness-row-footer,
.readiness-complete {
  align-items: center;
  display: flex;
}

.readiness-title {
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  justify-content: space-between;
}

.readiness-title > span,
.readiness-row-label,
.readiness-row-footer,
.readiness-complete {
  gap: 7px;
}

.readiness-summary {
  align-items: baseline;
  color: #667085;
  display: flex;
  font-size: 11px;
  gap: 5px;
  margin: -3px 0 10px;
}

.readiness-summary strong {
  color: #172033;
  font-size: 16px;
}

.readiness-list {
  border-top: 1px solid #e6e9ee;
}

.readiness-row {
  border-bottom: 1px solid #e6e9ee;
  display: grid;
  gap: 6px;
  padding: 10px 0;
}

.readiness-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.readiness-row-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  min-width: 0;
}

.readiness-row-label {
  color: #253043;
  min-width: 0;
}

.readiness-row-label strong {
  font-size: 12px;
}

.readiness-row p {
  color: #667085;
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
}

.readiness-row-footer {
  justify-content: space-between;
  min-width: 0;
}

.readiness-source {
  color: #8a93a2;
  font-size: 10px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readiness-row-footer :deep(.el-button) {
  flex: 0 0 auto;
  font-size: 11px;
  margin-left: 8px;
}

.readiness-row-footer :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}

.readiness-complete {
  color: #027a48;
  font-size: 12px;
  padding: 4px 0;
}
</style>
