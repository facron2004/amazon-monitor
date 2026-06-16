import type { CategoryMonitorInput } from "@amazon-monitor/shared";

export interface CategoryMonitorForm {
  name: CategoryMonitorInput["name"];
  marketplace: CategoryMonitorInput["marketplace"];
  categoryUrl: CategoryMonitorInput["categoryUrl"];
  categoryPath: NonNullable<CategoryMonitorInput["categoryPath"]>;
  crawlTopN: NonNullable<CategoryMonitorInput["crawlTopN"]>;
  status: NonNullable<CategoryMonitorInput["status"]>;
}
