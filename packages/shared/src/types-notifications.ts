export type NotificationChannel = "email" | "feishu";
export type NotificationStatus = "enabled" | "disabled";
export type NotificationSendStatus = "success" | "failed";

export interface NotificationSchedule {
  id: number;
  orgId: number;
  name: string;
  channel: NotificationChannel;
  target: string;
  sendTime: string;
  timezone: string;
  status: NotificationStatus;
  lastSentAt: string | null;
  lastSentDate: string | null;
  lastStatus: NotificationSendStatus | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationScheduleInput {
  name: string;
  channel: NotificationChannel;
  target: string;
  sendTime: string;
  timezone?: string | null;
  status?: NotificationStatus;
}

export interface NotificationSendLog {
  id: number;
  orgId: number;
  scheduleId: number;
  scheduleName: string;
  channel: NotificationChannel;
  target: string;
  reportDate: string;
  status: NotificationSendStatus;
  message: string | null;
  errorMessage: string | null;
  sentAt: string;
  createdAt: string;
}
