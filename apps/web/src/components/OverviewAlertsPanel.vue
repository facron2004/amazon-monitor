<script setup lang="ts">
import { AlertTriangle, CheckCircle2 } from "@lucide/vue";
import type { AlertLog } from "@amazon-monitor/shared";
import { changeLabel, localizeGeneratedText } from "../utils/formatters";

interface Props {
  highAlerts: AlertLog[];
  pendingAlertsCount: number;
}

interface Emits {
  (e: "update-alert", alert: AlertLog, status: AlertLog["status"]): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="panel alert-panel">
    <div class="panel-head panel-head-split">
      <div>
        <h2>重点预警</h2>
        <span>{{ pendingAlertsCount }} 条待处理</span>
      </div>
      <p class="panel-caption">把高风险项目单独拆出来，减少在信息列表里来回扫描的成本。</p>
    </div>
    <div v-if="highAlerts.length" class="alert-list">
      <article v-for="alert in highAlerts.slice(0, 8)" :key="alert.id" class="alert-row">
        <AlertTriangle :size="18" />
        <div>
          <strong>{{ changeLabel(alert.alertType) }}</strong>
          <p>{{ localizeGeneratedText(alert.alertContent) }}</p>
        </div>
        <button title="标记为已查看" type="button" @click="emit('update-alert', alert, 'viewed')">
          <CheckCircle2 :size="17" />
        </button>
      </article>
    </div>
    <div v-else class="empty-state">
      <CheckCircle2 :size="36" />
      <p>当前没有高优先级预警。</p>
    </div>
  </section>
</template>
