import type {
  CreatePromotionPlanInput,
  PromotionPlanStatus,
  PromotionPlanView,
  PromotionTaskKind,
  Task,
  UpdatePromotionPlanInput
} from "@amazon-monitor/shared";
import { clearRequestCache, request, type RequestOptions } from "./api-base";

export type CreatePromotionPayload = Omit<CreatePromotionPlanInput, "orgId" | "createdBy">;

export interface PromotionListQuery {
  asOf?: string;
  storeId?: number;
  status?: PromotionPlanStatus;
  q?: string;
  limit?: number;
}

export interface PromotionTaskResponse {
  created: boolean;
  plan: PromotionPlanView;
  task: Task;
}

function listQuery(input: PromotionListQuery): string {
  const query = new URLSearchParams();
  if (input.asOf) query.set("asOf", input.asOf);
  if (input.storeId !== undefined) query.set("storeId", String(input.storeId));
  if (input.status) query.set("status", input.status);
  if (input.q) query.set("q", input.q);
  if (input.limit) query.set("limit", String(input.limit));
  const value = query.toString();
  return value ? `?${value}` : "";
}

async function write<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const result = await request<T>(path, { method, body: JSON.stringify(body) });
  clearRequestCache("/promotions");
  return result;
}

export const promotionApi = {
  list: (query: PromotionListQuery, options?: RequestOptions) =>
    request<PromotionPlanView[]>(`/promotions${listQuery(query)}`, options),
  create: (payload: CreatePromotionPayload) => write<PromotionPlanView>("/promotions", "POST", payload),
  update: (id: number, payload: UpdatePromotionPlanInput) =>
    write<PromotionPlanView>(`/promotions/${id}`, "PATCH", payload),
  createTask: (id: number, kind: PromotionTaskKind) =>
    write<PromotionTaskResponse>(`/promotions/${id}/tasks`, "POST", { kind })
};
