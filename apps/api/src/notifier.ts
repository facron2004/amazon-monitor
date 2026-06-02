import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { DashboardSummary, NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import { buildNotificationExcelAttachment, type NotificationAttachment } from "./excel-report.js";
import type { Store } from "./store.js";
import { isoDate } from "./pipeline.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const searchPaths = [
      path.join(process.cwd(), ".env"),
      path.join(process.cwd(), "../..", ".env"),
      path.resolve(path.dirname(currentFile), "../../../..", ".env")
    ];
    for (const envPath of searchPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index > 0) {
            const key = trimmed.slice(0, index).trim();
            let val = trimmed.slice(index + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
        break;
      }
    }
  } catch (e) {
    // ignore
  }
}


export interface NotificationSender {
  send(
    schedule: NotificationSchedule,
    date: string,
    content: string,
    htmlContent?: string,
    attachments?: NotificationAttachment[]
  ): Promise<{ message: string }>;
}

export class RealNotificationSender implements NotificationSender {
  async send(
    schedule: NotificationSchedule,
    date: string,
    content: string,
    htmlContent?: string,
    attachments?: NotificationAttachment[]
  ): Promise<{ message: string }> {
    if (schedule.channel === "email") {
      return sendEmail(schedule, date, content, htmlContent, attachments);
    }
    return sendFeishu(schedule, content);
  }
}

