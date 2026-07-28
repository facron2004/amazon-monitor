import { request } from "./api-base.js";
import type {
  Sop,
  SopListResponse,
  SopStatus,
} from "@amazon-monitor/shared";

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

export interface SopListParams {
  status?: SopStatus;
  category?: Sop["category"];
  q?: string;
  limit?: number;
  offset?: number;
}

function buildSopSearch(params: SopListParams): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  return search.toString();
}

export function listSops(params: SopListParams = {}): Promise<Sop[]> {
  const qs = buildSopSearch(params);
  return request<Sop[]>(`/api/sops${qs ? `?${qs}` : ""}`);
}

export function listSopPage(
  params: SopListParams = {},
): Promise<SopListResponse> {
  const qs = buildSopSearch(params);
  return request<SopListResponse>(`/api/sops/page${qs ? `?${qs}` : ""}`);
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
