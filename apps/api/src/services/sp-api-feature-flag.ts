/**
 * The connector is opt-in. Keep this check shared by HTTP, scheduler, and
 * Worker paths so a disabled production connector cannot be bypassed by a
 * previously queued or periodic job.
 */
export function isSpApiConnectorEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(environment.SP_API_CONNECTOR_ENABLED ?? "").trim().toLowerCase() === "true";
}
