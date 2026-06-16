<script setup lang="ts">
import { CheckCircle2, ClipboardList } from "@lucide/vue";
import type { AlertLog } from "@amazon-monitor/shared";
import { changeLabel, levelLabel, localizeGeneratedText, statusText } from "../utils/formatters";

interface Props {
  alerts: AlertLog[];
}

interface Emits {
  (e: "update-alert", alert: AlertLog, status: AlertLog["status"]): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function handleUpdateAlert(alert: AlertLog, status: AlertLog["status"]) {
  emit("update-alert", alert, status);
}
</script>

<template>
  <section class="view panel">
    <div class="panel-head">
      <h2>预警中心</h2>
      <span>{{ alerts.length }} 条预警</span>
    </div>
    <div v-if="alerts.length === 0" class="empty-state">
      <p>暂无告警。当关键词排名出现异常变化时，系统会自动生成告警。</p>
    </div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>级别</th>
            <th>类型</th>
            <th>关键词</th>
            <th>ASIN</th>
            <th>内容</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alert in alerts" :key="alert.id">
            <td><span :class="['level', alert.alertLevel]">{{ levelLabel(alert.alertLevel) }}</span></td>
            <td>{{ changeLabel(alert.alertType) }}</td>
            <td>{{ alert.keyword }}</td>
            <td>{{ alert.asin }}</td>
            <td>{{ localizeGeneratedText(alert.alertContent) }}</td>
            <td>{{ statusText(alert.status) }}</td>
            <td class="row-actions">
              <button title="标记为已查看" type="button" @click="handleUpdateAlert(alert, 'viewed')"><CheckCircle2 :size="16" /></button>
              <button title="标记为已跟进" type="button" @click="handleUpdateAlert(alert, 'followed')"><ClipboardList :size="16" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
