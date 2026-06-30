import * as echartsCore from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

export type ChartInstance = {
  setOption(option: unknown, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
};

echartsCore.use([BarChart, PieChart, AriaComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

export function initChart(element: HTMLDivElement): ChartInstance {
  return echartsCore.init(element) as ChartInstance;
}
