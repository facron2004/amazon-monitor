import type {
  CollectJob,
  DailyReportCoverage,
  DailyReportCoverageFeedKey,
  DailyReportReadiness,
  DailyReportReadinessItem,
  DataSourceConfig,
  DataSourceType
} from "@amazon-monitor/shared";
import { collectDailyWorkflowReportCoverage, resolveDailyReportCoverageStatus } from "./daily-workflow-report.js";
import type { Store } from "../store.js";

interface ReadinessInput {
  date: string;
  orgId: number;
}

interface FeedDefinition {
  feed: DailyReportCoverageFeedKey;
  label: string;
  sourceTypes: DataSourceType[];
  sourceLabel: string;
  collectionTaskType?: CollectJob["taskType"];
}

const feedDefinitions: FeedDefinition[] = [
  {
    feed: "ownSkuMetrics",
    label: "自营 SKU 指标",
    sourceTypes: ["amazon_sp_api"],
    sourceLabel: "Amazon SP-API"
  },
  {
    feed: "keywordSnapshots",
    label: "关键词快照",
    sourceTypes: ["public_crawler"],
    sourceLabel: "公开采集",
    collectionTaskType: "keyword"
  },
  {
    feed: "categorySnapshots",
    label: "类目快照",
    sourceTypes: ["public_crawler"],
    sourceLabel: "公开采集",
    collectionTaskType: "category"
  },
  {
    feed: "adsMetrics",
    label: "广告指标",
    sourceTypes: ["amazon_ads_api"],
    sourceLabel: "Amazon Ads API"
  },
  {
    feed: "inventoryPlans",
    label: "库存计划",
    sourceTypes: ["erp_wms"],
    sourceLabel: "ERP / WMS"
  }
];

export function buildDailyReportReadiness(store: Store, input: ReadinessInput): DailyReportReadiness {
  const archive = store.getDailyReportArchive(input.orgId, input.date);
  const coverage = archive?.coverage ?? collectDailyWorkflowReportCoverage(store, input);
  const sources = store.listDataSources({ orgId: input.orgId, limit: 1000 });
  const jobs = store.listJobs(1000, 0, input.orgId).filter((job) => job.date === input.date);
  const items = feedDefinitions.map((definition) => buildReadinessItem(definition, coverage, sources, jobs));

  return {
    reportDate: input.date,
    archiveGenerated: archive !== null,
    coverageStatus: archive?.coverageStatus ?? resolveDailyReportCoverageStatus(coverage),
    gapsCount: items.filter((item) => item.state !== "ready").length,
    items
  };
}

function buildReadinessItem(
  definition: FeedDefinition,
  coverage: DailyReportCoverage,
  allSources: DataSourceConfig[],
  jobs: CollectJob[]
): DailyReportReadinessItem {
  const count = coverage[definition.feed];
  const sources = allSources
    .filter((source) => definition.sourceTypes.includes(source.sourceType))
    .map(toReadinessSource);
  const sourceNeedsAttention = sources.some((source) => (
    source.status !== "connected" || source.syncStatus !== "success"
  ));
  const matchingJobs = definition.collectionTaskType
    ? jobs.filter((job) => job.taskType === definition.collectionTaskType)
    : [];
  const failedJobs = matchingJobs.filter((job) => job.status === "failed");

  if (count > 0 && !sourceNeedsAttention) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "ready",
      message: `日报已记录 ${count} 条${definition.label}。`,
      sources,
      action: defaultAction(definition)
    };
  }

  if (count > 0) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "attention",
      message: `日报已记录 ${count} 条，但当前${definition.sourceLabel}连接需要处理。`,
      sources,
      action: { target: "data-sources", label: "检查连接" }
    };
  }

  if (failedJobs.length > 0) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "attention",
      message: `当日有 ${failedJobs.length} 个${definition.label}采集任务失败，请先查看失败证据。`,
      sources,
      action: { target: "collectors", label: "处理失败采集" }
    };
  }

  if (sources.length === 0) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "missing",
      message: `未配置${definition.sourceLabel}，无法补齐${definition.label}。`,
      sources,
      action: { target: "data-sources", label: "配置数据源" }
    };
  }

  if (sourceNeedsAttention) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "attention",
      message: `${definition.sourceLabel}当前未处于可用同步状态。`,
      sources,
      action: { target: "data-sources", label: "检查连接" }
    };
  }

  if (definition.collectionTaskType) {
    return {
      feed: definition.feed,
      label: definition.label,
      count,
      state: "missing",
      message: `数据源已就绪，但当日尚未产出${definition.label}。`,
      sources,
      action: { target: "collectors", label: "运行采集" }
    };
  }

  return {
    feed: definition.feed,
    label: definition.label,
    count,
    state: "missing",
    message: `${definition.sourceLabel}已配置，但当日尚未同步${definition.label}。`,
    sources,
    action: { target: "data-sources", label: "检查同步" }
  };
}

function toReadinessSource(source: DataSourceConfig) {
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
    status: source.status,
    syncStatus: source.syncStatus,
    lastSuccessAt: source.lastSuccessAt
  };
}

function defaultAction(definition: FeedDefinition): DailyReportReadinessItem["action"] {
  return definition.collectionTaskType
    ? { target: "collectors", label: "查看采集" }
    : { target: "data-sources", label: "查看数据源" };
}
