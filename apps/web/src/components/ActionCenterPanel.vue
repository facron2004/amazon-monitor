<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { CheckCircle2, RefreshCw, SlidersHorizontal } from "@lucide/vue";
import {
  insightEventLevels,
  insightEventStatuses,
  insightEventTypes,
  insightEventTypeLabels,
  type AsinWatchLevel,
  type InsightEvent,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { useInsightEventsStore } from "../stores/insightEvents";
import ActionCenterKpiCards from "./action-center/ActionCenterKpiCards.vue";
import InsightEventDrawer from "./action-center/InsightEventDrawer.vue";
import InsightEventList from "./action-center/InsightEventList.vue";
import ReviewQueuePanel from "./action-center/ReviewQueuePanel.vue";

const props = defineProps<{
  date: string;
}>();

const store = useInsightEventsStore();
const { selectedEvent, reviewDueEvents, watchStates, loading, generating, reviewing, visibleEvents,
  p0Count, p1Count, todoCount, reviewedConfirmedCount, coreRiskCount } = storeToRefs(store);

// 状态/类型 label 都从 shared 拿,组件里只覆盖"待处理"这类业务口语化翻译,
// 避免和 packages/shared/insight-events.ts 的 insightEventTypeLabels 漂移
const statusLabels: Record<InsightEventStatus, string> = {
  TODO: "待处理",
  WATCHING: "观察中",
  FOLLOWED: "已跟进",
  IGNORED: "已忽略",
  REVIEW_PENDING: "待复盘",
  REVIEWED: "已复盘"
};

const watchingCount = computed(() => watchStates.value.filter((state) => state.watchLevel !== "IGNORED").length);
const selectedWatchState = computed(() => {
  const asin = selectedEvent.value?.asin;
  return asin ? watchStates.value.find((state) => state.asin === asin) ?? null : null;
});

// 筛选草稿:和 store.filters 同步,但 refetch 走显式"筛选"按钮,避免每个 select 改一下
// 就触发全量 API 请求。watch 在 onMounted 一次性把 store.filters 拷到 draft。
import { ref, watch, onMounted } from "vue";
const draftFilters = ref({ ...store.filters });
onMounted(() => {
  draftFilters.value = { ...store.filters };
});
watch(() => store.filters, (next) => {
  draftFilters.value = { ...next };
});
function applyFilters(): void {
  store.$patch({ filters: { ...draftFilters.value } });
  void store.loadEvents(props.date);
}

async function generate(): Promise<void> {
  await store.generateEvents(props.date);
}

async function evaluateDueReviews(): Promise<void> {
  await store.evaluateReviewDueEvents(props.date);
}

async function selectEvent(event: InsightEvent): Promise<void> {
  selectedEvent.value = event;
  await store.loadEventDetail(event.id);
}

async function updateStatus(id: string, status: InsightEventStatus, reviewDueDate?: string | null): Promise<void> {
  await store.setStatus(id, status, reviewDueDate);
  await store.loadReviewDueEvents(props.date);
}

async function updateNote(id: string, note: string): Promise<void> {
  await store.setNote(id, note);
}

async function watchEvent(id: string): Promise<void> {
  await store.watchEvent(id);
}

async function updateWatchState(event: InsightEvent, level: AsinWatchLevel): Promise<void> {
  await store.setWatchState(event, level);
}

async function reviewEvent(id: string, result: InsightReviewResult, note?: string | null): Promise<void> {
  await store.reviewEvent(id, result, note);
}

</script>

<template>
  <section class="action-center">
    <div class="action-center-head">
      <div>
        <span>Action Center</span>
        <h2>运营行动中心</h2>
        <p>{{ props.date }} · 洞察事件、归因评分、状态流转和复盘队列</p>
      </div>
      <div class="action-center-actions">
        <button class="secondary" type="button" :disabled="reviewing || reviewDueEvents.length === 0" @click="evaluateDueReviews">
          <CheckCircle2 :size="16" :class="{ spinning: reviewing }" />
          <span>{{ reviewing ? "复盘中" : "自动复盘" }}</span>
        </button>
        <button class="primary" type="button" :disabled="generating" @click="generate">
        <RefreshCw :size="16" :class="{ spinning: generating }" />
        <span>{{ generating ? "生成中" : "生成洞察" }}</span>
        </button>
      </div>
    </div>

    <ActionCenterKpiCards
      :p0-count="p0Count"
      :p1-count="p1Count"
      :todo-count="todoCount"
      :watching-count="watchingCount"
      :review-due-count="reviewDueEvents.length"
      :confirmed-count="reviewedConfirmedCount"
      :core-risk-count="coreRiskCount"
    />

    <div class="action-filter-bar">
      <SlidersHorizontal :size="16" />
      <select v-model="draftFilters.level">
        <option value="">全部等级</option>
        <option v-for="level in insightEventLevels" :key="level" :value="level">{{ level }}</option>
      </select>
      <select v-model="draftFilters.status">
        <option value="">全部状态</option>
        <option v-for="status in insightEventStatuses" :key="status" :value="status">{{ statusLabels[status] }}</option>
      </select>
      <select v-model="draftFilters.eventType">
        <option value="">全部类型</option>
        <option v-for="type in insightEventTypes" :key="type" :value="type">{{ insightEventTypeLabels[type] }}</option>
      </select>
      <select v-model="draftFilters.sortBy">
        <option value="score">机会分</option>
        <option value="level">事件等级</option>
        <option value="rankChange">排名变化</option>
        <option value="reviewChange">Review 增量</option>
        <option value="createdAt">创建时间</option>
      </select>
      <input v-model="draftFilters.brand" type="search" placeholder="品牌" @keydown.enter="applyFilters" />
      <input v-model="draftFilters.asin" type="search" placeholder="ASIN" @keydown.enter="applyFilters" />
      <label class="filter-toggle"><input v-model="draftFilters.coreOnly" type="checkbox" />核心竞品</label>
      <label class="filter-toggle"><input v-model="draftFilters.newBreakoutOnly" type="checkbox" />新品黑马</label>
      <label class="filter-toggle"><input v-model="draftFilters.reviewDueOnly" type="checkbox" />待复盘</label>
      <button type="button" :disabled="loading" @click="applyFilters">筛选</button>
    </div>

    <div class="action-layout">
      <InsightEventList :events="visibleEvents" :loading="loading" @select="selectEvent" />
      <ReviewQueuePanel :events="reviewDueEvents" @select="selectEvent" />
    </div>

    <InsightEventDrawer
      :event="selectedEvent"
      :watch-state="selectedWatchState"
      @close="selectedEvent = null"
      @status="updateStatus"
      @note="updateNote"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
    />
  </section>
</template>

<style scoped>
.action-center {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 18px;
}

.action-center-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.action-center-head span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.action-filter-bar > svg {
  color: #64748b;
}

.action-center-head h2 {
  color: #0f172a;
  font-size: 26px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.action-center-head p {
  color: #64748b;
  margin: 6px 0 0;
}

button,
select,
input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}

button {
  background: #ffffff;
  cursor: pointer;
  padding: 8px 10px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary {
  align-items: center;
  background: #0f172a;
  color: #ffffff;
  display: inline-flex;
  gap: 8px;
}

.secondary {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.action-center-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

.action-filter-bar {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
}

.action-filter-bar input[type="search"],
.action-filter-bar select {
  min-width: 120px;
  padding: 8px 10px;
}

.action-filter-bar select,
.action-filter-bar input[type="search"] {
  flex: 1 1 130px;
}

.filter-toggle {
  align-items: center;
  color: #475569;
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
  white-space: nowrap;
}

.filter-toggle input {
  accent-color: #0f766e;
  height: 16px;
  width: 16px;
}

.action-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .action-layout {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 760px) {
  .action-center-head {
    align-items: stretch;
    flex-direction: column;
  }

  .action-center-actions {
    justify-content: flex-start;
  }
}
</style>
