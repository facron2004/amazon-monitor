import {
  BarChart3,
  Bell,
  BookOpen,
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
  | "tasks"
  | "sops"
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
  { key: "inventory", label: "Inventory", icon: Warehouse },
  { key: "profit", label: "Profit", icon: DollarSign },
  { key: "listing-health", label: "Listing Health", icon: ClipboardCheck },
  { key: "ads", label: "Ads Workflow", icon: Megaphone },
  { key: "review-voc", label: "Review VOC", icon: MessageSquare },
  { key: "action-center", label: "运营行动中心", icon: ListChecks },
  { key: "tasks", label: "任务", icon: ClipboardList },
  { key: "sops", label: "SOP 知识库", icon: BookOpen },
  { key: "alerts", label: "预警", icon: Bell },
  { key: "notifications", label: "通知", icon: Send },
  { key: "reports", label: "报告", icon: FileText },
  { key: "logs", label: "日志", icon: FileText }
];
