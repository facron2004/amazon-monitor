import type { CompetitorActivityEvent } from "@amazon-monitor/shared";

export type ActivityEventFilter = "all" | CompetitorActivityEvent["eventType"];

export interface ActivityEventOption {
  eventType: CompetitorActivityEvent["eventType"];
  label: string;
}
