<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, Gauge, LayoutGrid, ListChecks, Radar } from "@lucide/vue";
import { ElProgress, ElStatistic, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../../stores/insightEvents";
import AsinGroupCard from "./AsinGroupCard.vue";
import { buildActionAsinCaseSummary } from "../../utils/actionCenterAsinCaseSummary";

const props = defineProps<{
  groups: AsinGroupedView[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

const expandedAsins = ref<Set<string>>(new Set());
const summary = computed(() => buildActionAsinCaseSummary(props.groups));

function toggleExpand(asin: string): void {
  const next = new Set(expandedAsins.value);
  if (next.has(asin)) {
    next.delete(asin);
  } else {
    next.add(asin);
  }
  expandedAsins.value = next;
}
</script>

<template>
  <section class="asin-list-panel">
    <div class="panel-title">
      <div>
        <span>ASIN 案件流</span>
        <h3>{{ groups.length }} 个待判断 ASIN</h3>
      </div>
      <small v-if="loading">加载中...</small>
    </div>

    <div v-if="groups.length" class="asin-summary-strip">
      <section>
        <ListChecks :size="16" />
        <ElStatistic title="案件数" :value="summary.caseCount" />
      </section>
      <section>
        <Gauge :size="16" />
        <ElStatistic title="平均分" :value="summary.averageScore" />
      </section>
      <section>
        <AlertTriangle :size="16" />
        <div class="summary-pair">
          <span>风险压力</span>
          <div>
            <ElTag :type="summary.p0CaseCount > 0 ? 'danger' : 'info'" effect="light" round>{{ summary.p0CaseCount }} P0</ElTag>
            <ElTag :type="summary.multiEventCaseCount > 0 ? 'warning' : 'info'" effect="light" round>{{ summary.multiEventCaseCount }} 多事件</ElTag>
          </div>
        </div>
      </section>
      <section>
        <Radar :size="16" />
        <div class="summary-progress">
          <span>
            <small>核心覆盖</small>
            <strong>{{ summary.corePercent }}%</strong>
          </span>
          <ElProgress :percentage="summary.corePercent" :show-text="false" />
        </div>
      </section>
    </div>

    <div v-if="groups.length" class="asin-list">
      <AsinGroupCard
        v-for="group in groups"
        :key="group.asin"
        :group="group"
        :expanded="expandedAsins.has(group.asin)"
        @select="emit('select', $event)"
        @toggle-expand="toggleExpand"
      />
    </div>

    <div v-else class="empty-copy">
      <LayoutGrid :size="36" />
      <p>没有可聚合的事件。可以取消筛选，或先生成新的洞察。</p>
      <small>事件列表视图仍可访问，点击顶部“事件列表”切换。</small>
    </div>
  </section>
</template>

<style scoped>
.asin-list-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.panel-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.panel-title span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.panel-title h3 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.asin-summary-strip {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.asin-summary-strip section {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 9px;
  grid-template-columns: auto minmax(0, 1fr);
  min-width: 0;
  padding: 10px;
}

.asin-summary-strip svg {
  color: #64748b;
}

.asin-summary-strip :deep(.el-statistic__head),
.summary-pair > span,
.summary-progress small {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 2px;
}

.asin-summary-strip :deep(.el-statistic__content),
.summary-progress strong {
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.summary-pair,
.summary-progress {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.summary-pair > div {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.summary-progress > span {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.summary-progress :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.asin-list {
  display: grid;
  gap: 12px;
}

.empty-copy {
  align-items: center;
  background: #f8fafc;
  border-radius: 8px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px;
  text-align: center;
}

.empty-copy p {
  margin: 0;
}

.empty-copy small {
  color: #94a3b8;
  display: inline-flex;
  gap: 4px;
}

@media (max-width: 1180px) {
  .asin-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .asin-summary-strip {
    grid-template-columns: 1fr;
  }
}
</style>
