<script setup lang="ts">
import type { NotificationSendLog } from "@amazon-monitor/shared";
import { statusText } from "../utils/formatters";
import { formatLocalDateTime, formatWebTimezoneLabel } from "../utils/formatters-time";

interface Props {
  notificationLogs: NotificationSendLog[];
}

defineProps<Props>();
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>发送日志</h2>
      <span>{{ notificationLogs.length }} 条</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>发送时间</th>
            <th>计划</th>
            <th>通道</th>
            <th>报告日期</th>
            <th>状态</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in notificationLogs" :key="log.id">
            <td>{{ formatLocalDateTime(log.sentAt) }}</td>
            <td>{{ log.scheduleName }}</td>
            <td>{{ log.channel === "email" ? "邮箱" : "飞书" }}</td>
            <td>{{ formatWebTimezoneLabel(log.reportDate) }}</td>
            <td>{{ statusText(log.status) }}</td>
            <td>{{ log.message || log.errorMessage || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
