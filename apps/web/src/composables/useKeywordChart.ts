import { nextTick, shallowRef } from "vue";
import type { SerpSnapshot } from "@amazon-monitor/shared";
import { buildKeywordChartOption } from "../utils/keywordChartOptions";

type ChartInstance = {
  setOption(option: unknown): void;
  resize(): void;
  dispose(): void;
};

type EchartsFactory = {
  initKeywordChart(element: HTMLDivElement): ChartInstance;
};

export function useKeywordChart() {
  const chartElement = shallowRef<HTMLDivElement | null>(null);
  let chart: ChartInstance | null = null;
  let echartsReady: Promise<EchartsFactory> | null = null;

  function setChartElement(element: HTMLDivElement | null) {
    if (chartElement.value === element) {
      return;
    }
    chart?.dispose();
    chart = null;
    chartElement.value = element;
  }

  async function renderKeywordChart(snapshots: SerpSnapshot[] | null | undefined) {
    await nextTick();
    const element = chartElement.value;
    if (!element || !snapshots) {
      return;
    }
    if (!chart) {
      const echarts = await loadEcharts();
      if (chartElement.value !== element) {
        return;
      }
      chart ??= echarts.initKeywordChart(element);
    }
    chart.setOption(buildKeywordChartOption(snapshots));
  }

  function resizeKeywordChart() {
    chart?.resize();
  }

  function disposeKeywordChart() {
    chart?.dispose();
    chart = null;
    chartElement.value = null;
  }

  async function loadEcharts(): Promise<EchartsFactory> {
    echartsReady ??= import("../utils/keywordChartRuntime");
    return echartsReady;
  }

  return {
    setChartElement,
    renderKeywordChart,
    resizeKeywordChart,
    disposeKeywordChart
  };
}
