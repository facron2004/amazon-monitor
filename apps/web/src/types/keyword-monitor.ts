import type { KeywordMonitorInput } from "@amazon-monitor/shared";

export interface KeywordMonitorForm {
  keyword: KeywordMonitorInput["keyword"];
  marketplace: KeywordMonitorInput["marketplace"];
  priority: NonNullable<KeywordMonitorInput["priority"]>;
  zipCode: NonNullable<KeywordMonitorInput["zipCode"]>;
  language: NonNullable<KeywordMonitorInput["language"]>;
  categoryTag: NonNullable<KeywordMonitorInput["categoryTag"]>;
  crawlPages: NonNullable<KeywordMonitorInput["crawlPages"]>;
  status: NonNullable<KeywordMonitorInput["status"]>;
}
