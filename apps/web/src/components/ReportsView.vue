<script setup lang="ts">
import type { CategoryReportResponse, DailyReportResponse } from "../api-types";

interface Props {
  report: DailyReportResponse | null;
  categoryReport: CategoryReportResponse | null;
}

defineProps<Props>();
</script>

<template>
  <section class="view panel">
    <div class="panel-head">
      <h2>日报与类目报告</h2>
      <span>{{ report?.date }}</span>
    </div>
    <pre class="report">{{ [categoryReport?.markdown, report?.markdown].filter(Boolean).join("\n\n---\n\n") || "暂无可用报告。" }}</pre>
  </section>
</template>
