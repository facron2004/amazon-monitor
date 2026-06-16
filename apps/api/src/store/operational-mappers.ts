import type {
  AlertLevel,
  AlertLog,
  ChangeType,
  CollectTaskLog,
  DailyChange,
  NotificationSchedule,
  NotificationSendLog
} from "@amazon-monitor/shared";

export interface ChangeRow {
  asin: string;
  keyword: string;
  marketplace: string;
  snapshot_date: string;
  yesterday_rank: number | null;
  today_rank: number | null;
  rank_change: number | null;
  yesterday_price: number | null;
  today_price: number | null;
  price_change: number | null;
  price_change_rate: number | null;
  yesterday_sponsored: number | null;
  today_sponsored: number | null;
  change_type: ChangeType;
  title: string;
  brand: string | null;
}

export function mapChange(row: ChangeRow): DailyChange {
  return {
    asin: row.asin,
    keyword: row.keyword,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    yesterdayRank: row.yesterday_rank,
    todayRank: row.today_rank,
    rankChange: row.rank_change,
    yesterdayPrice: row.yesterday_price,
    todayPrice: row.today_price,
    priceChange: row.price_change,
    priceChangeRate: row.price_change_rate,
    yesterdaySponsored: row.yesterday_sponsored === null ? null : Boolean(row.yesterday_sponsored),
    todaySponsored: row.today_sponsored === null ? null : Boolean(row.today_sponsored),
    changeType: row.change_type,
    title: row.title,
    brand: row.brand
  };
}

export interface AlertRow {
  id: number;
  alert_date: string;
  alert_type: string;
  alert_level: AlertLevel;
  keyword: string;
  asin: string;
  title: string;
  brand: string | null;
  alert_content: string;
  old_value: string | null;
  new_value: string | null;
  status: AlertLog["status"];
  created_at: string;
}

export function mapAlert(row: AlertRow): AlertLog {
  return {
    id: row.id,
    alertDate: row.alert_date,
    alertType: row.alert_type,
    alertLevel: row.alert_level,
    keyword: row.keyword,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    alertContent: row.alert_content,
    oldValue: row.old_value,
    newValue: row.new_value,
    status: row.status,
    createdAt: row.created_at
  };
}

export interface TaskLogRow {
  id: number;
  task_type: string;
  keyword_id: number | null;
  keyword: string | null;
  marketplace: string | null;
  status: CollectTaskLog["status"];
  start_time: string;
  end_time: string | null;
  page_count: number;
  success_count: number;
  fail_count: number;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export function mapTaskLog(row: TaskLogRow): CollectTaskLog {
  return {
    id: row.id,
    taskType: row.task_type,
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    pageCount: row.page_count,
    successCount: row.success_count,
    failCount: row.fail_count,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    createdAt: row.created_at
  };
}

export interface NotificationScheduleRow {
  id: number;
  name: string;
  channel: NotificationSchedule["channel"];
  target: string;
  send_time: string;
  timezone: string;
  status: NotificationSchedule["status"];
  last_sent_at: string | null;
  last_sent_date: string | null;
  last_status: NotificationSchedule["lastStatus"];
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function mapNotificationSchedule(row: NotificationScheduleRow): NotificationSchedule {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    target: row.target,
    sendTime: row.send_time,
    timezone: row.timezone,
    status: row.status,
    lastSentAt: row.last_sent_at,
    lastSentDate: row.last_sent_date,
    lastStatus: row.last_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface NotificationSendLogRow {
  id: number;
  schedule_id: number;
  schedule_name: string;
  channel: NotificationSendLog["channel"];
  target: string;
  report_date: string;
  status: NotificationSendLog["status"];
  message: string | null;
  error_message: string | null;
  sent_at: string;
  created_at: string;
}

export function mapNotificationSendLog(row: NotificationSendLogRow): NotificationSendLog {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    scheduleName: row.schedule_name,
    channel: row.channel,
    target: row.target,
    reportDate: row.report_date,
    status: row.status,
    message: row.message,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}
