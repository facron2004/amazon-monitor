import type { DatabaseSync } from "node:sqlite";
import type {
  DailyReportArchive,
  DailyReportCoverage,
  PeriodReportArchive,
  PeriodReportCoverage,
  WorkflowReportPeriod
} from "@amazon-monitor/shared";
import { clampLimit, clampOffset, nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";

type ReportStoreMethods = Pick<
  Store,
  | "saveDailyReportArchive"
  | "getDailyReportArchive"
  | "listDailyReportArchives"
  | "countDailyReportArchives"
  | "savePeriodReportArchive"
  | "getPeriodReportArchive"
  | "listPeriodReportArchives"
  | "countPeriodReportArchives"
>;

interface DailyReportArchiveRow {
  id: number;
  org_id: number;
  report_date: string;
  markdown: string;
  coverage_status: DailyReportArchive["coverageStatus"];
  coverage_json: string;
  signal_count: number;
  risk_count: number;
  task_count: number;
  version: number;
  generated_by: number | null;
  generated_by_name: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

interface PeriodReportArchiveRow {
  id: number;
  org_id: number;
  period: WorkflowReportPeriod;
  start_date: string;
  end_date: string;
  markdown: string;
  coverage_status: PeriodReportArchive["coverageStatus"];
  coverage_json: string;
  sales_marketplace_count: number;
  insight_count: number;
  completed_task_count: number;
  version: number;
  generated_by: number | null;
  generated_by_name: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

const reportSelect = `
  SELECT reports.*, users.display_name AS generated_by_name
  FROM workflow_daily_reports reports
  LEFT JOIN users ON users.id = reports.generated_by
`;

const periodReportSelect = `
  SELECT reports.*, users.display_name AS generated_by_name
  FROM workflow_period_reports reports
  LEFT JOIN users ON users.id = reports.generated_by
`;

export function createReportStore(db: DatabaseSync): ReportStoreMethods {
  return {
    saveDailyReportArchive(input) {
      const timestamp = nowIso();
      db.prepare(
        `INSERT INTO workflow_daily_reports
         (org_id, report_date, markdown, coverage_status, coverage_json, signal_count, risk_count,
          task_count, version, generated_by, generated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(org_id, report_date) DO UPDATE SET
           markdown = excluded.markdown,
           coverage_status = excluded.coverage_status,
           coverage_json = excluded.coverage_json,
           signal_count = excluded.signal_count,
           risk_count = excluded.risk_count,
           task_count = excluded.task_count,
           version = workflow_daily_reports.version + 1,
           generated_by = excluded.generated_by,
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`
      ).run(
        input.orgId,
        input.reportDate,
        input.markdown,
        input.coverageStatus,
        JSON.stringify(input.coverage),
        input.signalCount,
        input.riskCount,
        input.taskCount,
        input.generatedBy,
        timestamp,
        timestamp,
        timestamp
      );
      return getReport(db, input.orgId, input.reportDate);
    },

    getDailyReportArchive(orgId, reportDate) {
      return getOptionalReport(db, orgId, reportDate);
    },

    listDailyReportArchives(filter) {
      const limit = clampLimit(filter.limit) || 50;
      const offset = clampOffset(filter.offset);
      return (
        db.prepare(
          `${reportSelect}
           WHERE reports.org_id = ?
           ORDER BY reports.report_date DESC, reports.updated_at DESC
           LIMIT ? OFFSET ?`
        ).all(filter.orgId, limit, offset) as unknown as DailyReportArchiveRow[]
      ).map(mapDailyReportArchive);
    },

    countDailyReportArchives(orgId) {
      const row = db.prepare("SELECT COUNT(*) AS count FROM workflow_daily_reports WHERE org_id = ?").get(orgId) as {
        count: number;
      };
      return row.count;
    },

    savePeriodReportArchive(input) {
      const timestamp = nowIso();
      db.prepare(
        `INSERT INTO workflow_period_reports
         (org_id, period, start_date, end_date, markdown, coverage_status, coverage_json,
          sales_marketplace_count, insight_count, completed_task_count, version, generated_by,
          generated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(org_id, period, end_date) DO UPDATE SET
           start_date = excluded.start_date,
           markdown = excluded.markdown,
           coverage_status = excluded.coverage_status,
           coverage_json = excluded.coverage_json,
           sales_marketplace_count = excluded.sales_marketplace_count,
           insight_count = excluded.insight_count,
           completed_task_count = excluded.completed_task_count,
           version = workflow_period_reports.version + 1,
           generated_by = excluded.generated_by,
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`
      ).run(
        input.orgId,
        input.period,
        input.startDate,
        input.endDate,
        input.markdown,
        input.coverageStatus,
        JSON.stringify(input.coverage),
        input.salesMarketplaceCount,
        input.insightCount,
        input.completedTaskCount,
        input.generatedBy,
        timestamp,
        timestamp,
        timestamp
      );
      return getPeriodReport(db, input.orgId, input.period, input.endDate);
    },

    getPeriodReportArchive(orgId, period, endDate) {
      return getOptionalPeriodReport(db, orgId, period, endDate);
    },

    listPeriodReportArchives(filter) {
      const limit = clampLimit(filter.limit) || 50;
      const offset = clampOffset(filter.offset);
      const periodClause = filter.period ? "AND reports.period = ?" : "";
      const params: Array<number | string> = filter.period
        ? [filter.orgId, filter.period, limit, offset]
        : [filter.orgId, limit, offset];
      return (
        db.prepare(
          `${periodReportSelect}
           WHERE reports.org_id = ? ${periodClause}
           ORDER BY reports.end_date DESC, reports.updated_at DESC
           LIMIT ? OFFSET ?`
        ).all(...params) as unknown as PeriodReportArchiveRow[]
      ).map(mapPeriodReportArchive);
    },

    countPeriodReportArchives(orgId, period) {
      const periodClause = period ? "AND period = ?" : "";
      const params: Array<number | string> = period ? [orgId, period] : [orgId];
      const row = db.prepare(
        `SELECT COUNT(*) AS count FROM workflow_period_reports WHERE org_id = ? ${periodClause}`
      ).get(...params) as { count: number };
      return row.count;
    }
  };
}

function getReport(db: DatabaseSync, orgId: number, reportDate: string): DailyReportArchive {
  const report = getOptionalReport(db, orgId, reportDate);
  if (!report) {
    throw new Error("Daily report archive was not saved");
  }
  return report;
}

function getOptionalReport(db: DatabaseSync, orgId: number, reportDate: string): DailyReportArchive | null {
  const row = db.prepare(
    `${reportSelect} WHERE reports.org_id = ? AND reports.report_date = ?`
  ).get(orgId, reportDate) as DailyReportArchiveRow | undefined;
  return row ? mapDailyReportArchive(row) : null;
}

function getPeriodReport(
  db: DatabaseSync,
  orgId: number,
  period: WorkflowReportPeriod,
  endDate: string
): PeriodReportArchive {
  const report = getOptionalPeriodReport(db, orgId, period, endDate);
  if (!report) {
    throw new Error("Period report archive was not saved");
  }
  return report;
}

function getOptionalPeriodReport(
  db: DatabaseSync,
  orgId: number,
  period: WorkflowReportPeriod,
  endDate: string
): PeriodReportArchive | null {
  const row = db.prepare(
    `${periodReportSelect}
     WHERE reports.org_id = ? AND reports.period = ? AND reports.end_date = ?`
  ).get(orgId, period, endDate) as PeriodReportArchiveRow | undefined;
  return row ? mapPeriodReportArchive(row) : null;
}

function mapDailyReportArchive(row: DailyReportArchiveRow): DailyReportArchive {
  return {
    id: row.id,
    orgId: row.org_id,
    reportDate: row.report_date,
    markdown: row.markdown,
    coverageStatus: row.coverage_status,
    coverage: parseCoverage(row.coverage_json),
    signalCount: row.signal_count,
    riskCount: row.risk_count,
    taskCount: row.task_count,
    version: row.version,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPeriodReportArchive(row: PeriodReportArchiveRow): PeriodReportArchive {
  return {
    id: row.id,
    orgId: row.org_id,
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    markdown: row.markdown,
    coverageStatus: row.coverage_status,
    coverage: parsePeriodCoverage(row.coverage_json),
    salesMarketplaceCount: row.sales_marketplace_count,
    insightCount: row.insight_count,
    completedTaskCount: row.completed_task_count,
    version: row.version,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCoverage(value: string): DailyReportCoverage {
  const fallback: DailyReportCoverage = {
    ownSkuMetrics: 0,
    keywordSnapshots: 0,
    categorySnapshots: 0,
    competitorChanges: 0,
    bsrChanges: 0,
    insightEvents: 0,
    adsMetrics: 0,
    inventoryPlans: 0,
    openTasks: 0
  };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(fallback).map((key) => [key, readNonNegativeNumber(record[key])])
    ) as unknown as DailyReportCoverage;
  } catch {
    return fallback;
  }
}

function parsePeriodCoverage(value: string): PeriodReportCoverage {
  const fallback: PeriodReportCoverage = {
    productMetrics: 0,
    marketplaces: 0,
    insightEvents: 0,
    adsMetrics: 0,
    listingHealthItems: 0,
    reviews: 0,
    completedTasks: 0
  };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(fallback).map((key) => [key, readNonNegativeNumber(record[key])])
    ) as unknown as PeriodReportCoverage;
  } catch {
    return fallback;
  }
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