export async function sendNotificationSchedule(
  store: Store,
  schedule: NotificationSchedule,
  date = isoDate(),
  sender: NotificationSender = new RealNotificationSender()
): Promise<NotificationSendLog> {
  const sentAt = new Date().toISOString();
  const summary = store.getDashboardSummary(date);
  const content =
    schedule.channel === "feishu"
      ? buildFeishuNotificationContent(store, date, summary, buildReportExcelDownloadUrl(date))
      : buildNotificationContent(store, date, summary);
  const htmlContent = schedule.channel === "email" ? buildNotificationSummaryHtmlContent(store, date, summary) : undefined;
  const attachments = schedule.channel === "email" ? [buildNotificationExcelAttachment(store, date)] : undefined;

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
  });
  return store.insertNotificationSendLog({
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

export function buildNotificationContent(store: Store, date: string, summary?: DashboardSummary): string {
  const report = store.getDailyReport(date);
  const categoryReport = store.getCategoryReport(date);
  const combinedReport = [categoryReport, report].filter((item) => item.trim()).join("\n\n---\n\n");
  if (combinedReport.trim()) {
    return combinedReport;
  }

  const dashSummary = summary ?? store.getDashboardSummary(date);
  const alerts = store.listAlerts({ date, limit: 10 });
  const categorySignals = store.listCategorySignals({ date, limit: 10 });
  return [
    "# Amazon Keyword Monitor Daily Report",
    "",
    `Date: ${date}`,
    `Active keywords: ${dashSummary.activeKeywordCount}`,
    `Active categories: ${dashSummary.activeCategoryCount}`,
    `Snapshots: ${dashSummary.todaySnapshotCount}`,
    `Category snapshots: ${dashSummary.categorySnapshotCount}`,
    `Competitors: ${dashSummary.competitorCount}`,
    `Alerts: ${dashSummary.alertCount}`,
    `Category signals: ${dashSummary.categorySignalCount}`,
    "",
    "## Top alerts",
    ...(alerts.length ? alerts.map((alert) => `- [${alert.alertLevel}] ${alert.keyword} ${alert.asin}: ${alert.alertContent}`) : ["- No keyword alerts"]),
    "",
    "## Top category signals",
    ...(categorySignals.length
      ? categorySignals.map((signal) => `- [${signal.alertLevel}] ${signal.categoryName} ${signal.asin ?? ""}: ${signal.content}`)
      : ["- No category signals"])
  ].join("\n");
}

export function buildFeishuNotificationContent(store: Store, date: string, summary?: DashboardSummary, excelUrl = buildReportExcelDownloadUrl(date)): string {
  const content = buildNotificationContent(store, date, summary);
  return [
    content,
    "",
    "## Excel report",
    excelUrl
      ? `Download: ${excelUrl}`
      : "Excel download link is not configured. Set PUBLIC_BASE_URL to let Feishu messages include the .xlsx report link."
  ].join("\n");
}

export function buildReportExcelDownloadUrl(date: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const baseUrl = cleanEnvValue(env.PUBLIC_BASE_URL);
  if (!baseUrl) {
    return null;
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/api/reports/daily.xlsx?date=${encodeURIComponent(date)}`;
}

export function buildNotificationSummaryHtmlContent(store: Store, date: string, summary?: DashboardSummary): string {
  const dashSummary = summary ?? store.getDashboardSummary(date);
  const alerts = store.listAlerts({ date, limit: 5 });
  const categorySignals = store.listCategorySignals({ date, limit: 5 });
  const rows = [
    ["启用关键词", dashSummary.activeKeywordCount],
    ["启用类目", dashSummary.activeCategoryCount],
    ["关键词快照 ASIN", dashSummary.todaySnapshotCount],
    ["类目榜单 ASIN", dashSummary.categorySnapshotCount],
    ["竞品池 ASIN", dashSummary.competitorCount],
    ["关键词告警", dashSummary.alertCount],
    ["类目信号", dashSummary.categorySignalCount]
  ];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Amazon Monitor Daily Report ${escapeHtml(date)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f1;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#20211f;">
  <div style="max-width:760px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #dddfd7;border-radius:8px;overflow:hidden;">
      <div style="padding:22px 24px;background:#20211f;color:#f7f7f1;">
        <div style="font-size:12px;letter-spacing:.08em;color:#99f6e4;text-transform:uppercase;">Amazon Competitive Intelligence</div>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">每日监控报告</h1>
        <div style="margin-top:6px;font-size:13px;color:#c9cdc4;">报告日期：${escapeHtml(date)}</div>
      </div>
      <div style="padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:14px;line-height:1.7;">
          本次邮件正文只保留摘要，完整数据已整理为 Excel 附件：
          <strong>amazon-monitor-${escapeHtml(date)}.xlsx</strong>。
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0 18px;">
          <tbody>
            ${rows
              .map(
                ([label, value]) =>
                  `<tr><td style="padding:10px;border-bottom:1px solid #e2e4dd;color:#686c63;">${escapeHtml(String(label))}</td><td style="padding:10px;border-bottom:1px solid #e2e4dd;text-align:right;font-weight:700;">${escapeHtml(String(value))}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
        <h2 style="margin:18px 0 8px;font-size:15px;">重点关键词告警</h2>
        <ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            alerts.length
              ? alerts.map((alert) => `<li>[${escapeHtml(alert.alertLevel)}] ${escapeHtml(alert.keyword)} ${escapeHtml(alert.asin)}：${escapeHtml(alert.alertContent)}</li>`).join("")
              : "<li>暂无关键词告警</li>"
          }
        </ul>
        <h2 style="margin:18px 0 8px;font-size:15px;">重点类目信号</h2>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            categorySignals.length
              ? categorySignals
                  .map((signal) => `<li>[${escapeHtml(signal.alertLevel)}] ${escapeHtml(signal.categoryName)} ${escapeHtml(signal.asin ?? "")}：${escapeHtml(signal.content)}</li>`)
                  .join("")
              : "<li>暂无类目信号</li>"
          }
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(
  schedule: NotificationSchedule,
  date: string,
  content: string,
  htmlContent?: string,
  attachments?: NotificationAttachment[]
): Promise<{ message: string }> {
  loadEnv(); // 动态重新加载 .env 配置文件，支持免重启热重载配置
  const config = resolveSmtpConfig();

  if (!config.host || !config.from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST and SMTP_FROM or SMTP_USER.");
  }

  const errors: Array<{ error: unknown; config: ResolvedSmtpConfig }> = [];
  try {
    return await sendEmailWithConfig(config, schedule, date, content, htmlContent, attachments);
  } catch (error) {
    errors.push({ error, config });
  }

  const fallbackConfig = resolveSmtpFallbackConfig(config);
  if (fallbackConfig && isSmtpNetworkTimeout(errors[0].error)) {
    try {
      return await sendEmailWithConfig(fallbackConfig, schedule, date, content, htmlContent, attachments);
    } catch (error) {
      errors.push({ error, config: fallbackConfig });
    }
  }

  throw new Error(buildSmtpErrorMessage(errors));
}

async function sendEmailWithConfig(
  config: ResolvedSmtpConfig,
  schedule: NotificationSchedule,
  date: string,
  content: string,
  htmlContent?: string,
  attachments?: NotificationAttachment[]
): Promise<{ message: string }> {
  try {
    const transporter = nodemailer.createTransport(config.transport);
    const info = await transporter.sendMail({
      from: config.from,
      to: schedule.target,
      subject: `Amazon Monitor Daily Report ${date}`,
      text: content,
      html: htmlContent ?? `<pre style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap;">${escapeHtml(content)}</pre>`,
      attachments: attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }))
    });

    return { message: `Email sent: ${info.messageId ?? "accepted"}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("EAUTH") || msg.includes("Invalid login")) {
      throw new Error(`SMTP 认证失败：授权密码错误或已过期，请检查 .env 中的 SMTP_PASS 配置。原始错误: ${msg}`);
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      throw new Error(`SMTP 连接失败：无法连接到邮件服务器 ${config.host}:${config.port}，请检查 SMTP_HOST 和 SMTP_PORT 配置以及网络连接。原始错误: ${msg}`);
    }
    if (msg.includes("ETIMEDOUT")) {
      throw new Error(`SMTP 连接超时：连接到 ${config.host}:${config.port} 超时，可能是防火墙拦截了该端口。原始错误: ${msg}`);
    }
    throw new Error(`邮件发送失败: ${msg}`);
  }
}

interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  from: string | undefined;
  proxy: string | undefined;
  transport: SMTPTransport.Options & { proxy?: string };
}

export function resolveSmtpConfig(env: NodeJS.ProcessEnv = process.env): ResolvedSmtpConfig {
  const host = env.SMTP_HOST?.trim() ?? "";
  const port = numberEnv(env.SMTP_PORT, 587);
  const secure = booleanEnv(env.SMTP_SECURE) ?? port === 465;
  const requireTLS = booleanEnv(env.SMTP_REQUIRE_TLS) ?? (!secure && port === 587);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM ?? user;
  const proxy = resolveSmtpProxy(host, env);
  const timeout = numberEnv(env.SMTP_TIMEOUT_MS, 30000);

  return {
    host,
    port,
    secure,
    requireTLS,
    from,
    proxy,
    transport: {
      host,
      port,
      secure,
      requireTLS,
      auth: user && pass ? { user, pass } : undefined,
      proxy,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      tls: {
        servername: host
      }
    }
  };
}

function resolveSmtpFallbackConfig(config: ResolvedSmtpConfig): ResolvedSmtpConfig | null {
  if (!/gmail\.com$/i.test(config.host) || config.port !== 465 || !config.secure) {
    return null;
  }

  return {
    ...config,
    port: 587,
    secure: false,
    requireTLS: true,
    transport: {
      ...config.transport,
      port: 587,
      secure: false,
      requireTLS: true
    }
  };
}

function resolveSmtpProxy(host: string, env: NodeJS.ProcessEnv): string | undefined {
  const explicitProxy = cleanEnvValue(env.SMTP_PROXY);
  if (explicitProxy) {
    return /^(false|none|direct)$/i.test(explicitProxy) ? undefined : explicitProxy;
  }

  if (!/gmail\.com$/i.test(host)) {
    return undefined;
  }

  return cleanEnvValue(env.HTTPS_PROXY) ?? cleanEnvValue(env.HTTP_PROXY) ?? cleanEnvValue(env.https_proxy) ?? cleanEnvValue(env.http_proxy);
}

function buildSmtpErrorMessage(attempts: Array<{ error: unknown; config: ResolvedSmtpConfig }>): string {
  const first = attempts[0];
  const details = attempts.map(({ error, config }) => {
    const message = error instanceof Error ? error.message : String(error);
    const mode = config.secure ? "SSL/TLS" : config.requireTLS ? "STARTTLS" : "plain";
    const proxyHint = config.proxy ? `proxy=${maskProxy(config.proxy)}` : "proxy=off";
    return `server=${config.host}:${config.port}, mode=${mode}, ${proxyHint}, error=${message}`;
  });
  const hasNetworkTimeout = attempts.some(({ error }) => isSmtpNetworkTimeout(error));
  const isGmail = attempts.some(({ config }) => /gmail\.com$/i.test(config.host));
  const usesProxy = attempts.some(({ config }) => Boolean(config.proxy));
  const prefix = `SMTP send failed: ${first ? errorMessage(first.error) : "unknown error"}`;
  const hint: string[] = [`attempts=[${details.join(" | ")}]`];

  if (hasNetworkTimeout && isGmail && usesProxy) {
    hint.push(
      "Gmail SMTP is not responding through the current proxy before login/authentication.",
      "Use a reachable SMTP provider such as QQ/163/enterprise mail, or change the proxy rule to allow smtp.gmail.com ports 465/587."
    );
  } else if (hasNetworkTimeout) {
    hint.push("Check SMTP_PORT/SMTP_SECURE first: 465 needs SMTP_SECURE=true; 587 usually needs SMTP_SECURE=false and STARTTLS.");
  }

  return [prefix, ...hint].join(" | ");
}

function isSmtpNetworkTimeout(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  return /secure TLS connection|greeting|timeout|ETIMEDOUT|ECONNRESET|ESOCKET/i.test(`${code} ${errorMessage(error)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^(1|true|yes|on)$/i.test(value.trim())) return true;
  if (/^(0|false|no|off)$/i.test(value.trim())) return false;
  return undefined;
}

function cleanEnvValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function maskProxy(value: string): string {
  return value.replace(/(\/\/)([^:@/]+):([^@/]+)@/, "$1***:***@");
}

async function sendFeishu(schedule: NotificationSchedule, content: string): Promise<{ message: string }> {
  if (!/^https:\/\/.+/i.test(schedule.target)) {
    throw new Error("Feishu target must be a webhook URL.");
  }

  const response = await fetch(schedule.target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: content.slice(0, 18000)
      }
    })
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Feishu webhook failed with HTTP ${response.status}: ${bodyText}`);
  }

  const parsed = safeJson(bodyText);
  const success =
    parsed === null ||
    parsed.code === 0 ||
    parsed.StatusCode === 0 ||
    parsed.status_code === 0 ||
    /success/i.test(String(parsed.StatusMessage ?? parsed.msg ?? ""));
  if (!success) {
    throw new Error(`Feishu webhook returned failure: ${bodyText}`);
  }

  return { message: "Feishu webhook sent" };
}

function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatLocalTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.hour}:${value.minute}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
