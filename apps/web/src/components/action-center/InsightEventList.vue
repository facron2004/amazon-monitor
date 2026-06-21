<script setup lang="ts">
import { insightEventTypeLabels, type InsightEvent, type InsightEventStatus } from "@amazon-monitor/shared";
import AttributionTags from "./AttributionTags.vue";
import InsightScoreBadge from "./InsightScoreBadge.vue";

defineProps<{
  events: InsightEvent[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

// statusLabel 留本地翻译(口语化);eventTypeLabel 直接用 shared 里单一源。
const statusLabels: Record<InsightEventStatus, string> = {
  TODO: "待处理",
  WATCHING: "观察中",
  FOLLOWED: "已跟进",
  IGNORED: "已忽略",
  REVIEW_PENDING: "待复盘",
  REVIEWED: "已复盘"
};

function rankPath(event: InsightEvent): string {
  const previous = event.evidence.previousRank ? `#${event.evidence.previousRank}` : "-";
  const current = event.evidence.currentRank ? `#${event.evidence.currentRank}` : "-";
  return `${previous} -> ${current}`;
}

function rankDelta(event: InsightEvent): string {
  const value = event.evidence.rankChange;
  if (value === null || value === undefined) return "-";
  if (value > 0) return `上升 ${value}`;
  if (value < 0) return `下滑 ${Math.abs(value)}`;
  return "持平";
}
</script>

<template>
  <section class="event-list-panel">
    <div class="panel-title">
      <div>
        <span>事件列表</span>
        <h3>{{ events.length }} 条待判断机会</h3>
      </div>
      <small v-if="loading">加载中...</small>
    </div>

    <div v-if="events.length" class="event-list">
      <article v-for="event in events" :key="event.id" class="event-row" @click="emit('select', event)">
        <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
        <img v-if="event.evidence.imageUrl" :src="event.evidence.imageUrl" :alt="event.eventTitle" loading="lazy" decoding="async" />
        <div v-else class="event-image-fallback">ASIN</div>
        <div class="event-main">
          <div class="event-row-topline">
            <span>{{ event.eventLevel }}</span>
            <b>{{ eventTypeLabels[event.eventType] }}</b>
            <small>{{ statusLabels[event.status] }}</small>
          </div>
          <h4>{{ event.eventTitle }}</h4>
          <p>{{ event.brand || "未知品牌" }} · {{ event.asin || "品牌事件" }}</p>
          <AttributionTags :tags="event.attributionTags" />
        </div>
        <div class="event-metrics">
          <span>BSR {{ rankPath(event) }}</span>
          <strong>{{ rankDelta(event) }}</strong>
          <small v-if="event.reviewDueDate">复盘 {{ event.reviewDueDate }}</small>
          <small v-else>无复盘日</small>
        </div>
      </article>
    </div>
    <p v-else class="empty-copy">暂无洞察事件</p>
  </section>
</template>

<style scoped>
.event-list-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  padding: 16px;
}

.panel-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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

.event-list {
  display: grid;
  gap: 10px;
}

.event-row {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: auto 72px minmax(0, 1fr) minmax(130px, auto);
  min-height: 106px;
  padding: 12px;
}

.event-row img,
.event-image-fallback {
  background: #eef2f7;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  height: 72px;
  object-fit: contain;
  width: 72px;
}

.event-image-fallback {
  align-items: center;
  color: #64748b;
  display: flex;
  font-size: 12px;
  justify-content: center;
}

.event-main {
  min-width: 0;
}

.event-row-topline {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-row-topline span,
.event-row-topline b,
.event-row-topline small {
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
}

.event-row-topline span {
  background: #fee2e2;
  color: #991b1b;
}

.event-row-topline b {
  background: #e0f2fe;
  color: #075985;
  font-weight: 600;
}

.event-row-topline small {
  background: #f1f5f9;
  color: #475569;
}

.event-main h4 {
  color: #0f172a;
  font-size: 15px;
  line-height: 1.35;
  margin: 8px 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-main p {
  color: #64748b;
  font-size: 13px;
  margin: 0 0 8px;
}

.event-metrics {
  color: #64748b;
  display: grid;
  gap: 4px;
  justify-items: end;
  text-align: right;
}

.event-metrics strong {
  color: #0f172a;
}

.empty-copy {
  color: #64748b;
  margin: 0;
}

@media (max-width: 760px) {
  .event-row {
    grid-template-columns: auto 64px minmax(0, 1fr);
  }

  .event-metrics {
    grid-column: 1 / -1;
    justify-items: start;
    text-align: left;
  }
}
</style>
