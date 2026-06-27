/**
 * Format an ISO timestamp (UTC, e.g. "2026-06-25T02:16:08.461Z") in the
 * user's local timezone as `YYYY-MM-DD HH:mm:ss`. Returns "-" for null or
 * invalid input.
 *
 * Why: the backend stores everything as UTC ISO, but the user expects to
 * read timestamps in their local clock (Asia/Shanghai in our deployment).
 * Rendering ISO directly produces an 8-hour offset bug. `Intl.DateTimeFormat`
 * picks up the runtime's local zone automatically, so the same code is
 * correct on a dev machine in another region.
 */
export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\//g, "-");
}