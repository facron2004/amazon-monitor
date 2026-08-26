import { applyEvidenceGate, assessDataQuality, type DataQualityReport, type DataQualitySourceCheck } from "@amazon-monitor/agent";
import type {
  CollectionFreshness,
  DataSourceConfig,
  DataSourceDomainHealth,
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";

export interface DataQualityMappingCount {
  dataSourceId: number;
  openCount: number;
}

export interface DataQualityAdapterInput {
  checkedAt: string;
  collectionFreshness: readonly CollectionFreshness[];
  dataSources: readonly DataSourceConfig[];
  domainHealth?: readonly DataSourceDomainHealth[];
  mappingIssues?: readonly DataQualityMappingCount[];
  maxAgeHours?: number;
}

export interface AgentOsDataQualityEvidence {
  checkedAt: string;
  sourceChecks: readonly DataQualitySourceCheck[];
  report: DataQualityReport;
  evidenceGate: ReturnType<typeof applyEvidenceGate>;
  refreshRequired: boolean;
  evidenceRefs: readonly {
    id: string;
    source: string;
    status: DataQualityReport["status"];
    observedAt: string;
  }[];
}

export function collectCurrentDataQualityEvidence(
  store: Store,
  organizationId: number,
  checkedAt = new Date().toISOString(),
  maxAgeHours = 24,
): AgentOsDataQualityEvidence {
  const dataSources = store.listDataSources({ orgId: organizationId, limit: 1000 });
  const domainHealth = dataSources.flatMap((dataSource) => (
    store.listDataSourceDomainHealth(dataSource.id, organizationId)
  ));
  const mappingIssues = dataSources.map((dataSource) => ({
    dataSourceId: dataSource.id,
    openCount: store.countOpenDataSourceMappingIssues(dataSource.id, organizationId),
  }));
  return buildDataQualityEvidence({
    checkedAt,
    maxAgeHours,
    collectionFreshness: store.getCollectionFreshness(organizationId),
    dataSources,
    domainHealth,
    mappingIssues,
  });
}

export function buildDataQualityEvidence(input: DataQualityAdapterInput): AgentOsDataQualityEvidence {
  const maxAgeHours = input.maxAgeHours ?? 24;
  const sourceChecks = buildSourceChecks(input, maxAgeHours);
  const report = assessDataQuality(sourceChecks, input.checkedAt);
  const evidenceGate = applyEvidenceGate(report);
  return {
    checkedAt: input.checkedAt,
    sourceChecks,
    report,
    evidenceGate,
    refreshRequired: report.refreshRequired,
    evidenceRefs: sourceChecks.map((check) => ({
      id: `data-quality:${check.source}:${input.checkedAt}`,
      source: check.source,
      status: report.status,
      observedAt: input.checkedAt,
    })),
  };
}

function buildSourceChecks(
  input: DataQualityAdapterInput,
  maxAgeHours: number,
): DataQualitySourceCheck[] {
  const checks: DataQualitySourceCheck[] = [];
  const mappingCounts = new Map((input.mappingIssues ?? []).map((item) => [item.dataSourceId, item.openCount]));
  const freshnessByType = new Map(input.collectionFreshness.map((item) => [item.taskType, item]));

  for (const source of input.dataSources) {
    const freshness = freshnessByType.get(source.sourceType === "amazon_sp_api" ? "category" : "keyword");
    const lastObserved = freshness?.lastCompletedAt ?? source.lastSuccessAt ?? source.lastSyncedAt;
    checks.push({
      source: `data-source:${source.id}:${source.name}`,
      ageHours: ageHoursBetween(input.checkedAt, lastObserved),
      maxAgeHours,
      completeness: source.syncStatus === "partial" ? 0.75 : source.syncStatus === "failed" ? 0 : 1,
      collectionStatus: collectionStatus(freshness?.lastStatus, source.syncStatus),
      mapped: (mappingCounts.get(source.id) ?? 0) === 0,
      apiError: source.syncError,
    });
  }

  for (const freshness of input.collectionFreshness) {
    checks.push({
      source: `collector:${freshness.taskType}`,
      ageHours: ageHoursBetween(input.checkedAt, freshness.lastCompletedAt ?? freshness.lastSyncedAt),
      maxAgeHours,
      completeness: freshness.totalJobs > 0
        ? Math.max(0, 1 - freshness.failedJobs / freshness.totalJobs)
        : 0,
      collectionStatus: collectionStatus(freshness.lastStatus, freshness.syncStatus),
      mapped: true,
      apiError: freshness.syncError,
    });
  }

  for (const health of input.domainHealth ?? []) {
    checks.push({
      source: `domain:${health.dataSourceId}:${health.domain}:${health.marketplace}`,
      ageHours: ageHoursBetween(input.checkedAt, health.lastSuccessAt ?? health.sourceTime ?? health.lastAttemptAt),
      maxAgeHours,
      completeness: health.status === "partial" ? 0.75 : health.status === "failed" ? 0 : 1,
      collectionStatus: health.status === "success" ? "success" : health.status === "pending" ? "running" : health.status === "failed" ? "failed" : "partial",
      mapped: true,
      apiError: health.errorMessage ?? health.errorCode,
    });
  }
  return checks;
}

function collectionStatus(
  lastStatus: CollectionFreshness["lastStatus"] | undefined,
  syncStatus: CollectionFreshness["syncStatus"] | DataSourceConfig["syncStatus"] | undefined,
): DataQualitySourceCheck["collectionStatus"] {
  if (lastStatus === "failed" || syncStatus === "failed") return "failed";
  if (lastStatus === "processing" || lastStatus === "pending" || syncStatus === "pending") return "running";
  if (lastStatus === "completed" || syncStatus === "success" || syncStatus === "manual") return "success";
  if (syncStatus === "partial") return "partial";
  return "missing";
}

function ageHoursBetween(checkedAt: string, observedAt: string | null | undefined): number | null {
  if (!observedAt) return null;
  const difference = Date.parse(checkedAt) - Date.parse(observedAt);
  if (!Number.isFinite(difference)) return null;
  return Math.max(0, difference / 3_600_000);
}
