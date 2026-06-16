import type { CollectJob } from "@amazon-monitor/shared";
import { request } from "./api-base";

export const collectApi = {
  collectJob: (id: number) => request<CollectJob | null>(`/collect/jobs/${id}`)
};
