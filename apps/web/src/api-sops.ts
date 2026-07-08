import { request } from "./api-base.js";
import type { Sop, SopStatus } from "@amazon-monitor/shared";

export interface CreateSopInput {
  title: string;
  category: Sop["category"];
  bodyMd: string;
  sourceTaskId?: number | null;
  tags?: string[];
}

export interface UpdateSopInput {
  title?: string;
  bodyMd?: string;
  category?: Sop["category"];
  status?: SopStatus;
  tags?: string[];
}

export function listSops(params: { status?: SopStatus; category?: Sop["category"]; q?: string } = {}): Promise<Sop[]> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return request<Sop[]>(`/api/sops${qs ? `?${qs}` : ""}`);
}

export function getSop(id: number): Promise<Sop> {
  return request<Sop>(`/api/sops/${id}`);
}

export function createSop(input: CreateSopInput): Promise<Sop> {
  return request<Sop>("/api/sops", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateSop(id: number, input: UpdateSopInput): Promise<Sop> {
  return request<Sop>(`/api/sops/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function publishSop(id: number): Promise<Sop> {
  return request<Sop>(`/api/sops/${id}/publish`, { method: "POST" });
}

export function archiveSop(id: number): Promise<Sop> {
  return request<Sop>(`/api/sops/${id}/archive`, { method: "POST" });
}
