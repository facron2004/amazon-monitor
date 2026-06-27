import {
  BarChart3,
  Bell,
  ClipboardList,
  Database,
  FileText,
  ListChecks,
  Search,
  Send,
  Tags
} from "@lucide/vue";

export type TabKey = "overview" | "categories" | "keywords" | "competitors" | "action-center" | "alerts" | "reports" | "notifications" | "logs";

export const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", label: "总览", icon: BarChart3 },
  { key: "categories", label: "类目情报", icon: Database },
  { key: "keywords", label: "关键词", icon: Search },
  { key: "competitors", label: "竞品池", icon: Tags },
  { key: "action-center", label: "运营行动中心", icon: ListChecks },
  { key: "alerts", label: "预警", icon: Bell },
  { key: "notifications", label: "通知", icon: Send },
  { key: "reports", label: "报告", icon: FileText },
  { key: "logs", label: "日志", icon: ClipboardList }
];
