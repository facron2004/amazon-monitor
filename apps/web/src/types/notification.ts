import type { NotificationScheduleInput } from "@amazon-monitor/shared";

export interface NotificationForm {
  name: NotificationScheduleInput["name"];
  channel: NotificationScheduleInput["channel"];
  target: NotificationScheduleInput["target"];
  sendTime: NotificationScheduleInput["sendTime"];
  timezone: string;
  status: NonNullable<NotificationScheduleInput["status"]>;
}

export function createNotificationForm(): NotificationForm {
  return {
    name: "",
    channel: "email",
    target: "",
    sendTime: "09:30",
    timezone: "Asia/Shanghai",
    status: "enabled"
  };
}
