import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Database,
  DollarSign,
  FileText,
  ListChecks,
  Megaphone,
  MessageSquare,
  PackageSearch,
  Search,
  Send,
  SlidersHorizontal,
  Tags,
  Warehouse
} from "@lucide/vue";

export type TabKey =
  | "overview"
  | "categories"
  | "keywords"
  | "competitors"
  | "products"
  | "inventory"
  | "profit"
  | "listing-health"
  | "ads"
  | "review-voc"
  | "action-center"
  | "ai-agents"
  | "tasks"
  | "promotions"
  | "sops"
  | "rules"
  | "data-sources"
  | "alerts"
  | "reports"
  | "notifications"
  | "logs";

export const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", label: "总览", icon: BarChart3 },
  { key: "categories", label: "类目情报", icon: Database },
  { key: "keywords", label: "关键词", icon: Search },
  { key: "competitors", label: "竞品池", icon: Tags },
  { key: "products", label: "自营 SKU", icon: PackageSearch },
  { key: "inventory", label: "库存", icon: Warehouse },
  { key: "profit", label: "利润", icon: DollarSign },
  { key: "listing-health", label: "Listing 健康", icon: ClipboardCheck },
  { key: "ads", label: "广告工作流", icon: Megaphone },
  { key: "review-voc", label: "评论 VOC", icon: MessageSquare },
  { key: "action-center", label: "运营行动中心", icon: ListChecks },
  { key: "ai-agents", label: "Agent 中心", icon: Bot },
  { key: "tasks", label: "任务", icon: ClipboardList },
  { key: "promotions", label: "活动排期", icon: CalendarRange },
  { key: "sops", label: "SOP 知识库", icon: BookOpen },
  { key: "rules", label: "规则中心", icon: SlidersHorizontal },
  { key: "data-sources", label: "数据源", icon: Database },
  { key: "alerts", label: "预警", icon: Bell },
  { key: "notifications", label: "通知", icon: Send },
  { key: "reports", label: "报告", icon: FileText },
  { key: "logs", label: "采集中心", icon: Activity }
];
