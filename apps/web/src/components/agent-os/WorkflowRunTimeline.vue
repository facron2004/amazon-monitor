<script setup lang="ts">
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  TimerReset,
  Waypoints
} from "@lucide/vue";
import { computed, ref, watch, type Component } from "vue";
import { ElEmpty, ElTag } from "element-plus";
import {
  formatAgentOsDate,
  formatEvidenceValue,
  resolveAgentOsViewState,
  workflowApprovalLabel,
  workflowApprovalTagType,
  workflowNodeStatusLabel,
  workflowNodeStatusTagType,
  workflowNodeTypeLabel,
  workflowRunStatusLabel,
  workflowRunStatusTagType
} from "./agent-os-formatters";
import type { WorkflowNodeStatus, WorkflowRun, WorkflowRunNode } from "./agent-os-types";

const props = withDefaults(defineProps<{
  run: WorkflowRun | null;
  loading?: boolean;
  error?: string | null;
}>(), {
  loading: false,
  error: null
});

const emit = defineEmits<{
  retry: [];
}>();

const state = computed(() => resolveAgentOsViewState(
  props.loading,
  props.error,
  Boolean(props.run?.nodes.length)
));

const expandedNodeIds = ref<Set<string>>(new Set());

watch(() => props.run?.id, () => {
  expandedNodeIds.value = new Set();
});

function isExpanded(nodeId: string): boolean {
  return expandedNodeIds.value.has(nodeId);
}

function toggleEvidence(nodeId: string): void {
  const next = new Set(expandedNodeIds.value);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  expandedNodeIds.value = next;
}

function evidencePanelId(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `agent-os-evidence-${safeId}`;
}

function nodeStatusIcon(status: WorkflowNodeStatus): Component {
  const icons: Record<WorkflowNodeStatus, Component> = {
    pending: Clock3,
    running: LoaderCircle,
    waiting: TimerReset,
    waiting_approval: LockKeyhole,
    succeeded: CheckCircle2,
    failed: CircleAlert,
    skipped: SkipForward
  };
  return icons[status];
}

function nodeMeta(node: WorkflowRunNode): string {
  if (node.completedAt) return `完成于 ${formatAgentOsDate(node.completedAt)}`;
  if (node.startedAt) return `开始于 ${formatAgentOsDate(node.startedAt)}`;
  return "尚未开始";
}
</script>

