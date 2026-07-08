<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Building2, Gauge } from "@lucide/vue";
import { ElButton, ElProgress, ElStatistic, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import type { BrandActionPressureRow } from "../../utils/actionCenterChartOptions";

const props = defineProps<{
  rows: BrandActionPressureRow[];
  events: InsightEvent[];
}>();

const emit = defineEmits<{
  (event: "focus-brand", brand: string): void;
  (event: "select", value: InsightEvent): void;
}>();

const eventById = computed(() => new Map(props.events.map((event) => [event.id, event])));
const maxPressure = computed(() => Math.max(1, ...props.rows.map((row) => row.value)));
const totalPressure = computed(() => props.rows.reduce((sum, row) => sum + row.value, 0));
const totalP0 = computed(() => props.rows.reduce((sum, row) => sum + row.p0Count, 0));
const totalMatrixSurge = computed(() => props.rows.reduce((sum, row) => sum + row.matrixSurgeCount, 0));
const totalMatrixDrop = computed(() => props.rows.reduce((sum, row) => sum + row.matrixDropCount, 0));
const topBrandLabel = computed(() => props.rows[0]?.brand ?? "-");

function pressurePercent(value: number): number {
  return Math.round((value / maxPressure.value) * 100);
}

function selectRow(row: unknown): void {
  if (!isBrandPressureRow(row)) return;
  const event = eventById.value.get(row.topEventId);
  if (event) {
    emit("select", event);
  }
}

function isBrandPressureRow(row: unknown): row is BrandActionPressureRow {
  return typeof row === "object" && row !== null && "topEventId" in row;
}

function formatShareChange(value: number | null): string {
  if (value === null) return "无份额变化";
  const percent = Math.round(value * 1000) / 10;
  return `份额 ${percent > 0 ? "+" : ""}${percent}%`;
}

function shareChangeType(value: number | null): "success" | "danger" | "info" {
  if (value === null || value === 0) return "info";
  return value > 0 ? "success" : "danger";
}
</script>

<template>
  <section class="brand-pressure-flow">
    <header>
      <div class="chart-title">
        <Building2 :size="15" />
        <span>品牌压力队列</span>
      </div>
      <small>{{ rows.length }} 个品牌存在打开动作分</small>
    </header>

    <div class="pressure-kpis">
      <section>
        <Gauge :size="15" />
        <ElStatistic title="打开分" :value="totalPressure" />
      </section>
      <section>
        <AlertTriangle :size="15" />
        <ElStatistic title="P0 信号" :value="totalP0" />
      </section>
      <section>
        <Building2 :size="15" />
        <div class="matrix-stat">
          <span>矩阵方向</span>
          <strong>{{ totalMatrixSurge }} / {{ totalMatrixDrop }}</strong>
          <small>上攻 / 下滑</small>
        </div>
      </section>
      <section>
        <Building2 :size="15" />
        <div class="top-brand-stat">
          <span>最高品牌</span>
          <strong>{{ topBrandLabel }}</strong>
        </div>
      </section>
    </div>

    <ElTable :data="rows" row-key="brand" size="small">
      <ElTableColumn label="品牌" min-width="150">
        <template #default="scope">
          <div class="brand-cell">
            <strong>{{ scope.row.brand }}</strong>
            <small>{{ scope.row.eventCount }} 条打开事件</small>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="打开分" min-width="160">
        <template #default="scope">
          <div class="pressure-cell">
            <ElProgress :percentage="pressurePercent(scope.row.value)" :show-text="false" />
            <strong>{{ scope.row.value }}</strong>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="P0" width="72" align="center">
        <template #default="scope">
          <ElTag :type="scope.row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>
            {{ scope.row.p0Count }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="矩阵方向" min-width="180">
        <template #default="scope">
          <div class="matrix-cell">
            <div>
              <ElTag v-if="scope.row.matrixSurgeCount > 0" type="success" effect="light" round>
                上攻 {{ scope.row.matrixSurgeCount }}
              </ElTag>
              <ElTag v-if="scope.row.matrixDropCount > 0" type="danger" effect="light" round>
                下滑 {{ scope.row.matrixDropCount }}
              </ElTag>
              <ElTag v-if="scope.row.matrixSurgeCount === 0 && scope.row.matrixDropCount === 0" type="info" effect="light" round>
                常规
              </ElTag>
            </div>
            <small :class="`share-${shareChangeType(scope.row.brandTop100ShareChange)}`">
              {{ formatShareChange(scope.row.brandTop100ShareChange) }}
            </small>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="最高信号" min-width="220" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.topEventTitle }}
        </template>
      </ElTableColumn>
      <ElTableColumn width="128" align="right">
        <template #default="scope">
          <div class="brand-pressure-actions">
            <ElButton link type="primary" :disabled="!scope.row.canFocus" @click="emit('focus-brand', scope.row.brand)">
              聚焦
            </ElButton>
            <ElButton link type="primary" @click="selectRow(scope.row)">打开</ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.brand-pressure-flow {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 10px;
  padding-top: 12px;
}

.brand-pressure-flow > header {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.chart-title {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-size: 12px;
  font-weight: 800;
  gap: 8px;
}

.brand-pressure-flow > header small,
.brand-cell small,
.top-brand-stat span,
.matrix-stat span {
  color: #64748b;
  font-size: 12px;
}

.pressure-kpis {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.pressure-kpis section {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr);
  min-width: 0;
  padding: 10px;
}

.pressure-kpis svg {
  color: #64748b;
}

.pressure-kpis :deep(.el-statistic__head) {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 2px;
}

.pressure-kpis :deep(.el-statistic__content) {
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.top-brand-stat,
.matrix-stat {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.top-brand-stat strong,
.matrix-stat strong {
  color: #0f172a;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matrix-stat small {
  color: #64748b;
  font-size: 11px;
}

.brand-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.brand-cell strong {
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pressure-cell {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(70px, 1fr) auto;
}

.pressure-cell strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.matrix-cell {
  display: grid;
  gap: 6px;
}

.matrix-cell > div {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.matrix-cell small {
  font-size: 11px;
}

.share-success {
  color: #0f766e;
}

.share-danger {
  color: #dc2626;
}

.share-info {
  color: #64748b;
}

.brand-pressure-actions {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
}

.brand-pressure-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.brand-pressure-flow :deep(.el-table) {
  border-radius: 8px;
}

.brand-pressure-flow :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

@media (max-width: 760px) {
  .brand-pressure-flow > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .pressure-kpis {
    grid-template-columns: 1fr;
  }
}
</style>
