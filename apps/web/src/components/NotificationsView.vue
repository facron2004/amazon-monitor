<script setup lang="ts">
import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import type { NotificationForm } from "../types/notification";
import NotificationLogsPanel from "./NotificationLogsPanel.vue";
import NotificationSchedulesPanel from "./NotificationSchedulesPanel.vue";

interface Props {
  notificationSchedules: NotificationSchedule[];
  notificationLogs: NotificationSendLog[];
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
  <section class="view">
    <div class="smtp-banner">
      <div class="smtp-icon">i</div>
      <div>
        <h3>邮件发送与排期设置</h3>
        <p>
          在这里配置周期发送。邮箱通道会直接使用 API 服务环境中的 SMTP 设置。EXE 推荐将配置文件放在 <code>%APPDATA%\Amazon Monitor\.env</code>，也支持放在 EXE 同目录；开发环境继续读取项目根目录的 <code>.env</code>。
        </p>
        <div class="smtp-vars">
          <div>SMTP_HOST：SMTP 服务器地址，例如 smtp.qq.com</div>
          <div>SMTP_PORT：SMTP 端口，例如 465 或 587</div>
          <div>SMTP_USER：发件邮箱账号</div>
          <div>SMTP_PASS：应用密码或授权码</div>
          <div>SMTP_FROM：展示给收件人的发件地址</div>
        </div>
        <p class="smtp-highlight">当前投递模板支持 ASIN、缩略图、标题、类目 BSR、聚合排名和 Amazon 直达链接。</p>
      </div>
    </div>

    <NotificationSchedulesPanel
      :notification-schedules="notificationSchedules"
      :notification-form="notificationForm"
      :sending-schedule-id="sendingScheduleId"
      @create-notification="emit('create-notification')"
      @toggle-notification="emit('toggle-notification', $event)"
      @remove-notification="emit('remove-notification', $event)"
      @send-notification-now="emit('send-notification-now', $event)"
    />

    <NotificationLogsPanel :notification-logs="notificationLogs" />
  </section>
</template>
