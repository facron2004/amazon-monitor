export const notificationSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_notification_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  send_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  status TEXT NOT NULL DEFAULT 'enabled',
  last_sent_at TEXT,
  last_sent_date TEXT,
  last_status TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_schedule_due ON amazon_notification_schedule(status, send_time);

CREATE TABLE IF NOT EXISTS amazon_notification_send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  schedule_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  report_date TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  error_message TEXT,
  sent_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_send_log_schedule ON amazon_notification_send_log(schedule_id, report_date);
`;