<template>
  <section class="agent-os-workflow-timeline" :aria-busy="state === 'loading'">
    <div v-if="state === 'loading'" class="agent-os-timeline-state agent-os-timeline-state--loading" role="status" aria-live="polite">
      <div v-for="index in 3" :key="index" class="agent-os-timeline-skeleton" aria-hidden="true">
        <span />
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
      <span class="agent-os-timeline-state__hint">正在加载 Workflow 运行记录...</span>
    </div>

    <div v-else-if="state === 'failed'" class="agent-os-timeline-state agent-os-timeline-state--failed" role="alert">
      <CircleAlert :size="20" aria-hidden="true" />
      <div>
        <strong>Workflow 运行记录加载失败</strong>
        <span>{{ error || "暂时无法读取节点状态，请稍后重试。" }}</span>
      </div>
      <button
        type="button"
        class="agent-os-timeline-retry"
        aria-label="重新加载 Workflow 运行记录"
        @click="emit('retry')"
      >
        <RefreshCw :size="14" aria-hidden="true" />
        <span>重试</span>
      </button>
    </div>

    <ElEmpty
      v-else-if="state === 'empty'"
      class="agent-os-timeline-empty"
      description="暂无 Workflow 运行记录。"
      :image-size="72"
    />

    <template v-else-if="run">
      <header class="agent-os-workflow-header">
        <div>
          <span class="agent-os-workflow-eyebrow"><Waypoints :size="13" aria-hidden="true" /> Workflow Run</span>
          <h3>{{ run.name }}</h3>
          <p>#{{ run.id }} · {{ run.nodes.length }} 个节点</p>
        </div>
        <ElTag :type="workflowRunStatusTagType(run.status)" effect="light">
          {{ workflowRunStatusLabel(run.status) }}
        </ElTag>
      </header>

      <div class="agent-os-workflow-meta" aria-label="Workflow 运行时间">
        <span v-if="run.startedAt"><Clock3 :size="13" aria-hidden="true" /> 开始 {{ formatAgentOsDate(run.startedAt) }}</span>
        <span v-if="run.completedAt"><CheckCircle2 :size="13" aria-hidden="true" /> 完成 {{ formatAgentOsDate(run.completedAt) }}</span>
        <span v-if="run.currentNodeId"><Waypoints :size="13" aria-hidden="true" /> 当前节点 {{ run.currentNodeId }}</span>
      </div>

      <ol class="agent-os-timeline" aria-label="Workflow 节点时间线">
        <li
          v-for="(node, index) in run.nodes"
          :key="node.id"
          class="agent-os-timeline__item"
          :class="{ 'is-last': index === run.nodes.length - 1, 'is-current': run.currentNodeId === node.id }"
        >
          <div class="agent-os-timeline__rail" aria-hidden="true">
            <span class="agent-os-timeline__dot" :class="`is-${node.status}`">
              <component :is="nodeStatusIcon(node.status)" :size="14" />
            </span>
          </div>

          <article class="agent-os-timeline__content">
            <header class="agent-os-timeline__node-header">
              <div class="agent-os-timeline__node-identity">
                <span>{{ workflowNodeTypeLabel(node.type) }}</span>
                <h4>{{ node.name }}</h4>
              </div>
              <ElTag :type="workflowNodeStatusTagType(node.status)" size="small" effect="light">
                {{ workflowNodeStatusLabel(node.status) }}
              </ElTag>
            </header>

            <p v-if="node.summary" class="agent-os-timeline__summary">{{ node.summary }}</p>

            <div class="agent-os-timeline__node-meta">
              <span><Clock3 :size="12" aria-hidden="true" /> {{ nodeMeta(node) }}</span>
              <span v-if="node.evidence.length"><FileSearch :size="12" aria-hidden="true" /> {{ node.evidence.length }} 条证据</span>
            </div>

            <div v-if="node.approval" class="agent-os-approval" :class="`is-${node.approval.status}`">
              <ShieldCheck :size="14" aria-hidden="true" />
              <span>{{ node.approval.label || "审批门禁" }}</span>
              <ElTag :type="workflowApprovalTagType(node.approval.status)" size="small" effect="plain">
                {{ workflowApprovalLabel(node.approval.status) }}
              </ElTag>
              <small v-if="node.approval.actor">{{ node.approval.actor }}</small>
            </div>

            <template v-if="node.evidence.length">
              <button
                type="button"
                class="agent-os-evidence-toggle"
                :aria-expanded="isExpanded(node.id)"
                :aria-controls="evidencePanelId(node.id)"
                @click="toggleEvidence(node.id)"
              >
                <span>{{ isExpanded(node.id) ? "收起证据" : "查看证据" }}</span>
                <ChevronDown :size="14" aria-hidden="true" :class="{ 'is-open': isExpanded(node.id) }" />
              </button>

              <div
                v-if="isExpanded(node.id)"
                :id="evidencePanelId(node.id)"
                class="agent-os-evidence"
              >
                <ul>
                  <li v-for="evidence in node.evidence" :key="evidence.id">
                    <FileSearch :size="14" aria-hidden="true" />
                    <div>
                      <strong>{{ evidence.label }}</strong>
                      <span>{{ formatEvidenceValue(evidence.value) }}</span>
                      <small v-if="evidence.source">来源：{{ evidence.source }}</small>
                    </div>
                    <a
                      v-if="evidence.href"
                      :href="evidence.href"
                      target="_blank"
                      rel="noopener noreferrer"
                    >查看</a>
                  </li>
                </ul>
              </div>
            </template>
            <span v-else class="agent-os-no-evidence">暂无证据</span>
          </article>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.agent-os-workflow-timeline {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  min-width: 0;
  padding: 18px;
}

