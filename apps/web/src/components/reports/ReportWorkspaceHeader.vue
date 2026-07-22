<script setup lang="ts">
import {
  workflowReportPeriodLabels,
  type WorkflowReportPeriod
} from "@amazon-monitor/shared";
import { CalendarDays, ChevronDown, Download, FilePlus2 } from "@lucide/vue";
import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElSegmented,
  ElTag
} from "element-plus";

type PeriodExportFormat = "markdown" | "pdf";
type DailyExportFormat = PeriodExportFormat | "excel";

defineProps<{
  period: WorkflowReportPeriod;
  reportWindow: string;
  canWrite: boolean;
  dateAvailable: boolean;
  periodArchiveCurrent: boolean;
  dailyArchiveCurrent: boolean;
  periodArchiveAvailable: boolean;
  dailyArchiveAvailable: boolean;
  periodGenerating: boolean;
  dailyGenerating: boolean;
  periodExporting: boolean;
  dailyExporting: boolean;
}>();

const emit = defineEmits<{
  "update:period": [period: WorkflowReportPeriod];
  generatePeriod: [];
  exportPeriod: [format: PeriodExportFormat];
  generateDaily: [];
  exportDaily: [format: DailyExportFormat];
}>();

const periodOptions: Array<{ value: WorkflowReportPeriod; label: string }> = [
  { value: "weekly", label: "按周" },
  { value: "monthly", label: "按月" }
];

function selectPeriod(value: string | number | boolean): void {
  if (value === "weekly" || value === "monthly") {
    emit("update:period", value);
  }
}

function selectPeriodExport(value: string | number | object): void {
  if (value === "markdown" || value === "pdf") {
    emit("exportPeriod", value);
  }
}

function selectDailyExport(value: string | number | object): void {
  if (value === "markdown" || value === "pdf" || value === "excel") {
    emit("exportDaily", value);
  }
}
</script>

<template>
  <header class="reports-head">
    <div>
      <span>报告</span>
      <h2>洞察报告工作台</h2>
    </div>
    <div class="reports-head-actions">
      <ElSegmented
        :model-value="period"
        :options="periodOptions"
        size="large"
        @update:model-value="selectPeriod"
      />
      <ElTag class="window-tag" effect="plain" round>
        <CalendarDays :size="14" />
        <strong>{{ reportWindow }}</strong>
      </ElTag>
      <ElButton
        type="primary"
        :loading="periodGenerating"
        :disabled="!canWrite || !dateAvailable"
        @click="emit('generatePeriod')"
      >
        <FilePlus2 :size="15" />
        <span>
          {{ periodArchiveCurrent
            ? `重新生成${workflowReportPeriodLabels[period]}`
            : `生成${workflowReportPeriodLabels[period]}` }}
        </span>
      </ElButton>
      <ElDropdown
        trigger="click"
        :disabled="!canWrite || !periodArchiveAvailable"
        @command="selectPeriodExport"
      >
        <ElButton :loading="periodExporting" :disabled="!canWrite || !periodArchiveAvailable">
          <Download :size="15" />
          <span>周期导出</span>
          <ChevronDown :size="14" />
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="pdf">PDF 文档</ElDropdownItem>
            <ElDropdownItem command="markdown">Markdown</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <ElButton
        :loading="dailyGenerating"
        :disabled="!canWrite || !dateAvailable"
        @click="emit('generateDaily')"
      >
        <FilePlus2 :size="15" />
        <span>{{ dailyArchiveCurrent ? "重新生成日报" : "生成日报" }}</span>
      </ElButton>
      <ElDropdown
        trigger="click"
        :disabled="!canWrite || (!dailyArchiveAvailable && !dateAvailable)"
        @command="selectDailyExport"
      >
        <ElButton
          :loading="dailyExporting"
          :disabled="!canWrite || (!dailyArchiveAvailable && !dateAvailable)"
        >
          <Download :size="15" />
          <span>日报导出</span>
          <ChevronDown :size="14" />
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="pdf" :disabled="!dailyArchiveAvailable">PDF 文档</ElDropdownItem>
            <ElDropdownItem command="markdown" :disabled="!dailyArchiveAvailable">Markdown</ElDropdownItem>
            <ElDropdownItem command="excel" :disabled="!dateAvailable">Excel 数据</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>
  </header>
</template>

<style scoped>
.reports-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.reports-head > div:first-child > span {
  color: #667085;
  font-size: 12px;
}

.reports-head > div:first-child {
  flex: 0 0 auto;
}

.reports-head h2 {
  color: #172033;
  font-size: 26px;
  line-height: 1.2;
  margin: 3px 0 0;
  white-space: nowrap;
}

.reports-head-actions {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.reports-head-actions :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.window-tag {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
}

@media (max-width: 720px) {
  .reports-head {
    align-items: stretch;
    flex-direction: column;
  }

  .reports-head-actions {
    justify-content: stretch;
  }

  .reports-head h2 {
    white-space: normal;
  }

  .window-tag,
  .reports-head-actions :deep(.el-button),
  .reports-head-actions :deep(.el-segmented),
  .reports-head-actions :deep(.el-dropdown) {
    justify-content: center;
    margin-left: 0;
    width: 100%;
  }
}
</style>
