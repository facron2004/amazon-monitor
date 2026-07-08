<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, CalendarClock, Gauge, UserCheck } from "@lucide/vue";
import { ElButton, ElProgress, ElTag } from "element-plus";
import type { InsightEvent, InsightEventLevel } from "@amazon-monitor/shared";
import { buildActionReadinessSummary } from "../../utils/actionCenterReadiness";

const props = defineProps<{
  events: InsightEvent[];
  currentDate: string;
  reviewDueActive: boolean;
  unassignedActive: boolean;
  p0Active: boolean;
}>();

const emit = defineEmits<{
  (event: "focus-unassigned"): void;
  (event: "focus-review-due"): void;
  (event: "focus-level", level: InsightEventLevel): void;
}>();

const summary = computed(() => buildActionReadinessSummary(props.events, props.currentDate));
const healthTone = computed<"success" | "warning" | "danger">(() => {
  if (summary.value.dueNowCount > 0 || summary.value.p0OpenCount > 0) return "danger";
  if (summary.value.assignedPercent < 80 || summary.value.scheduledReviewPercent < 80) return "warning";
  return "success";
});
const healthCopy = computed(() => {
  if (summary.value.actionableCount === 0) return "暂无打开动作";
  if (summary.value.dueNowCount > 0) return `${summary.value.dueNowCount} 个待复盘`;
  if (summary.value.p0OpenCount > 0) return `${summary.value.p0OpenCount} 个 P0 打开`;
  return "信息流就绪";
});
</script>

<template>
  <section class="readiness-panel">
    <header>
      <div class="readiness-title">
        <Gauge :size="16" />
        <div>
          <span>行动就绪度</span>
          <strong>负责人覆盖与复盘健康度</strong>
        </div>
      </div>
      <ElTag :type="healthTone" effect="light" round>{{ healthCopy }}</ElTag>
    </header>

    <div class="readiness-grid">
      <section class="readiness-card">
        <div class="readiness-card-head">
          <UserCheck :size="16" />
          <span>负责人覆盖</span>
          <strong>{{ summary.assignedPercent }}%</strong>
        </div>
        <ElProgress :percentage="summary.assignedPercent" :show-text="false" />
        <footer>
          <small>{{ summary.assignedCount }} / {{ summary.actionableCount }} 个打开动作</small>
          <ElButton link type="primary" :class="{ active: unassignedActive }" @click="emit('focus-unassigned')">
            {{ summary.unassignedCount }} 个未分配
          </ElButton>
        </footer>
      </section>

      <section class="readiness-card">
        <div class="readiness-card-head">
          <CalendarClock :size="16" />
          <span>复盘排期</span>
          <strong>{{ summary.scheduledReviewPercent }}%</strong>
        </div>
        <ElProgress :percentage="summary.scheduledReviewPercent" :show-text="false" />
        <footer>
          <small>{{ summary.scheduledReviewCount }} 个已排期复盘</small>
          <ElButton
            link
            type="primary"
            :class="{ active: reviewDueActive }"
            :disabled="summary.dueNowCount === 0"
            @click="emit('focus-review-due')"
          >
            {{ summary.dueNowCount }} 个待复盘
          </ElButton>
        </footer>
      </section>

      <section class="readiness-card readiness-card-compact">
        <div class="readiness-card-head">
          <AlertTriangle :size="16" />
          <span>优先级压力</span>
          <strong>{{ summary.totalScore }}</strong>
        </div>
        <div class="priority-row">
          <ElTag :type="summary.p0OpenCount > 0 ? 'danger' : 'info'" effect="light" round>
            {{ summary.p0OpenCount }} 个 P0 打开
          </ElTag>
          <ElButton
            link
            type="primary"
            :class="{ active: p0Active }"
            :disabled="summary.p0OpenCount === 0"
            @click="emit('focus-level', 'P0')"
          >
            聚焦 P0
          </ElButton>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.readiness-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.readiness-panel > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.readiness-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.readiness-title svg {
  color: #0f766e;
  flex: 0 0 auto;
}

.readiness-title span,
.readiness-card small {
  color: #64748b;
  font-size: 12px;
}

.readiness-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.readiness-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.readiness-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 11px;
}

.readiness-card-head {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.readiness-card-head svg {
  color: #64748b;
}

.readiness-card-head span {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readiness-card-head strong {
  color: #0f172a;
  font-size: 22px;
  line-height: 1;
}

.readiness-card footer,
.priority-row {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.readiness-card :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.readiness-card :deep(.el-button.active span) {
  color: #0f766e;
  font-weight: 700;
}

@media (max-width: 980px) {
  .readiness-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .readiness-panel > header,
  .readiness-card footer,
  .priority-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
