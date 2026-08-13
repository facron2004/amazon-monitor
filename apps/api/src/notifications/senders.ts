import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { NotificationSchedule } from "@amazon-monitor/shared";
import type { NotificationAttachment } from "../excel-report.js";
import { booleanEnv, cleanEnvValue, loadEnv, numberEnv } from "./env.js";
import { escapeHtml, safeJson } from "./text-utils.js";

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
      throw new Error(`SMTP 认证失败：授权密码错误或已过期，请检查 SMTP_PASS 环境变量配置。`);
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      throw new Error(`SMTP 连接失败：无法连接到邮件服务器，请检查 SMTP_HOST 和 SMTP_PORT 配置以及网络连接。`);
    }
    if (msg.includes("ETIMEDOUT")) {
      throw new Error(`SMTP 连接超时：可能是防火墙拦截了该端口，请检查网络配置。`);
    }
    throw new Error(`邮件发送失败: ${msg}`);
  }
}

export interface ResolvedSmtpConfig {
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
  const user = cleanEnvValue(env.SMTP_USER);
  const pass = env.SMTP_PASS;
  const from = cleanEnvValue(env.SMTP_FROM) ?? user;
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

function maskProxy(value: string): string {
  return value.replace(/(\/\/)([^:@/]+):([^@/]+)@/, "$1***:***@");
}

const FEISHU_ALLOWED_HOSTS = ["open.feishu.cn", "open.larksuite.com"];

async function sendFeishu(schedule: NotificationSchedule, content: string): Promise<{ message: string }> {
  if (!/^https:\/\/.+/i.test(schedule.target)) {
    throw new Error("Feishu target must be a webhook URL.");
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(schedule.target);
  } catch {
    throw new Error("Feishu target is not a valid URL.");
  }

  if (!FEISHU_ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    throw new Error(`Feishu webhook URL must point to an allowed domain (${FEISHU_ALLOWED_HOSTS.join(", ")}).`);
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
