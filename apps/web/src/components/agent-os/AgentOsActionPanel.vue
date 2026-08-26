<script setup lang="ts">
import { computed } from "vue";
import { ElButton, ElMessageBox, ElTag } from "element-plus";
import { CheckCheck, CircleAlert, LockKeyhole, Play, ShieldCheck } from "@lucide/vue";
import type { AgentOsActionExecution, AgentOsActionProposal } from "../../api-agent-os";

const props = withDefaults(defineProps<{
  actions: AgentOsActionProposal[];
  executions: Record<number, AgentOsActionExecution>;
  canWrite: boolean;
  loading?: boolean;
  busyId?: number | null;
  error?: string | null;
}>(), {
  loading: false,
  busyId: null,
  error: null,
});

const emit = defineEmits<{
  approve: [action: AgentOsActionProposal];
  execute: [action: AgentOsActionProposal];
  verify: [action: AgentOsActionProposal];
}>();

const latestActions = computed(() => props.actions.slice(0, 8));

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function statusLabel(status: AgentOsActionProposal["status"]): string {
  const labels: Record<AgentOsActionProposal["status"], string> = {
    PROPOSED: "待审批",
    APPROVED: "已审批",
    EXECUTING: "执行中",
    SUCCEEDED: "待验证",
    VERIFYING: "验证中",
    EFFECTIVE: "已生效",
    FAILED: "执行失败",
    CANCELLED: "已取消",
    ROLLBACK: "回滚中",
    INEFFECTIVE: "未生效",
  };
  return labels[status];
}

function statusType(status: AgentOsActionProposal["status"]): "success" | "warning" | "danger" | "info" {
  if (["EFFECTIVE"].includes(status)) return "success";
  if (["APPROVED", "EXECUTING", "SUCCEEDED", "VERIFYING", "ROLLBACK"].includes(status)) return "warning";
  if (["FAILED", "INEFFECTIVE", "CANCELLED"].includes(status)) return "danger";
  return "info";
}

function canApprove(action: AgentOsActionProposal): boolean {
  return action.riskLevel === "LOW" && action.requiresApproval && action.status === "PROPOSED";
}

function canExecute(action: AgentOsActionProposal): boolean {
  return action.riskLevel === "LOW"
    && (action.status === "APPROVED" || action.status === "PROPOSED" && !action.requiresApproval);
}

function canVerify(action: AgentOsActionProposal): boolean {
  return action.riskLevel === "LOW" && (action.status === "SUCCEEDED" || action.status === "VERIFYING");
}

function executionFor(action: AgentOsActionProposal): AgentOsActionExecution | undefined {
  return props.executions[action.id];
}

