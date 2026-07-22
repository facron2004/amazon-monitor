export type CompetitorSourceFilter = "all" | "keyword" | "category" | "hybrid" | "manual";
export type CompetitorTierFilter = "all" | "core" | "rising" | "activity" | "watch";

export const competitorSourceOptions: Array<{ value: CompetitorSourceFilter; label: string }> = [
  { value: "all", label: "全部来源" },
  { value: "category", label: "类目榜单" },
  { value: "keyword", label: "关键词" },
  { value: "hybrid", label: "混合" },
  { value: "manual", label: "手动添加" }
];

export const competitorTierOptions: Array<{ value: CompetitorTierFilter; label: string }> = [
  { value: "all", label: "全部分层" },
  { value: "core", label: "核心" },
  { value: "rising", label: "上升" },
  { value: "activity", label: "活动" },
  { value: "watch", label: "观察" }
];
