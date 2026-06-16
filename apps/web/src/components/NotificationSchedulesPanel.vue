<script setup lang="ts">
import { Mail, MessageSquare, RefreshCw, Send, Trash2 } from "@lucide/vue";
import type { NotificationSchedule } from "@amazon-monitor/shared";
import type { NotificationForm } from "../types/notification";
import { statusText } from "../utils/formatters";

interface Props {
  notificationSchedules: NotificationSchedule[];
  notificationForm: NotificationForm;
  sendingScheduleId: number | null;
}

interface Emits {
  (e: "create-notification"): void;
  (e: "toggle-notification", schedule: NotificationSchedule): void;
  (e: "remove-notification", schedule: NotificationSchedule): void;
  (e: "send-notification-now", schedule: NotificationSchedule): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>通知计划</h2>
      <span>{{ notificationSchedules.length }} 个计划</span>
    </div>
    <form class="notification-form" @submit.prevent="emit('create-notification')">
      <input v-model="notificationForm.name" placeholder="计划名称" />
      <select v-model="notificationForm.channel">
        <option value="email">邮箱</option>
        <option value="feishu">飞书</option>
      </select>
      <input v-model="notificationForm.target" :placeholder="notificationForm.channel === 'email' ? 'ops@example.com' : 'https://open.feishu.cn/open-apis/bot/v2/hook/...'" />
      <input v-model="notificationForm.sendTime" type="time" />
      <select v-model="notificationForm.status">
        <option value="enabled">启用</option>
        <option value="disabled">停用</option>
      </select>
      <button type="submit" class="primary">
        <Send :size="16" />
        <span>保存</span>
      </button>
    </form>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>计划</th>
            <th>通道</th>
            <th>目标</th>
            <th>发送时间</th>
            <th>状态</th>
            <th>最近一次</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in notificationSchedules" :key="item.id">
            <td>{{ item.name }}</td>
            <td>
              <span class="channel-label">
                <Mail v-if="item.channel === 'email'" :size="15" />
                <MessageSquare v-else :size="15" />
                {{ item.channel === "email" ? "邮箱" : "飞书" }}
              </span>
            </td>
            <td class="target-cell">{{ item.target }}</td>
            <td>{{ item.sendTime }} {{ item.timezone }}</td>
            <td>{{ statusText(item.status) }}</td>
            <td>
              <strong>{{ item.lastStatus ? statusText(item.lastStatus) : "-" }}</strong>
              <small>{{ item.lastSentAt || item.lastError || "" }}</small>
            </td>
            <td class="row-actions">
              <button title="立即发送" type="button" :disabled="sendingScheduleId === item.id" @click="emit('send-notification-now', item)">
                <RefreshCw v-if="sendingScheduleId === item.id" :size="16" class="spinning" />
                <Send v-else :size="16" />
              </button>
              <button title="切换计划状态" type="button" @click="emit('toggle-notification', item)">
                <RefreshCw :size="16" />
              </button>
              <button title="删除计划" type="button" @click="emit('remove-notification', item)">
                <Trash2 :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
