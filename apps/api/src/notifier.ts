import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import { buildNotificationExcelAttachment } from "./excel-report.js";
import type { Store } from "./store.js";
import { isoDate } from "./pipeline.js";
import {
  buildFeishuNotificationContent,
  buildNotificationContent,
  buildNotificationSummaryHtmlContent,
  buildReportExcelDownloadUrl
} from "./notifications/content.js";
import { formatLocalDate, formatLocalTime } from "./notifications/schedule-time.js";
import { RealNotificationSender, type NotificationSender } from "./notifications/senders.js";

export { loadEnv } from "./notifications/env.js";
export {
  buildFeishuNotificationContent,
  buildNotificationContent,
  buildNotificationSummaryHtmlContent,
  buildReportExcelDownloadUrl
} from "./notifications/content.js";
export { RealNotificationSender, resolveSmtpConfig, type NotificationSender, type ResolvedSmtpConfig } from "./notifications/senders.js";

export async function sendNotificationSchedule(
  store: Store,
  schedule: NotificationSchedule,
  date = isoDate(),
  sender: NotificationSender = new RealNotificationSender()
): Promise<NotificationSendLog> {
  const sentAt = new Date().toISOString();
  const summary = store.getDashboardSummary(date, schedule.orgId);
  const content =
    schedule.channel === "feishu"
      ? buildFeishuNotificationContent(store, date, summary, buildReportExcelDownloadUrl(date), schedule.orgId)
      : buildNotificationContent(store, date, summary, schedule.orgId);
  const htmlContent = schedule.channel === "email"
    ? buildNotificationSummaryHtmlContent(store, date, summary, schedule.orgId)
    : undefined;
  const attachments = schedule.channel === "email"
    ? [buildNotificationExcelAttachment(store, date, schedule.orgId)]
    : undefined;

  try {
    const result = await sender.send(schedule, date, content, htmlContent, attachments);
    return logNotificationResult(store, schedule, date, sentAt, "success", result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return logNotificationResult(store, schedule, date, sentAt, "failed", null, message);
  }
}

function logNotificationResult(
  store: Store,
  schedule: NotificationSchedule,
  date: string,
  sentAt: string,
  status: "success" | "failed",
  message: string | null,
  errorMessage?: string | null
): NotificationSendLog {
  store.markNotificationScheduleSent(schedule.id, {
    sentAt,
    sentDate: date,
    status,
    errorMessage: errorMessage ?? null
  }, schedule.orgId);
  return store.insertNotificationSendLog({
    orgId: schedule.orgId,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    channel: schedule.channel,
    target: schedule.target,
    reportDate: date,
    status,
    message,
    errorMessage: errorMessage ?? null,
    sentAt
  });
}

export async function sendDueNotificationSchedules(
  store: Store,
  now = new Date(),
  sender: NotificationSender = new RealNotificationSender()
): Promise<NotificationSendLog[]> {
  const logs: NotificationSendLog[] = [];
  const schedules = store.listNotificationSchedules().filter((schedule) => {
    const localDate = formatLocalDate(now, schedule.timezone);
    const localTime = formatLocalTime(now, schedule.timezone);
    return schedule.status === "enabled" && localTime >= schedule.sendTime && schedule.lastSentDate !== localDate;
  });

  for (const schedule of schedules) {
    logs.push(await sendNotificationSchedule(store, schedule, formatLocalDate(now, schedule.timezone), sender));
  }

  return logs;
}
