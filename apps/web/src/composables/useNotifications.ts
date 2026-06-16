import { ref, type Ref } from "vue";
import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import { useNotificationActions } from "./useNotificationActions";
import { createNotificationForm, type NotificationForm } from "../types/notification";

interface UseNotificationsOptions {
  date: Ref<string>;
  clearMessages(): void;
  setAction(message: string): void;
  setError(message: string): void;
}

export function useNotifications(options: UseNotificationsOptions) {
  const notificationSchedules = ref<NotificationSchedule[]>([]);
  const notificationLogs = ref<NotificationSendLog[]>([]);
  const sendingScheduleId = ref<number | null>(null);
  const notificationForm = ref<NotificationForm>(createNotificationForm());
  const {
    loadNotifications,
    createNotification,
    toggleNotification,
    removeNotification,
    sendNotificationNow
  } = useNotificationActions({
    date: options.date,
    notificationSchedules,
    notificationLogs,
    notificationForm,
    sendingScheduleId,
    clearMessages: options.clearMessages,
    setAction: options.setAction,
    setError: options.setError
  });

  return {
    notificationSchedules,
    notificationLogs,
    notificationForm,
    sendingScheduleId,
    loadNotifications,
    createNotification,
    toggleNotification,
    removeNotification,
    sendNotificationNow
  };
}
