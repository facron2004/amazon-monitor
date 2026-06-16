import type { CategoryMonitorInput, NotificationScheduleInput } from "@amazon-monitor/shared";

export function validateNotificationInput(input: NotificationScheduleInput): void {
  if (!input.name?.trim()) {
    throw new Error("Notification name is required");
  }
  if (input.channel !== "email" && input.channel !== "feishu") {
    throw new Error("Notification channel must be email or feishu");
  }
  if (!input.target?.trim()) {
    throw new Error("Notification target is required");
  }
  if (!/^\d{2}:\d{2}$/.test(input.sendTime)) {
    throw new Error("sendTime must be HH:mm");
  }
  const [hour, minute] = input.sendTime.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error("sendTime must be HH:mm");
  }
  if (input.status && input.status !== "enabled" && input.status !== "disabled") {
    throw new Error("Notification status must be enabled or disabled");
  }
}

export function validateCategoryInput(input: CategoryMonitorInput): void {
  if (!input.name?.trim()) {
    throw new Error("Category name is required");
  }
  if (!input.marketplace?.trim()) {
    throw new Error("Category marketplace is required");
  }
  if (!input.categoryUrl?.trim()) {
    throw new Error("Category URL is required");
  }
  try {
    new URL(input.categoryUrl);
  } catch {
    throw new Error("Category URL must be a valid URL");
  }
  if (input.status && input.status !== "enabled" && input.status !== "disabled") {
    throw new Error("Category status must be enabled or disabled");
  }
}

export function normalizeTopN(value: number | undefined): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}
