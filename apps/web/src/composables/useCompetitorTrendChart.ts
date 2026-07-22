import type { ProductActivityCalendar } from "@amazon-monitor/shared";
import { nextTick, shallowRef } from "vue";
import { buildCompetitorTrendChartOption } from "../utils/competitorTrendChartOptions";
import type { CompetitorTrendChartInstance } from "../utils/competitorTrendChartRuntime";

export function useCompetitorTrendChart() {
  const chartElement = shallowRef<HTMLDivElement | null>(null);
  let chart: CompetitorTrendChartInstance | null = null;

  function setChartElement(element: HTMLDivElement | null): void {
    if (chartElement.value === element) return;
    chart?.dispose();
    chart = null;
    chartElement.value = element;
  }

  async function renderCompetitorTrend(calendar: ProductActivityCalendar): Promise<void> {
    await nextTick();
    const element = chartElement.value;
    if (!element) return;

    if (!chart) {
      const runtime = await import("../utils/competitorTrendChartRuntime");
      if (chartElement.value !== element) return;
      chart = runtime.initCompetitorTrendChart(element);
    }
    chart.setOption(buildCompetitorTrendChartOption(calendar), true);
  }

  function resizeCompetitorTrend(): void {
    chart?.resize();
  }

  function disposeCompetitorTrend(): void {
    chart?.dispose();
    chart = null;
    chartElement.value = null;
  }

  return {
    setChartElement,
    renderCompetitorTrend,
    resizeCompetitorTrend,
    disposeCompetitorTrend
  };
}
