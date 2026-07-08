import type { SessionContext } from "@amazon-monitor/shared";
import { request } from "./api-base";

export interface LoginResponse {
  token: string;
  expiresAt: string;
  context: SessionContext;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function registerBootstrapAdmin(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/register-first-user", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

function sessionHeaders(token?: string | null): Record<string, string> | undefined {
  return token ? { "x-amazon-monitor-session": token } : undefined;
}

export async function logout(token?: string | null): Promise<void> {
  await request<void>("/api/auth/logout", {
    method: "POST",
    headers: sessionHeaders(token)
  });
}

export async function fetchMe(token?: string | null): Promise<SessionContext> {
  return request<SessionContext>("/api/auth/me", {
    headers: sessionHeaders(token)
  });
}
