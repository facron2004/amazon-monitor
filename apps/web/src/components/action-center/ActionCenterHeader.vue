<script setup lang="ts">
import { CheckCircle2, RefreshCw } from "@lucide/vue";

defineProps<{
  date: string;
  generating: boolean;
  reviewing: boolean;
  reviewDueCount: number;
}>();

const emit = defineEmits<{
  (event: "generate"): void;
  (event: "evaluate-review-due"): void;
}>();
</script>

<template>
  <div class="action-center-head">
    <div>
      <span>Action Center</span>
      <h2>运营行动中心</h2>
      <p>{{ date }} · 洞察事件、归因评分、状态流转和复盘队列</p>
    </div>
    <div class="action-center-actions">
      <button class="secondary" type="button" :disabled="reviewing || reviewDueCount === 0" @click="emit('evaluate-review-due')">
        <CheckCircle2 :size="16" :class="{ spinning: reviewing }" />
        <span>{{ reviewing ? "复盘中" : "自动复盘" }}</span>
      </button>
      <button class="primary" type="button" :disabled="generating" @click="emit('generate')">
        <RefreshCw :size="16" :class="{ spinning: generating }" />
        <span>{{ generating ? "生成中" : "生成洞察" }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
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

button {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
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
