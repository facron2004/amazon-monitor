<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, CheckCircle2, Sparkles } from "@lucide/vue";
import { ElSkeleton, ElTag } from "element-plus";
import type { AiCompetitorAnalysisResponse } from "@amazon-monitor/shared";
import { useWriteAccess } from "../../composables/useWriteAccess";

const { canWrite } = useWriteAccess();

const props = defineProps<{
  analysis: AiCompetitorAnalysisResponse | null;
  loading: boolean;
  error: string;
}>();

defineEmits<{
  (event: "analyze"): void;
}>();

const confidencePercent = computed(() => {
  if (!props.analysis) return 0;
  return Math.round(props.analysis.output.confidence * 100);
});
</script>

<template>
  <section class="competitor-agent">
    <div class="competitor-agent__head">
      <div>
        <span>AI Agent</span>
        <h3>Competitor analyst</h3>
      </div>
      <button class="competitor-agent__run" type="button" :disabled="loading || !canWrite" @click="$emit('analyze')">
        <Sparkles :size="15" />
        <span>{{ loading ? "Analyzing" : analysis ? "Refresh" : "Analyze" }}</span>
      </button>
    </div>

    <ElSkeleton v-if="loading" animated :rows="3" />

    <p v-else-if="error" class="competitor-agent__error">
      <AlertCircle :size="15" />
      <span>{{ error }}</span>
    </p>

    <div v-else-if="analysis" class="competitor-agent__body">
      <div class="competitor-agent__summary">
        <CheckCircle2 :size="17" />
        <div>
          <strong>{{ analysis.output.summary }}</strong>
          <p>{{ analysis.output.impact }}</p>
        </div>
        <ElTag effect="plain" round>{{ confidencePercent }}%</ElTag>
      </div>

      <div class="competitor-agent__block">
        <span>Evidence</span>
        <ul>
          <li v-for="item in analysis.output.evidence.slice(0, 4)" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="competitor-agent__block">
        <span>Approval-gated actions</span>
        <ol>
          <li v-for="action in analysis.output.recommended_actions" :key="action.action">
            <div>
              <strong>{{ action.action }}</strong>
              <small>{{ action.reason }}</small>
            </div>
            <ElTag size="small" effect="light" round>{{ action.priority }}</ElTag>
          </li>
        </ol>
      </div>
    </div>

    <p v-else class="competitor-agent__empty">
      Run the competitor analyst on this signal before changing price, promo, ads, or listing work.
    </p>
  </section>
</template>

<style scoped>
.competitor-agent {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
}

.competitor-agent__head,
.competitor-agent__summary,
.competitor-agent__block li {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.competitor-agent__head > div > span,
.competitor-agent__block > span {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.competitor-agent__head h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.competitor-agent__run {
  align-items: center;
  background: #0f172a;
  border: 1px solid #0f172a;
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  gap: 7px;
  padding: 8px 10px;
}

.competitor-agent__run:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.competitor-agent__error,
.competitor-agent__empty {
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

.competitor-agent__error {
  align-items: center;
  color: #b42318;
  display: flex;
  gap: 7px;
}

.competitor-agent__body {
  display: grid;
  gap: 12px;
}

.competitor-agent__summary {
  align-items: flex-start;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}

.competitor-agent__summary svg {
  color: #2563eb;
  flex: 0 0 auto;
  margin-top: 2px;
}

.competitor-agent__summary div {
  min-width: 0;
}

.competitor-agent__summary strong,
.competitor-agent__block strong {
  color: #0f172a;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.competitor-agent__summary p,
.competitor-agent__block small {
  color: #64748b;
  display: block;
  font-size: 12px;
  line-height: 1.55;
  margin: 5px 0 0;
}

.competitor-agent__block {
  display: grid;
  gap: 8px;
}

.competitor-agent__block ul,
.competitor-agent__block ol {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.competitor-agent__block li {
  align-items: flex-start;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  padding: 9px 10px;
}

.competitor-agent__block li > div {
  min-width: 0;
}
</style>
