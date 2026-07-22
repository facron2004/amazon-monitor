import type { AlertLog } from "@amazon-monitor/shared";
import { request } from "./api-base";

export const alertApi = {
  alerts: (date: string) => request<AlertLog[]>(`/alerts?date=${date}&limit=200`),
  updateAlertStatus: (id: number, status: AlertLog["status"]) =>
    request<AlertLog>(`/alerts/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    })
};
