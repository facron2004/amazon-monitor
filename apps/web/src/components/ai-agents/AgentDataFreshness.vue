<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Clock3, Database } from "@lucide/vue";
import type { AiDataFreshness } from "@amazon-monitor/shared";

const props = defineProps<{ freshness: AiDataFreshness }>();

const isUnsafe = computed(() => (
  props.freshness.freshnessStatus !== "fresh"
  || props.freshness.syncStatus === "failed"
  || props.freshness.syncStatus === "partial"
  || props.freshness.syncStatus === "pending"
));

const stateLabel = computed(() => {
  if (props.freshness.freshnessStatus === "stale") return "数据已过期";
  if (props.freshness.freshnessStatus === "unknown") return "新鲜度未知";
  if (props.freshness.syncStatus === "failed") return "采集失败";
  if (props.freshness.syncStatus === "partial") return "部分成功";
  if (props.freshness.syncStatus === "pending") return "采集中";
  return "证据可用";
});

function formatTime(value: string | null): string {
  if (!value) return "暂无";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <section
    :class="['agent-freshness', { 'agent-freshness--unsafe': isUnsafe }]"
    :aria-label="`数据新鲜度：${stateLabel}`"
  >
    <header>
      <div>
        <AlertTriangle v-if="isUnsafe" :size="16" />
        <CheckCircle2 v-else :size="16" />
        <strong>{{ stateLabel }}</strong>
      </div>
      <span>时效要求 ≤ {{ freshness.maxAgeHours }} 小时</span>
    </header>
    <div class="agent-freshness__facts">
      <span><Clock3 :size="13" />证据日期 <strong>{{ freshness.evidenceDate }}</strong></span>
      <span><Clock3 :size="13" />更新时间 <strong>{{ formatTime(freshness.lastSyncedAt) }}</strong></span>
      <span><Database :size="13" />数据来源 <strong>{{ freshness.dataSource }}</strong></span>
      <span><Database :size="13" />采集状态 <strong>{{ freshness.syncStatus ?? "暂无" }}</strong></span>
    </div>
    <p v-if="freshness.warning">{{ freshness.warning }}</p>
    <p v-if="freshness.failureReason">{{ freshness.failureReason }}</p>
  </section>
</template>

<style scoped>
.agent-freshness {
  background: #f3faf6;
  border: 1px solid #b7dfc7;
  border-radius: 7px;
  color: #166534;
  display: grid;
  gap: 9px;
  padding: 10px 12px;
}

.agent-freshness--unsafe {
  background: #fff8ed;
  border-color: #efcf92;
  color: #8a4b08;
}

.agent-freshness header,
.agent-freshness header div,
.agent-freshness__facts span {
  align-items: center;
  display: flex;
}

.agent-freshness header {
  gap: 12px;
  justify-content: space-between;
}

.agent-freshness header div,
.agent-freshness__facts span {
  gap: 5px;
}

.agent-freshness header strong {
  font-size: 12px;
}

.agent-freshness header > span,
.agent-freshness__facts span {
  font-size: 10px;
}

.agent-freshness__facts {
  display: grid;
  gap: 7px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.agent-freshness__facts span {
  min-width: 0;
}

.agent-freshness__facts strong {
  color: #1d1d1f;
  overflow-wrap: anywhere;
}

.agent-freshness p {
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 560px) {
  .agent-freshness header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .agent-freshness__facts {
    grid-template-columns: 1fr;
  }
}
</style>