.agent-os-workflow-header,
.agent-os-workflow-eyebrow,
.agent-os-workflow-meta,
.agent-os-timeline__node-header,
.agent-os-timeline__node-meta,
.agent-os-approval,
.agent-os-evidence-toggle {
  align-items: center;
  display: flex;
}

.agent-os-workflow-header {
  gap: 14px;
  justify-content: space-between;
}

.agent-os-workflow-eyebrow {
  color: #2563eb;
  font-size: 11px;
  font-weight: 750;
  gap: 5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-os-workflow-header h3 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.3;
  margin: 6px 0 0;
}

.agent-os-workflow-header p {
  color: #64748b;
  font-size: 12px;
  margin: 5px 0 0;
}

.agent-os-workflow-meta {
  border-bottom: 1px solid #e2e8f0;
  color: #64748b;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 10px 16px;
  margin-top: 14px;
  padding-bottom: 14px;
}

.agent-os-workflow-meta span,
.agent-os-timeline__node-meta span {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}

.agent-os-timeline {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
}

.agent-os-timeline__item {
  display: grid;
  gap: 12px;
  grid-template-columns: 28px minmax(0, 1fr);
  min-width: 0;
  position: relative;
}

.agent-os-timeline__rail {
  display: flex;
  justify-content: center;
  min-height: 100%;
  position: relative;
}

.agent-os-timeline__rail::after {
  background: #dbe4f0;
  content: "";
  left: 50%;
  position: absolute;
  top: 32px;
  bottom: -1px;
  transform: translateX(-50%);
  width: 1px;
}

.agent-os-timeline__item.is-last .agent-os-timeline__rail::after {
  display: none;
}

.agent-os-timeline__dot {
  align-items: center;
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #cbd5e1;
  display: inline-flex;
  height: 26px;
  justify-content: center;
  position: relative;
  width: 26px;
  z-index: 1;
}

.agent-os-timeline__dot.is-pending,
.agent-os-timeline__dot.is-skipped {
  background: #f1f5f9;
  color: #64748b;
}

.agent-os-timeline__dot.is-waiting {
  background: #eff6ff;
  box-shadow: 0 0 0 1px #60a5fa;
  color: #1d4ed8;
}

.agent-os-timeline__dot.is-running,
.agent-os-timeline__dot.is-waiting_approval {
  background: #fff7ed;
  box-shadow: 0 0 0 1px #fb923c;
  color: #c2410c;
}

.agent-os-timeline__dot.is-running :deep(svg) {
  animation: agent-os-spin 1.1s linear infinite;
}

.agent-os-timeline__dot.is-succeeded {
  background: #ecfdf3;
  box-shadow: 0 0 0 1px #4ade80;
  color: #15803d;
}

.agent-os-timeline__dot.is-failed {
  background: #fef2f2;
  box-shadow: 0 0 0 1px #f87171;
  color: #b91c1c;
}

.agent-os-timeline__content {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  margin-bottom: 14px;
  min-width: 0;
  padding: 13px;
}

.agent-os-timeline__item.is-current .agent-os-timeline__content {
  border-color: #93c5fd;
  box-shadow: inset 3px 0 0 #2563eb;
}

.agent-os-timeline__node-header {
  gap: 10px;
  justify-content: space-between;
}

.agent-os-timeline__node-identity {
  min-width: 0;
}

.agent-os-timeline__node-identity > span {
  color: #2563eb;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.agent-os-timeline__node-identity h4 {
  color: #0f172a;
  font-size: 14px;
  line-height: 1.35;
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}

.agent-os-timeline__summary {
  color: #475569;
  font-size: 12px;
  line-height: 1.55;
  margin: 9px 0 0;
}

.agent-os-timeline__node-meta {
  color: #64748b;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 6px 12px;
  margin-top: 10px;
}

.agent-os-approval {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  color: #475569;
  gap: 7px;
  margin-top: 11px;
  min-height: 34px;
  padding: 5px 8px;
}

.agent-os-approval.is-pending {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}

