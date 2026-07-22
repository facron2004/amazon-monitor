<script setup lang="ts">
import { computed } from "vue";
import {
  insightEventTypeLabels,
  strategyTagLabels,
  type InsightEvent,
  type StrategyTag
} from "@amazon-monitor/shared";
import { Sparkles, Target } from "@lucide/vue";
import {
  ElCard,
  ElEmpty,
  ElProgress,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElTooltip
} from "element-plus";
import type { PeriodInsightReportResponse } from "../../api-types";

const props = defineProps<{
  report: PeriodInsightReportResponse | null;
}>();

const topEvents = computed(() => props.report?.topEvents.slice(0, 6) ?? []);
const topBrands = computed(() => props.report?.topBrands.slice(0, 8) ?? []);
const maxBrandEvents = computed(() => Math.max(...topBrands.value.map((brand) => brand.eventCount), 1));

function levelTagType(event: InsightEvent): "danger" | "warning" | "info" {
  if (event.eventLevel === "P0") return "danger";
  if (event.eventLevel === "P1") return "warning";
  return "info";
}

function brandShare(value: number): number {
  return Math.min(100, Math.round((value / maxBrandEvents.value) * 100));
}

function strategyLabel(tag: StrategyTag): string {
  return strategyTagLabels[tag];
}
</script>

<template>
  <section class="report-signal-sidebar">
    <ElCard shadow="never" class="report-card">
      <template #header>
        <div class="panel-title">
          <Target :size="16" />
          <span>优先级</span>
          <ElTag size="small" type="danger" effect="light">{{ topEvents.length }}</ElTag>
        </div>
      </template>

      <ElTimeline v-if="topEvents.length" class="event-timeline">
        <ElTimelineItem
          v-for="event in topEvents"
          :key="event.id"
          :type="levelTagType(event)"
          :timestamp="event.eventDate"
          placement="top"
        >
          <div class="event-feed-item">
            <div>
              <ElTag size="small" :type="levelTagType(event)" effect="dark">{{ event.eventLevel }}</ElTag>
              <strong>{{ event.brand || event.asin || "未知对象" }}</strong>
            </div>
            <p>{{ insightEventTypeLabels[event.eventType] }}</p>
            <ElTooltip :content="event.eventTitle" placement="top" :show-after="350">
              <small>{{ event.eventTitle }}</small>
            </ElTooltip>
            <ElProgress :percentage="Math.min(event.scoreTotal, 100)" :stroke-width="6" :show-text="false" />
          </div>
        </ElTimelineItem>
      </ElTimeline>
      <ElEmpty v-else description="本期暂无事件证据。" :image-size="72" />
    </ElCard>

    <ElCard shadow="never" class="report-card">
      <template #header>
        <div class="panel-title">
          <Sparkles :size="16" />
          <span>品牌信号榜</span>
        </div>
      </template>

      <ElTable v-if="topBrands.length" :data="topBrands" size="small" class="brand-table" height="286">
        <ElTableColumn prop="brand" label="品牌" min-width="118" show-overflow-tooltip />
        <ElTableColumn label="事件" width="112">
          <template #default="{ row }">
            <div class="brand-events">
              <strong>{{ row.eventCount }}</strong>
              <ElProgress :percentage="brandShare(row.eventCount)" :stroke-width="5" :show-text="false" />
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="最高分" width="64">
          <template #default="{ row }">{{ row.topScore }}</template>
        </ElTableColumn>
        <ElTableColumn label="策略标签" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="strategy-tags">
              <ElTag
                v-for="tag in row.strategyTags.slice(0, 2)"
                :key="tag"
                size="small"
                effect="plain"
                round
              >
                {{ strategyLabel(tag) }}
              </ElTag>
              <ElTag v-if="row.strategyTags.length > 2" size="small" effect="plain" round>
                +{{ row.strategyTags.length - 2 }}
              </ElTag>
              <span v-if="row.strategyTags.length === 0">-</span>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-else description="本期暂无品牌信号证据。" :image-size="72" />
    </ElCard>
  </section>
</template>

<style scoped>
.report-signal-sidebar {
  display: grid;
  gap: 14px;
}

.report-card,
.event-feed-item {
  min-width: 0;
}

.panel-title,
.event-feed-item > div {
  align-items: center;
  display: flex;
}

.panel-title {
  color: #172033;
  font-size: 13px;
  font-weight: 800;
  gap: 8px;
  text-transform: uppercase;
}

.event-timeline {
  margin: 0;
  padding-left: 4px;
}

.event-feed-item {
  display: grid;
  gap: 6px;
}

.event-feed-item > div {
  gap: 8px;
  min-width: 0;
}

.event-feed-item strong,
.event-feed-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-feed-item p {
  color: #475467;
  font-size: 12px;
  margin: 0;
}

.event-feed-item small {
  color: #667085;
  display: block;
}

.brand-table {
  width: 100%;
}

.brand-events {
  display: grid;
  gap: 5px;
}

.brand-events strong {
  color: #172033;
  font-size: 12px;
}

.strategy-tags {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.strategy-tags span {
  color: #98a2b3;
  font-size: 12px;
}
</style>
