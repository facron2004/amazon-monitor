import type { SerpProductInput } from "@amazon-monitor/shared";

export interface CollectedSearchPage {
  pageNo: number;
  products: SerpProductInput[];
  url: string;
}

export interface AmazonSearchCollector {
  collect(keyword: import("@amazon-monitor/shared").KeywordMonitor, date: string): Promise<CollectedSearchPage[]>;
}
