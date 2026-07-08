export const DEFAULT_WEB_TIME_ZONE = "Asia/Shanghai";

/**
 * Format an ISO timestamp (UTC, e.g. "2026-06-25T02:16:08.461Z") in the
 * web app's default timezone. Returns "-" for null or invalid input.
 *
 * Why: the backend stores timestamps as UTC ISO, but the UI should present
 * them in the business timezone used by operators. Rendering UTC directly
 * makes times look 8 hours earlier than expected.
 */
export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DEFAULT_WEB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\//g, "-");
}

export function formatWebTimezoneLabel(timezone: string | null | undefined): string {
  if (!timezone) return DEFAULT_WEB_TIME_ZONE;
  if (timezone === "UTC" || timezone === "Etc/UTC" || timezone === "Z") return DEFAULT_WEB_TIME_ZONE;
  return timezone;
}