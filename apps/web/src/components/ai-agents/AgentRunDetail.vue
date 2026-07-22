<script setup lang="ts">
import { ElButton, ElTag, ElTooltip } from "element-plus";
import { Bot, CheckCircle2, Clock3, ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlert } from "@lucide/vue";
import type { AiActionFeedbackValue, AiRun } from "@amazon-monitor/shared";
import { agentLabels, formatAgentRunTime, priorityTypes, statusTypes } from "./ai-agent-display";
import AgentActionTaskButton from "../AgentActionTaskButton.vue";
import ListingRewriteDraftPanel from "../listing-health/ListingRewriteDraftPanel.vue";
import ReviewVocArtifactPanel from "../review-voc/ReviewVocArtifactPanel.vue";
import AdsOptimizationArtifactPanel from "../ads/AdsOptimizationArtifactPanel.vue";
import { useWriteAccess } from "../../composables/useWriteAccess";

const { canWrite } = useWriteAccess("manage_workflow");

defineProps<{
  run: AiRun | null;
  feedbackLoadingKey: string | null;
}>();

defineEmits<{
  feedback: [runId: number, actionIndex: number, value: AiActionFeedbackValue];
}>();
</script>

<template>
  <aside class="panel agent-detail-panel">
    <div v-if="!run" class="empty-state">
      <Bot :size="28" />
      <p>No Agent run selected.</p>
    </div>
    <template v-else>
      <div class="panel-head">
        <div>
          <h2>{{ agentLabels[run.agentType] }}</h2>
          <span>{{ run.model }}</span>
        </div>
        <ElTag :type="statusTypes[run.status]" effect="light">{{ run.status }}</ElTag>
      </div>

      <section class="agent-detail-grid">
        <div>
          <span>Run id</span>
          <strong>#{{ run.id }}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{{ formatAgentRunTime(run.createdAt) }}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{{ run.output ? `${Math.round(run.output.confidence * 100)}%` : "-" }}</strong>
        </div>
        <div>
          <span>Actions</span>
          <strong>{{ run.output?.recommended_actions.length ?? 0 }}</strong>
        </div>
      </section>

      <section v-if="run.errorMessage" class="agent-failure">
        <TriangleAlert :size="16" />
        <p>{{ run.errorMessage }}</p>
      </section>

      <template v-if="run.output">
        <section class="agent-output-section">
          <h3><CheckCircle2 :size="15" /> Summary</h3>
          <p>{{ run.output.summary }}</p>
        </section>

        <section class="agent-output-section">
          <h3><Clock3 :size="15" /> Evidence</h3>
          <ul>
            <li v-for="item in run.output.evidence" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section v-if="run.output.artifacts?.listingRewrite" class="agent-output-section">
          <ListingRewriteDraftPanel :draft="run.output.artifacts.listingRewrite" />
        </section>

        <section v-if="run.output.artifacts?.reviewVoc" class="agent-output-section">
          <ReviewVocArtifactPanel :artifact="run.output.artifacts.reviewVoc" />
        </section>

        <section v-if="run.output.artifacts?.adsOptimization" class="agent-output-section">
          <AdsOptimizationArtifactPanel :artifact="run.output.artifacts.adsOptimization" />
        </section>

        <section class="agent-output-section">
          <h3><ShieldCheck :size="15" /> Approval-gated actions</h3>
          <div v-if="run.output.recommended_actions.length" class="agent-actions">
            <article v-for="(action, actionIndex) in run.output.recommended_actions" :key="`${action.priority}:${action.action}`">
              <ElTag size="small" :type="priorityTypes[action.priority]">{{ action.priority }}</ElTag>
              <strong>{{ action.action }}</strong>
              <p>{{ action.reason }}</p>
              <small>{{ action.risk }}</small>
              <AgentActionTaskButton
                :run-id="run.id"
                :agent-type="run.agentType"
                :output="run.output"
                :action="action"
              />
              <div v-if="canWrite" class="agent-action-feedback" aria-label="AI 建议反馈">
                <span>这个建议有帮助吗？</span>
                <ElTooltip content="有帮助" placement="top">
                  <ElButton
                    circle
                    size="small"
                    :loading="feedbackLoadingKey === `${run.id}:${actionIndex}`"
                    :type="run.actionFeedback.find((item) => item.actionIndex === actionIndex)?.value === 'up' ? 'primary' : 'default'"
                    aria-label="点赞 AI 建议"
                    @click="$emit('feedback', run.id, actionIndex, 'up')"
                  >
                    <ThumbsUp :size="14" />
                  </ElButton>
                </ElTooltip>
                <ElTooltip content="没有帮助" placement="top">
                  <ElButton
                    circle
                    size="small"
                    :disabled="feedbackLoadingKey === `${run.id}:${actionIndex}`"
                    :type="run.actionFeedback.find((item) => item.actionIndex === actionIndex)?.value === 'down' ? 'danger' : 'default'"
                    aria-label="点踩 AI 建议"
                    @click="$emit('feedback', run.id, actionIndex, 'down')"
                  >
                    <ThumbsDown :size="14" />
                  </ElButton>
                </ElTooltip>
              </div>
            </article>
          </div>
          <p v-else class="agent-muted">No recommended action.</p>
        </section>

        <details class="agent-context">
          <summary>Input context</summary>
          <pre>{{ run.inputContextJson }}</pre>
        </details>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.agent-detail-panel {
  min-width: 0;
}

.agent-detail-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 14px;
}

.agent-detail-grid div {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
}

.agent-detail-grid span,
.agent-output-section small {
  color: #64748b;
  font-size: 12px;
}

.agent-detail-grid strong {
  color: #0f172a;
}

.agent-failure,
.agent-output-section h3 {
  align-items: center;
  display: flex;
}

.agent-failure {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  color: #9a3412;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
}

.agent-failure p,
.agent-output-section p {
  margin: 0;
}

.agent-output-section {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 10px;
  padding: 14px 0;
}

.agent-output-section h3 {
  color: #0f172a;
  font-size: 13px;
  gap: 6px;
  margin: 0;
  text-transform: uppercase;
}

.agent-output-section ul {
  color: #475569;
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
}

.agent-actions {
  display: grid;
  gap: 10px;
}

.agent-actions article {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 10px;
}

.agent-actions strong {
  color: #0f172a;
}

.agent-action-feedback {
  align-items: center;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 6px;
  margin-top: 2px;
  padding-top: 8px;
}

.agent-action-feedback span {
  color: #64748b;
  font-size: 12px;
  margin-right: auto;
}

.agent-muted {
  color: #64748b;
}

.agent-context {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.agent-context summary {
  color: #0f172a;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.agent-context pre {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  max-height: 280px;
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .agent-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
