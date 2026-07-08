import { nextTick, onBeforeUnmount } from "vue";
import type { ChartInstance } from "../utils/echartsRuntime";

type EchartsRuntime = typeof import("../utils/echartsRuntime");

export interface EchartsChartSpec {
  key: string;
  element: HTMLDivElement | null;
  option: unknown;
}

export function useEchartsCharts() {
  let runtimeReady: Promise<EchartsRuntime> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const charts = new Map<string, ChartInstance>();

  async function renderChartSpecs(specsFactory: () => EchartsChartSpec[], canRender: () => boolean): Promise<void> {
    await nextTick();
    if (!canRender()) {
      disposeCharts();
      return;
    }

    const specs = specsFactory().filter((spec): spec is EchartsChartSpec & { element: HTMLDivElement } => Boolean(spec.element));
    if (specs.length === 0) {
      disposeCharts();
      return;
    }

    const runtime = await loadRuntime();
    if (!canRender()) return;

    const activeKeys = new Set(specs.map((spec) => spec.key));
    disposeMissingCharts(activeKeys);

    for (const spec of specs) {
      const chart = charts.get(spec.key) ?? runtime.initChart(spec.element);
      chart.setOption(spec.option, true);
      chart.resize();
      charts.set(spec.key, chart);
    }

    observeElements(specs.map((spec) => spec.element));
  }

  function disposeCharts(): void {
    resizeObserver?.disconnect();
    resizeObserver = null;
    for (const chart of charts.values()) {
      chart.dispose();
    }
    charts.clear();
  }

  function loadRuntime(): Promise<EchartsRuntime> {
    runtimeReady ??= import("../utils/echartsRuntime");
    return runtimeReady;
  }

  function disposeMissingCharts(activeKeys: Set<string>): void {
    for (const [key, chart] of charts) {
      if (!activeKeys.has(key)) {
        chart.dispose();
        charts.delete(key);
      }
    }
  }

  function observeElements(elements: HTMLDivElement[]): void {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      for (const chart of charts.values()) {
        chart.resize();
      }
    });
    for (const element of elements) {
      resizeObserver.observe(element);
    }
  }

  onBeforeUnmount(disposeCharts);

  return {
    renderChartSpecs,
    disposeCharts
  };
}