async function confirmExecute(action: AgentOsActionProposal): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认执行「${action.type}」？执行器会按服务端动作契约产生真实业务结果。`,
      "确认执行低风险动作",
      { confirmButtonText: "确认执行", cancelButtonText: "取消", type: "warning" },
    );
    emit("execute", action);
  } catch {
    // Closing the confirmation dialog is not an error.
  }
}
</script>

<template>
  <section class="agent-os-actions panel" aria-label="Agent OS 动作审批与执行">
    <header class="agent-os-actions__header">
      <div>
        <p class="eyebrow"><ShieldCheck :size="14" /> Action Gateway</p>
        <h3>低风险动作审批与执行</h3>
        <p>只对 LOW 风险且满足服务端策略的动作提供入口；其他风险等级仅展示。</p>
      </div>
      <ElTag size="small" effect="plain">{{ actions.length }} 条动作</ElTag>
    </header>

    <p v-if="error" class="agent-os-actions__error" role="alert"><CircleAlert :size="15" /> {{ error }}</p>
    <p v-if="!canWrite" class="agent-os-actions__readonly"><LockKeyhole :size="14" /> 当前角色没有 Agent OS 工作流写权限，动作保持只读。</p>

    <div v-if="loading" class="agent-os-actions__loading" role="status" aria-live="polite">正在读取动作提案...</div>
    <ul v-else-if="latestActions.length" class="agent-os-actions__list">
      <li v-for="action in latestActions" :key="action.id" class="agent-os-action" :aria-busy="busyId === action.id">
        <div class="agent-os-action__topline">
          <div>
            <strong>{{ action.type }}</strong>
            <span> · {{ action.targetType }}{{ action.targetId === null ? "" : ` #${action.targetId}` }}</span>
          </div>
          <div class="agent-os-action__tags">
            <ElTag size="small" effect="plain" :type="action.riskLevel === 'LOW' ? 'success' : 'warning'">
              {{ action.riskLevel }} 风险
            </ElTag>
            <ElTag size="small" effect="light" :type="statusType(action.status)">{{ statusLabel(action.status) }}</ElTag>
          </div>
        </div>
        <p class="agent-os-action__reason">{{ action.reason }}</p>
        <div class="agent-os-action__facts">
          <span>提案值 {{ displayValue(action.proposedValue) }}</span>
          <span>预期影响 {{ displayValue(action.expectedImpact) }}</span>
          <span>版本 v{{ action.version }}</span>
        </div>

        <div class="agent-os-action__controls">
          <ElButton
            v-if="canApprove(action)"
            size="small"
            :disabled="!canWrite"
            :loading="busyId === action.id"
            @click="emit('approve', action)"
          >
            <template #icon><ShieldCheck :size="13" /></template>
            审批
          </ElButton>
          <ElButton
            v-if="canExecute(action)"
            size="small"
            type="primary"
            :disabled="!canWrite"
            :loading="busyId === action.id"
            @click="confirmExecute(action)"
          >
            <template #icon><Play :size="13" /></template>
            执行
          </ElButton>
          <ElButton
            v-if="canVerify(action)"
            size="small"
            type="success"
            :disabled="!canWrite"
            :loading="busyId === action.id"
            @click="emit('verify', action)"
          >
            <template #icon><CheckCheck :size="13" /></template>
            验证结果
          </ElButton>
          <small v-if="action.riskLevel !== 'LOW'" class="agent-os-action__guard">中高风险动作不在本切片执行。</small>
          <small v-else-if="!action.requiresApproval && action.status === 'PROPOSED'" class="agent-os-action__guard">服务端标记为无需审批。</small>
        </div>

        <div v-if="executionFor(action)" class="agent-os-action__execution">
          <span>执行记录 {{ executionFor(action)?.status }}</span>
          <span v-if="executionFor(action)?.errorMessage">{{ executionFor(action)?.errorMessage }}</span>
          <span v-else>结果 {{ displayValue(executionFor(action)?.result) }}</span>
        </div>
      </li>
    </ul>
    <p v-else class="agent-os-actions__empty">暂无动作提案。</p>
  </section>
</template>

<style scoped>
.agent-os-actions { display: grid; gap: 14px; min-width: 0; padding: 18px; }
.agent-os-actions__header,
.agent-os-actions__topline,
.agent-os-actions__tags,
.agent-os-actions__controls,
.agent-os-actions__error,
.agent-os-actions__readonly { align-items: center; display: flex; }
.agent-os-actions__header { gap: 14px; justify-content: space-between; }
.agent-os-actions__header h3 { margin: 3px 0 0; }
.agent-os-actions__header p:last-child { color: #64748b; font-size: 12px; margin: 6px 0 0; }
.agent-os-actions__error { color: #b45309; font-size: 12px; gap: 6px; margin: 0; }
.agent-os-actions__readonly { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; color: #64748b; font-size: 12px; gap: 6px; margin: 0; padding: 8px 10px; }
.agent-os-actions__loading,
.agent-os-actions__empty { color: #64748b; font-size: 12px; margin: 0; }
.agent-os-actions__list { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
.agent-os-action { border: 1px solid #e2e8f0; border-radius: 9px; min-width: 0; padding: 12px; }
.agent-os-action__topline { gap: 10px; justify-content: space-between; }
.agent-os-action__topline strong { color: #0f172a; font-size: 13px; }
.agent-os-action__topline span { color: #64748b; font-size: 11px; }
.agent-os-action__tags { flex: 0 0 auto; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
.agent-os-action__reason { color: #334155; font-size: 12px; line-height: 1.5; margin: 9px 0 0; overflow-wrap: anywhere; }
.agent-os-action__facts { color: #64748b; display: flex; flex-wrap: wrap; font-size: 11px; gap: 6px 14px; margin-top: 8px; }
.agent-os-action__controls { flex-wrap: wrap; gap: 7px; margin-top: 11px; }
.agent-os-action__guard { color: #64748b; font-size: 11px; margin-left: 2px; }
.agent-os-action__execution { background: #f8fafc; border-radius: 6px; color: #475569; display: grid; font-size: 11px; gap: 3px; margin-top: 10px; overflow-wrap: anywhere; padding: 7px 8px; }
@media (max-width: 640px) {
  .agent-os-actions__header,
  .agent-os-action__topline { align-items: flex-start; flex-direction: column; }
  .agent-os-action__tags { justify-content: flex-start; }
}
</style>
