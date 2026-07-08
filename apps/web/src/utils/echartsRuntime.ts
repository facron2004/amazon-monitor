import * as echartsCore from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, MarkPointComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

export type ChartInstance = {
  setOption(option: unknown, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
};

echartsCore.use([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent, MarkPointComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

export function initChart(element: HTMLDivElement): ChartInstance {
  return echartsCore.init(element) as ChartInstance;
}
