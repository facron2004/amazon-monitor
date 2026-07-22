<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  Activity,
  BadgePercent,
  Eye,
  FilePenLine,
  Star,
  TrendingUp
} from "@lucide/vue";
import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  type InsightEvent
} from "@amazon-monitor/shared";
import { useOverviewActivityStore } from "../stores/overviewActivity";
import { formatLocalDateTime } from "../utils/formatters-time";
import {
  filterOverviewActivityEvents,
  overviewActivityDomainForEvent,
  type OverviewActivityDomain
} from "../utils/overview-activity";

const emit = defineEmits<{
  (event: "open-event", value: InsightEvent): void;
}>();

const store = useOverviewActivityStore();
const { events, loading } = storeToRefs(store);
const activeDomain = ref<OverviewActivityDomain>("all");

const tabs: Array<{ key: OverviewActivityDomain; label: string }> = [
  { key: "all", label: "全部" },
  { key: "ranking", label: "排名" },
  { key: "pricing", label: "价格活动" },
  { key: "listing", label: "Listing" },
  { key: "review", label: "Review" }
];

const visibleEvents = computed(() => (
  filterOverviewActivityEvents(events.value, activeDomain.value).slice(0, 12)
));

function countFor(domain: OverviewActivityDomain): number {
  return filterOverviewActivityEvents(events.value, domain).length;
}

function iconFor(event: InsightEvent) {
  const domain = overviewActivityDomainForEvent(event);
  if (domain === "pricing") return BadgePercent;
  if (domain === "listing") return FilePenLine;
  if (domain === "review") return Star;
  return TrendingUp;
}

function eventObject(event: InsightEvent): string {
  const parts = [event.brand, event.asin, event.evidence.marketplace].filter(Boolean);
  return parts.join(" · ") || "类目事件";
}

function eventTime(event: InsightEvent): string {
  const value = formatLocalDateTime(event.createdAt);
  return value === "-" ? event.eventDate.slice(5) : value.slice(-8, -3);
}
</script>

<template>
  <section class="activity-feed panel">
    <header class="activity-feed__head">
      <div class="activity-feed__title">
        <span><Activity :size="17" /></span>
        <div>
          <small>实时运营动态</small>
          <h2>异动信息流</h2>
        </div>
      </div>
      <p>P0 / P1 · {{ events.length }} 条</p>
    </header>

    <nav class="activity-feed__tabs" aria-label="异动类型">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="{ active: activeDomain === tab.key }"
        :aria-pressed="activeDomain === tab.key"
        @click="activeDomain = tab.key"
      >
        <span>{{ tab.label }}</span>
        <strong>{{ countFor(tab.key) }}</strong>
      </button>
    </nav>

    <div v-if="loading" class="activity-feed__state">
      <Activity :size="22" />
      <span>正在整理当天异动...</span>
    </div>

    <div v-else-if="visibleEvents.length === 0" class="activity-feed__state">
      <Activity :size="22" />
      <span>当前分类暂无 P0 / P1 异动。</span>
    </div>

    <ol v-else class="activity-feed__list">
      <li v-for="event in visibleEvents" :key="event.id">
        <time :datetime="event.createdAt">{{ eventTime(event) }}</time>
        <span :class="['activity-feed__icon', `level-${event.eventLevel}`]">
          <component :is="iconFor(event)" :size="16" />
        </span>
        <div class="activity-feed__body">
          <div>
            <span :class="['activity-feed__priority', `level-${event.eventLevel}`]">{{ event.eventLevel }}</span>
            <strong>{{ insightEventTypeLabels[event.eventType] }}</strong>
            <small>{{ insightEventStatusLabels[event.status] }}</small>
          </div>
          <h3>{{ event.eventTitle }}</h3>
          <p>{{ event.eventSummary }}</p>
          <small>{{ eventObject(event) }}</small>
        </div>
        <div class="activity-feed__action">
          <p>{{ event.suggestedAction }}</p>
          <button type="button" @click="emit('open-event', event)">
            <Eye :size="14" />
            <span>详情</span>
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style src="../styles/overview-activity-feed.css" scoped></style>
