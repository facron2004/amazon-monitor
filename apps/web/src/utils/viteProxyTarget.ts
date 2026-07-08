const defaultApiPort = "4000";

export function resolveApiProxyTarget(env: Record<string, string | undefined>): string {
  const apiPort = env.VITE_DEV_API_PORT?.trim() || defaultApiPort;
  return (env.VITE_DEV_API_PROXY_TARGET?.trim() || `http://127.0.0.1:${apiPort}`).replace(/\/+$/, "");
}
