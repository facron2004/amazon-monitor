<script setup lang="ts">
import type { ProductActivityCalendar } from "@amazon-monitor/shared";
import { useResizeObserver } from "@vueuse/core";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCompetitorTrendChart } from "../composables/useCompetitorTrendChart";
import { hasCompetitorTrendData } from "../utils/competitorTrendChartOptions";

const props = defineProps<{ calendar: ProductActivityCalendar }>();
const chartElement = ref<HTMLDivElement | null>(null);
const hasTrendData = computed(() => hasCompetitorTrendData(props.calendar));
const listingEvents = computed(() =>
  props.calendar.insightEvents.filter((event) => event.eventType === "LISTING_CHANGED")
);
const {
  setChartElement,
  renderCompetitorTrend,
  resizeCompetitorTrend,
  disposeCompetitorTrend
} = useCompetitorTrendChart();

watch(chartElement, (element) => {
  setChartElement(element);
  if (element && hasTrendData.value) void renderCompetitorTrend(props.calendar);
});

watch(
  () => props.calendar,
  (calendar) => {
    if (hasTrendData.value) void renderCompetitorTrend(calendar);
  }
);

useResizeObserver(chartElement, resizeCompetitorTrend);
onBeforeUnmount(disposeCompetitorTrend);
</script>

<template>
  <section class="competitor-trend" aria-labelledby="competitor-trend-title">
    <div class="competitor-trend-head">
      <div>
        <h3 id="competitor-trend-title">经营趋势</h3>
        <p>同一时间轴对照价格、Review、类目排名与 BSR，排名数字越小越好。</p>
      </div>
      <span>{{ calendar.summary.firstSeenDate ?? "-" }} 至 {{ calendar.summary.lastSeenDate ?? "-" }}</span>
    </div>
    <div v-if="hasTrendData" ref="chartElement" class="competitor-trend-chart"></div>
    <div v-else class="competitor-trend-empty">
      当前周期没有可绘制的价格、Review 或排名快照。
    </div>

    <div class="listing-change-head">
      <h3>Listing 变化</h3>
      <span>{{ listingEvents.length }} 条</span>
    </div>
    <ol v-if="listingEvents.length" class="listing-change-list">
      <li v-for="event in listingEvents" :key="event.id">
        <time :datetime="event.eventDate">{{ event.eventDate }}</time>
        <div>
          <strong>{{ event.eventTitle }}</strong>
          <p>{{ event.eventSummary }}</p>
        </div>
      </li>
    </ol>
    <div v-else class="listing-change-empty">当前周期未检测到标题或主图变化。</div>
  </section>
</template>

<style scoped>
.competitor-trend {
  border-top: 1px solid var(--border-color);
  margin-top: 18px;
  padding-top: 18px;
}

.competitor-trend-head,
.listing-change-head {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.competitor-trend-head h3,
.listing-change-head h3 {
  font-size: 15px;
  margin: 0;
}

.competitor-trend-head p,
.listing-change-list p {
  color: var(--text-secondary);
  font-size: 12px;
  margin: 4px 0 0;
}

.competitor-trend-head > span,
.listing-change-head span {
  color: var(--text-secondary);
  flex: 0 0 auto;
  font-size: 12px;
}

.competitor-trend-chart {
  height: 430px;
  margin-top: 10px;
  width: 100%;
}

.competitor-trend-empty,
.listing-change-empty {
  background: #f7f9fc;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 12px;
  padding: 20px;
  text-align: center;
}

.listing-change-head {
  border-top: 1px solid var(--border-color);
  margin-top: 16px;
  padding-top: 16px;
}

.listing-change-list {
  display: grid;
  gap: 0;
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.listing-change-list li {
  display: grid;
  gap: 14px;
  grid-template-columns: 88px minmax(0, 1fr);
  padding: 10px 0;
}

.listing-change-list li + li {
  border-top: 1px solid var(--border-color);
}

.listing-change-list time {
  color: var(--text-secondary);
  font-size: 12px;
}

.listing-change-list strong {
  font-size: 13px;
}

@media (max-width: 640px) {
  .competitor-trend-head {
    display: grid;
    gap: 6px;
  }

  .competitor-trend-chart {
    height: 390px;
  }

  .listing-change-list li {
    gap: 4px;
    grid-template-columns: 1fr;
  }
}
</style>
