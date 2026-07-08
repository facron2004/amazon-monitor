import type { AsinGroupedView } from "../stores/insightEvents";

export interface ActionAsinCaseSummary {
  caseCount: number;
  eventCount: number;
  p0CaseCount: number;
  multiEventCaseCount: number;
  multiEventPercent: number;
  coreCaseCount: number;
  corePercent: number;
  totalScore: number;
  averageScore: number;
}

export function buildActionAsinCaseSummary(groups: AsinGroupedView[]): ActionAsinCaseSummary {
  const caseCount = groups.length;
  const eventCount = groups.reduce((sum, group) => sum + group.events.length, 0);
  const totalScore = groups.reduce((sum, group) => sum + group.scoreTotal, 0);
  const multiEventCaseCount = groups.filter((group) => group.events.length > 1).length;
  const coreCaseCount = groups.filter(isCoreCase).length;

  return {
    caseCount,
    eventCount,
    p0CaseCount: groups.filter((group) => group.topLevel === "P0").length,
    multiEventCaseCount,
    multiEventPercent: percent(multiEventCaseCount, caseCount),
    coreCaseCount,
    corePercent: percent(coreCaseCount, caseCount),
    totalScore,
    averageScore: caseCount > 0 ? Math.round(totalScore / caseCount) : 0
  };
}

function isCoreCase(group: AsinGroupedView): boolean {
  return group.watchLevel === "CORE" || group.events.some((event) => event.evidence.isCoreCompetitor === true);
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
