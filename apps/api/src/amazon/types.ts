import type { SerpProductInput } from "@amazon-monitor/shared";
import type { AbortableCollectOptions } from "./abort.js";

export interface CollectedSearchPage {
  pageNo: number;
  products: SerpProductInput[];
  url: string;
}

export interface AmazonSearchCollector {
  collect(keyword: import("@amazon-monitor/shared").KeywordMonitor, date: string, options?: AbortableCollectOptions): Promise<CollectedSearchPage[]>;
}
