import type { SessionContext, User } from "@amazon-monitor/shared";
import { request } from "./api-base";

export interface LoginResponse {
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

export async function logout(): Promise<void> {
  await request<void>("/api/auth/logout", {
    method: "POST"
  });
}

export async function fetchMe(): Promise<SessionContext> {
  return request<SessionContext>("/api/auth/me");
}

export function listUsers(): Promise<User[]> {
  return request<User[]>("/api/users");
}
