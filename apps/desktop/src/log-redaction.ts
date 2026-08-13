/** Remove common credential-shaped values before utility output is persisted. */
export function redactLogMessage(message: string): string {
  return message
    .replace(/(password|api[_-]?key|smtp[_-]?pass)\s*([:=])\s*[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/(authorization)\s*([:=])\s*(?:Bearer\s+)?[^\s,;]+(?:\s+[^\s,;]+)?/gi, "$1$2[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]");
}
