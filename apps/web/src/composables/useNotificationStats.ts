import { computed, type Ref } from "vue";
import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";

export interface NotificationTrendPoint {
  date: string;
  success: number;
  failed: number;
}

export interface NotificationErrorType {
  type: string;
  count: number;
}

export interface NotificationKpi {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  activeSchedules: number;
}

export interface NotificationStats {
  kpi: NotificationKpi;
  trend: NotificationTrendPoint[];
  channelMix: { email: number; feishu: number };
  errorTypes: NotificationErrorType[];
  scheduleStatus: {
    enabled: number;
    disabled: number;
    emailActive: number;
    feishuActive: number;
  };
}

const ERROR_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "认证失败", pattern: /EAUTH|Invalid login|认证失败|授权密码|授权码/i },
  { type: "连接失败", pattern: /ECONNREFUSED|ENOTFOUND|连接失败|无法连接/i },
  { type: "连接超时", pattern: /ETIMEDOUT|超时|timeout|greeting|secure TLS/i },
  { type: "飞书失败", pattern: /Feishu|webhook|飞书/i },
  { type: "配置缺失", pattern: /SMTP is not configured|not configured|SMTP_HOST/i }
];

function classifyError(message: string | null): string {
  if (!message) return "其他错误";
  for (const { type, pattern } of ERROR_PATTERNS) {
    if (pattern.test(message)) return type;
  }
  return "其他错误";
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortLabel(dateKey: string): string {
  return dateKey.slice(5);
}

function buildLast7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

export function computeNotificationStats(
  logs: NotificationSendLog[],
  schedules: NotificationSchedule[]
): NotificationStats {
  const success = logs.filter((l) => l.status === "success").length;
  const failed = logs.filter((l) => l.status === "failed").length;
  const total = logs.length;
  const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;
  const activeSchedules = schedules.filter((s) => s.status === "enabled").length;

  const dayBuckets = new Map<string, { success: number; failed: number }>();
  const last7 = buildLast7Days();
  for (const day of last7) {
    dayBuckets.set(day, { success: 0, failed: 0 });
  }
  for (const log of logs) {
    const day = localDateKey(log.sentAt);
    const bucket = dayBuckets.get(day);
    if (bucket) {
      if (log.status === "success") bucket.success++;
      else if (log.status === "failed") bucket.failed++;
    }
  }
  const trend: NotificationTrendPoint[] = last7.map((day) => ({
    date: shortLabel(day),
    success: dayBuckets.get(day)!.success,
    failed: dayBuckets.get(day)!.failed
  }));

  const channelMix = { email: 0, feishu: 0 };
  for (const log of logs) {
    if (log.channel === "email") channelMix.email++;
    else if (log.channel === "feishu") channelMix.feishu++;
  }

  const errorCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.status !== "failed") continue;
    const type = classifyError(log.errorMessage ?? log.message);
    errorCounts.set(type, (errorCounts.get(type) ?? 0) + 1);
  }
  const errorTypes: NotificationErrorType[] = Array.from(errorCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const scheduleStatus = {
    enabled: schedules.filter((s) => s.status === "enabled").length,
    disabled: schedules.filter((s) => s.status === "disabled").length,
    emailActive: schedules.filter((s) => s.status === "enabled" && s.channel === "email").length,
    feishuActive: schedules.filter((s) => s.status === "enabled" && s.channel === "feishu").length
  };

  return {
    kpi: { total, success, failed, successRate, activeSchedules },
    trend,
    channelMix,
    errorTypes,
    scheduleStatus
  };
}

export function useNotificationStats(
  logs: Ref<NotificationSendLog[]>,
  schedules: Ref<NotificationSchedule[]>
) {
  const stats = computed(() => computeNotificationStats(logs.value, schedules.value));
  return { stats };
}
