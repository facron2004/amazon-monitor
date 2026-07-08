<script setup lang="ts">
import { computed } from "vue";
import { Activity, ListChecks } from "@lucide/vue";
import { ElEmpty, ElProgress, ElTag, ElTimeline, ElTimelineItem } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
  getActionScoreBreakdownRows,
  getTopActionScoreDrivers
} from "../../utils/actionCenterScoreBreakdown";

const props = defineProps<{
  event: InsightEvent;
}>();

const rows = computed(() => getActionScoreBreakdownRows(props.event));
const topDrivers = computed(() => getTopActionScoreDrivers(props.event, 2));
const primaryDriver = computed(() => topDrivers.value[0]?.label ?? "暂无驱动");
const reasons = computed(() => props.event.scoreBreakdown.reasons.filter((reason) => reason.trim().length > 0));
</script>

<template>
  <section class="score-map-panel">
    <header>
      <div class="score-map-title">
        <Activity :size="16" />
        <div>
          <span>评分证据图</span>
          <strong>{{ event.scoreTotal }} 总分 / {{ event.scoreLevel }} 级</strong>
        </div>
      </div>
      <ElTag type="warning" effect="light" round>{{ primaryDriver }}</ElTag>
    </header>

    <div class="score-driver-row">
      <ElTag
        v-for="driver in topDrivers"
        :key="driver.key"
        effect="light"
        round
        :style="{ '--driver-color': driver.color }"
        class="driver-tag"
      >
        {{ driver.label }} {{ driver.value }}
      </ElTag>
      <ElTag v-if="topDrivers.length === 0" effect="plain" round>暂无评分驱动</ElTag>
    </div>

    <div class="score-bars">
      <div v-for="row in rows" :key="row.key" class="score-bar-row">
        <div class="score-bar-label">
          <span>{{ row.label }}</span>
          <strong>{{ row.value }} / {{ row.max }}</strong>
        </div>
        <ElProgress :percentage="row.percent" :color="row.color" :show-text="false" />
      </div>
    </div>

    <div class="score-reasons">
      <div class="score-reasons-title">
        <ListChecks :size="14" />
        <span>判断理由</span>
      </div>
      <ElEmpty v-if="reasons.length === 0" description="暂无评分理由" :image-size="56" />
      <ElTimeline v-else>
        <ElTimelineItem
          v-for="reason in reasons"
          :key="reason"
          :timestamp="reason"
          placement="top"
        />
      </ElTimeline>
    </div>
  </section>
</template>

<style scoped>
.score-map-panel {
  display: grid;
  gap: 12px;
}

.score-map-panel > header {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.score-map-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.score-map-title svg {
  color: #2563eb;
  flex: 0 0 auto;
}

.score-map-title span,
.score-reasons-title {
  color: #64748b;
  font-size: 12px;
}

.score-map-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.score-driver-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.driver-tag {
  border-color: color-mix(in srgb, var(--driver-color) 34%, #ffffff);
  color: var(--driver-color);
}

.score-bars {
  display: grid;
  gap: 10px;
}

.score-bar-row {
  display: grid;
  gap: 5px;
}

.score-bar-label {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.score-bar-label span {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.score-bar-label strong {
  color: #0f172a;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.score-map-panel :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.score-reasons {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 10px;
}

.score-reasons-title {
  align-items: center;
  display: flex;
  gap: 6px;
  font-weight: 700;
}

.score-reasons :deep(.el-timeline) {
  padding-left: 4px;
}

.score-reasons :deep(.el-timeline-item__timestamp) {
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
}
</style>