.agent-os-approval.is-approved {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.agent-os-approval.is-rejected {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.agent-os-approval > span {
  font-size: 12px;
  font-weight: 650;
  min-width: 0;
}

.agent-os-approval small {
  color: inherit;
  font-size: 11px;
  margin-left: auto;
  opacity: 0.78;
}

.agent-os-evidence-toggle {
  background: transparent;
  border: 0;
  color: #2563eb;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  gap: 5px;
  margin-top: 10px;
  min-height: 30px;
  padding: 0;
}

.agent-os-evidence-toggle:hover {
  color: #1d4ed8;
}

.agent-os-evidence-toggle:focus-visible,
.agent-os-timeline-retry:focus-visible,
.agent-os-evidence a:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.agent-os-evidence-toggle :deep(svg) {
  transition: transform 0.18s ease;
}

.agent-os-evidence-toggle :deep(svg.is-open) {
  transform: rotate(180deg);
}

.agent-os-evidence {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  margin-top: 8px;
  padding: 8px;
}

.agent-os-evidence ul {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.agent-os-evidence li {
  align-items: flex-start;
  color: #475569;
  display: flex;
  gap: 7px;
  min-width: 0;
}

.agent-os-evidence li > svg {
  color: #64748b;
  flex: 0 0 auto;
  margin-top: 2px;
}

.agent-os-evidence li > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.agent-os-evidence strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-os-evidence span,
.agent-os-evidence small {
  font-size: 11px;
  overflow-wrap: anywhere;
}

.agent-os-evidence small {
  color: #64748b;
}

.agent-os-evidence a {
  color: #2563eb;
  flex: 0 0 auto;
  font-size: 11px;
  margin-left: auto;
  text-decoration: none;
}

.agent-os-evidence a:hover {
  text-decoration: underline;
}

.agent-os-no-evidence {
  color: #94a3b8;
  display: block;
  font-size: 11px;
  margin-top: 10px;
}

.agent-os-timeline-state {
  min-height: 180px;
}

.agent-os-timeline-state--loading {
  display: grid;
  gap: 10px;
}

.agent-os-timeline-skeleton {
  align-items: flex-start;
  animation: agent-os-pulse 1.3s ease-in-out infinite;
  display: grid;
  gap: 10px;
  grid-template-columns: 26px minmax(0, 1fr);
}

.agent-os-timeline-skeleton > span {
  background: #e2e8f0;
  border-radius: 50%;
  height: 26px;
  width: 26px;
}

.agent-os-timeline-skeleton > div {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  display: grid;
  gap: 8px;
  padding: 13px;
}

.agent-os-timeline-skeleton i {
  background: #e2e8f0;
  border-radius: 4px;
  display: block;
  height: 9px;
  width: 75%;
}

.agent-os-timeline-skeleton i:first-child {
  height: 14px;
  width: 42%;
}

.agent-os-timeline-state__hint {
  color: #64748b;
  font-size: 12px;
}

.agent-os-timeline-state--failed {
  align-items: center;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  color: #9a3412;
  display: flex;
  gap: 10px;
  padding: 12px;
}

.agent-os-timeline-state--failed > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.agent-os-timeline-state--failed strong {
  color: #7c2d12;
  font-size: 13px;
}

.agent-os-timeline-state--failed span {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.agent-os-timeline-retry {
  align-items: center;
  background: #ffffff;
  border: 1px solid #fdba74;
  border-radius: 7px;
  color: #9a3412;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  gap: 5px;
  margin-left: auto;
  min-height: 34px;
  padding: 0 11px;
}

.agent-os-timeline-retry:hover {
  background: #fffaf5;
}

.agent-os-timeline-empty {
  min-height: 180px;
}

@keyframes agent-os-pulse {
  0%,
  100% { opacity: 0.52; }
  50% { opacity: 1; }
}

@keyframes agent-os-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .agent-os-workflow-header,
  .agent-os-timeline__node-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .agent-os-timeline-state--failed {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .agent-os-timeline-retry {
    margin-left: 30px;
  }
}
</style>
