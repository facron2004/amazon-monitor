<script setup lang="ts">
import { ElButton, ElEmpty, ElTag } from "element-plus";
import type { AgentOsSignal } from "../../api-agent-os";

const props = withDefaults(defineProps<{
  signals: AgentOsSignal[];
  canWrite: boolean;
  loading?: boolean;
  busyId?: string | null;
  error?: string | null;
}>(), {
  loading: false,
  busyId: null,
  error: null,
});

const emit = defineEmits<{
  investigate: [signal: AgentOsSignal];
  ignore: [signal: AgentOsSignal];
}>();

function severityLabel(value: AgentOsSignal["severity"]): string {
  return ({ HIGH: "高", MEDIUM: "中", LOW: "低" } as const)[value];
}

function severityType(value: AgentOsSignal["severity"]): "danger" | "warning" | "info" {
  if (value === "HIGH") return "danger";
  if (value === "MEDIUM") return "warning";
  return "info";
}

function statusLabel(value: AgentOsSignal["status"]): string {
  return ({ NEW: "待研究", INVESTIGATING: "研究中", ACTIONED: "已跟进", IGNORED: "已忽略" } as const)[value];
}

function statusType(value: AgentOsSignal["status"]): "success" | "warning" | "info" {
  if (value === "ACTIONED") return "success";
  if (value === "INVESTIGATING") return "warning";
  return "info";
}

function rankLabel(value: number | null): string {
  return value === null ? "—" : `#${value}`;
}

function changeLabel(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value}`;
}
</script>

<template>
  <section class="agent-os-signals panel" aria-label="Agent OS Signal Feed">
    <header class="agent-os-signals__header">
      <div>
        <p class="eyebrow">Signal Feed</p>
        <h3>排名异动</h3>
        <p>来源于当前组织的真实 Insight Event；每条信号保留来源日期、采集证据和下一步入口。</p>
      </div>
      <ElTag size="small" effect="plain">{{ signals.length }} 条</ElTag>
    </header>

    <p v-if="error" class="agent-os-signals__error" role="alert">{{ error }}</p>
    <p v-if="!canWrite" class="agent-os-signals__readonly">当前角色没有 Agent OS 工作流写权限，信号仅可查看。</p>
    <div v-if="loading" class="agent-os-signals__loading" role="status" aria-live="polite">正在读取排名异动...</div>
    <ul v-else-if="signals.length" class="agent-os-signals__list">
      <li v-for="signal in signals.slice(0, 8)" :key="signal.id" class="agent-os-signal">
        <div class="agent-os-signal__topline">
          <div>
            <strong>{{ signal.title }}</strong>
            <span>{{ signal.entityType }} {{ signal.entityId }}</span>
          </div>
          <div class="agent-os-signal__tags">
            <ElTag size="small" effect="light" :type="severityType(signal.severity)">
              {{ severityLabel(signal.severity) }}优先级
            </ElTag>
            <ElTag size="small" effect="plain" :type="statusType(signal.status)">
              {{ statusLabel(signal.status) }}
            </ElTag>
          </div>
        </div>

        <p class="agent-os-signal__summary">{{ signal.summary }}</p>
        <div class="agent-os-signal__facts">
          <span>排名 {{ rankLabel(signal.before) }} → {{ rankLabel(signal.after) }}</span>
          <span>变化 {{ changeLabel(signal.change) }}</span>
          <span>{{ signal.evidence.marketplace || "站点未记录" }}</span>
          <span>数据日 {{ signal.evidence.eventDate }}</span>
        </div>
        <p class="agent-os-signal__evidence">
          证据：{{ signal.evidence.evidenceItems.slice(0, 2).join("；") || "未记录明细" }}
        </p>
        <div class="agent-os-signal__controls">
          <ElButton
            v-if="signal.status === 'NEW'"
            size="small"
            type="primary"
            :disabled="!canWrite"
            :loading="busyId === signal.id"
            @click="emit('investigate', signal)"
          >
            开始研究
          </ElButton>
          <ElButton
            v-if="signal.status !== 'IGNORED' && signal.status !== 'ACTIONED'"
            size="small"
            text
            :disabled="!canWrite || busyId === signal.id"
            @click="emit('ignore', signal)"
          >
            忽略
          </ElButton>
          <small>建议：{{ signal.suggestedAction }}</small>
        </div>
      </li>
    </ul>
    <ElEmpty v-else :image-size="42" description="暂无排名异动信号" />
  </section>
</template>

<style scoped>
.agent-os-signals { display: grid; gap: 14px; min-width: 0; padding: 18px; }
.agent-os-signals__header,
.agent-os-signal__topline,
.agent-os-signal__tags { align-items: center; display: flex; }
.agent-os-signals__header { gap: 14px; justify-content: space-between; }
.agent-os-signals__header h3 { margin: 3px 0 0; }
.agent-os-signals__header p:last-child { color: #64748b; font-size: 12px; line-height: 1.45; margin: 6px 0 0; }
.agent-os-signals__error { color: #b45309; font-size: 12px; margin: 0; }
.agent-os-signals__readonly { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; color: #64748b; font-size: 12px; margin: 0; padding: 8px 10px; }
.agent-os-signals__loading,
.agent-os-signals :deep(.el-empty__description p) { color: #64748b; font-size: 12px; }
.agent-os-signals__list { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
.agent-os-signal { border: 1px solid #e2e8f0; border-radius: 9px; min-width: 0; padding: 12px; }
.agent-os-signal__topline { align-items: flex-start; gap: 10px; justify-content: space-between; }
.agent-os-signal__topline strong { color: #0f172a; display: block; font-size: 13px; line-height: 1.4; }
.agent-os-signal__topline span { color: #64748b; display: block; font-size: 11px; margin-top: 4px; }
.agent-os-signal__tags { flex: 0 0 auto; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
.agent-os-signal__summary,
.agent-os-signal__evidence { color: #475569; font-size: 12px; line-height: 1.5; margin: 9px 0 0; overflow-wrap: anywhere; }
.agent-os-signal__facts { color: #64748b; display: flex; flex-wrap: wrap; font-size: 11px; gap: 6px 14px; margin-top: 8px; }
.agent-os-signal__evidence { color: #64748b; font-size: 11px; }
.agent-os-signal__controls { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.agent-os-signal__controls small { color: #64748b; font-size: 11px; line-height: 1.4; }
@media (max-width: 640px) {
  .agent-os-signals__header,
  .agent-os-signal__topline { align-items: flex-start; flex-direction: column; }
  .agent-os-signal__tags { justify-content: flex-start; }
}
</style>
