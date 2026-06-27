<script setup lang="ts">
import { Clock3 } from "@lucide/vue";
import type { InsightEvent } from "@amazon-monitor/shared";
import InsightScoreBadge from "./InsightScoreBadge.vue";

defineProps<{
  events: InsightEvent[];
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();
</script>

<template>
  <section class="review-queue">
    <div class="review-queue-head">
      <div>
        <span>复盘队列</span>
        <h3>到期需要验证的判断</h3>
      </div>
      <strong>{{ events.length }}</strong>
    </div>

    <div v-if="events.length" class="review-queue-list">
      <button v-for="event in events" :key="event.id" type="button" @click="emit('select', event)">
        <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
        <span>
          <strong>{{ event.eventTitle }}</strong>
          <small><Clock3 :size="13" /> {{ event.reviewDueDate || "-" }} · {{ event.status }}</small>
        </span>
      </button>
    </div>
    <p v-else class="empty-copy">暂无到期复盘事项</p>
  </section>
</template>

<style scoped>
.review-queue {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  padding: 16px;
}

.review-queue-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.review-queue-head span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.review-queue-head h3 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.review-queue-head strong {
  color: #0f172a;
  font-size: 28px;
}

.review-queue-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.review-queue-list button {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 10px;
  text-align: left;
}

.review-queue-list strong {
  color: #0f172a;
  display: block;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-queue-list small {
  align-items: center;
  color: #64748b;
  display: flex;
  gap: 5px;
  margin-top: 4px;
}

.empty-copy {
  color: #64748b;
  margin: 14px 0 0;
}
</style>
