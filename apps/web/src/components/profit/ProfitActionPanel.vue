<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElOption, ElSelect, ElTag } from "element-plus";
import { ClipboardPlus, ShieldCheck } from "@lucide/vue";
import {
  buildProductProfitActionOptions,
  type ProductProfitPlan,
  type ProfitActionKind
} from "@amazon-monitor/shared";
import { formatMarketplaceMoney } from "../../utils/marketplace-money";

const props = defineProps<{
  plan: ProductProfitPlan;
  canManageWorkflow: boolean;
  creating: boolean;
  taskIdsByAction: Record<string, number>;
}>();

const emit = defineEmits<{
  create: [actionKind: ProfitActionKind];
}>();

const selectedActionKind = ref<ProfitActionKind>("target_margin");
const actionOptions = computed(() => buildProductProfitActionOptions(props.plan));
const selectedAction = computed(() =>
  actionOptions.value.find((option) => option.kind === selectedActionKind.value) ?? null
);
const taskKey = computed(() => `${props.plan.productId}:${selectedActionKind.value}`);
const taskId = computed(() => props.taskIdsByAction[taskKey.value]);

watch(
  () => props.plan.productId,
  () => {
    selectedActionKind.value = actionOptions.value.find((option) => option.safe)?.kind ?? "target_margin";
  },
  { immediate: true }
);

function formatMoney(value: number | null): string {
  return formatMarketplaceMoney(value, props.plan.marketplace);
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}
</script>

<template>
  <section class="profit-section profit-action">
    <div class="profit-action__head">
      <div>
        <span>人工确认行动</span>
        <h3>价格与活动建议</h3>
      </div>
      <ElTag type="warning" effect="plain">不自动执行</ElTag>
    </div>

    <ElSelect v-model="selectedActionKind" class="profit-action__select" aria-label="选择价格行动情景">
      <ElOption
        v-for="option in actionOptions"
        :key="option.kind"
        :label="`${option.label} · ${formatMoney(option.price)} · ${formatPercent(option.marginRate)}`"
        :value="option.kind"
        :disabled="!option.safe"
      />
    </ElSelect>

    <p v-if="selectedAction?.safe">
      拟执行价格 {{ formatMoney(selectedAction.price) }}，预计毛利率
      {{ formatPercent(selectedAction.marginRate) }}。执行前仍需补齐竞品到手价并核对库存与广告策略。
    </p>
    <p v-else class="profit-action__blocked">
      {{ selectedAction?.blockedReasons.join("；") || "当前没有可执行的安全情景。" }}
    </p>

    <div class="profit-action__boundary">
      <ShieldCheck :size="16" />
      <span>低于最低安全价或最低毛利率的情景已禁用；任务不会自动改价、创建活动或调整广告。</span>
    </div>

    <ElButton
      v-if="canManageWorkflow && selectedAction?.safe && !taskId"
      type="primary"
      :loading="creating"
      @click="emit('create', selectedAction.kind)"
    >
      <template #icon><ClipboardPlus :size="14" /></template>
      转价格评审任务
    </ElButton>
    <ElTag v-else-if="taskId" type="success" effect="plain">
      已创建任务 #{{ taskId }}
    </ElTag>
  </section>
</template>
