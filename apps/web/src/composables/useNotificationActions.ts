import type { Ref } from "vue";
import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import { notificationApi } from "../api-notifications";
import type { NotificationForm } from "../types/notification";
import { toErrorMessage } from "../utils/error-message";
import { runErrorHandledTask } from "../utils/run-error-handled-task";

interface UseNotificationActionsOptions {
  date: Ref<string>;
  notificationSchedules: Ref<NotificationSchedule[]>;
  notificationLogs: Ref<NotificationSendLog[]>;
  notificationForm: Ref<NotificationForm>;
  sendingScheduleId: Ref<number | null>;
  clearMessages(): void;
  setAction(message: string): void;
  setError(message: string): void;
}

export function useNotificationActions(options: UseNotificationActionsOptions) {
  async function loadNotifications() {
    const [scheduleData, logData] = await Promise.all([notificationApi.notificationSchedules(), notificationApi.notificationLogs()]);
    options.notificationSchedules.value = scheduleData;
    options.notificationLogs.value = logData;
  }

  async function createNotification() {
    options.clearMessages();

    await runErrorHandledTask(options.setError, async () => {
      await notificationApi.createNotificationSchedule({
        name: options.notificationForm.value.name,
        channel: options.notificationForm.value.channel,
        target: options.notificationForm.value.target,
        sendTime: options.notificationForm.value.sendTime,
        timezone: options.notificationForm.value.timezone,
        status: options.notificationForm.value.status
      });
      options.notificationForm.value.name = "";
      options.notificationForm.value.target = "";
      options.setAction("通知计划已保存");
      await loadNotifications();
    });
  }

  async function toggleNotification(schedule: NotificationSchedule) {
    await notificationApi.updateNotificationSchedule(schedule.id, {
      status: schedule.status === "enabled" ? "disabled" : "enabled"
    });
    await loadNotifications();
  }

  async function removeNotification(schedule: NotificationSchedule) {
    if (!confirm(`确定要删除通知计划「${schedule.name}」吗？此操作不可撤销。`)) {
      return;
    }

    await runErrorHandledTask(options.setError, async () => {
      await notificationApi.deleteNotificationSchedule(schedule.id);
      options.setAction("通知计划已删除");
      await loadNotifications();
    });
  }

  async function sendNotificationNow(schedule: NotificationSchedule) {
    if (options.sendingScheduleId.value) {
      return;
    }

    options.sendingScheduleId.value = schedule.id;
    options.clearMessages();

    try {
      const log = await notificationApi.sendNotificationSchedule(schedule.id, options.date.value);
      if (log.status === "success") {
        options.setAction("通知已发送");
      } else {
        options.setError(log.errorMessage || "通知发送失败");
      }
      await loadNotifications();
    } catch (error) {
      options.setError(toErrorMessage(error));
    } finally {
      options.sendingScheduleId.value = null;
    }
  }

  return {
    loadNotifications,
    createNotification,
    toggleNotification,
    removeNotification,
    sendNotificationNow
  };
}
