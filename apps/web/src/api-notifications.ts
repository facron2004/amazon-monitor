import type { NotificationSchedule, NotificationScheduleInput, NotificationSendLog } from "@amazon-monitor/shared";
import { request } from "./api-base";
import type { NotificationSendDate } from "./api-types";

export const notificationApi = {
  notificationSchedules: () => request<NotificationSchedule[]>("/notifications/schedules"),
  createNotificationSchedule: (payload: NotificationScheduleInput) =>
    request<NotificationSchedule>("/notifications/schedules", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateNotificationSchedule: (id: number, payload: Partial<NotificationScheduleInput>) =>
    request<NotificationSchedule>(`/notifications/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteNotificationSchedule: (id: number) =>
    request<void>(`/notifications/schedules/${id}`, {
      method: "DELETE"
    }),
  sendNotificationSchedule: (id: number, date: NotificationSendDate) =>
    request<NotificationSendLog>(`/notifications/schedules/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  notificationLogs: () => request<NotificationSendLog[]>("/notifications/logs?limit=30")
};
