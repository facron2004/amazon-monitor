import * as echartsCore from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

export interface CompetitorTrendChartInstance {
  setOption(option: unknown, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
}

echartsCore.use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export function initCompetitorTrendChart(element: HTMLDivElement): CompetitorTrendChartInstance {
  return echartsCore.init(element) as CompetitorTrendChartInstance;
}
