import * as echartsCore from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

type ChartInstance = {
  setOption(option: unknown): void;
  resize(): void;
  dispose(): void;
};

echartsCore.use([BarChart, LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export function initKeywordChart(element: HTMLDivElement): ChartInstance {
  return echartsCore.init(element) as ChartInstance;
}
