<script setup lang="ts">
import { computed } from "vue";
import { ElTag } from "element-plus";
import { Flame, ShieldAlert, Sparkles, TicketPercent } from "@lucide/vue";
import type { InsightEvent } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../../stores/insightEvents";
import {
  asinLeaderboardLabels,
  buildAsinLeaderboards,
  type AsinLeaderboardEntry,
  type AsinLeaderboardKind
} from "../../utils/actionCenterLeaderboards";

const props = defineProps<{
  groups: AsinGroupedView[];
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

const boards = computed(() => buildAsinLeaderboards(props.groups));

const boardMeta: Array<{
  kind: AsinLeaderboardKind;
  icon: typeof Flame;
  tone: string;
}> = [
  { kind: "opportunity", icon: Flame, tone: "is-opportunity" },
  { kind: "risk", icon: ShieldAlert, tone: "is-risk" },
  { kind: "newBreakout", icon: Sparkles, tone: "is-breakout" },
  { kind: "promoAnomaly", icon: TicketPercent, tone: "is-promo" }
];

function entriesFor(kind: AsinLeaderboardKind): AsinLeaderboardEntry[] {
  return boards.value[kind];
}

function onSelect(entry: AsinLeaderboardEntry): void {
  emit("select", entry.representative);
}
</script>

<template>
  <section v-if="groups.length" class="leaderboard-panel">
    <header class="leaderboard-head">
      <div>
        <span>评分榜单</span>
        <h3>机会 / 风险 / 新品 / 促销</h3>
      </div>
      <small>基于当前筛选后的 ASIN 案件，最多展示 Top 5</small>
    </header>

    <div class="leaderboard-grid">
      <article v-for="meta in boardMeta" :key="meta.kind" :class="['board-card', meta.tone]">
        <div class="board-title">
          <component :is="meta.icon" :size="15" />
          <strong>{{ asinLeaderboardLabels[meta.kind] }}</strong>
          <ElTag size="small" effect="plain" round>{{ entriesFor(meta.kind).length }}</ElTag>
        </div>

        <ol v-if="entriesFor(meta.kind).length" class="board-list">
          <li v-for="(entry, index) in entriesFor(meta.kind)" :key="`${meta.kind}-${entry.asin}`">
            <button type="button" class="board-row" @click="onSelect(entry)">
              <span class="rank">{{ index + 1 }}</span>
              <span class="meta">
                <strong>{{ entry.brand }} / {{ entry.asin }}</strong>
                <small>{{ entry.reasons.slice(0, 2).join(" · ") || "暂无解释" }}</small>
              </span>
              <span class="score">{{ entry.score }}</span>
            </button>
          </li>
        </ol>
        <p v-else class="board-empty">当前筛选下暂无上榜 ASIN</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.leaderboard-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.leaderboard-head {
  align-items: end;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.leaderboard-head span,
.leaderboard-head small,
.board-empty {
  color: #64748b;
  font-size: 12px;
}

.leaderboard-head h3 {
  color: #0f172a;
  font-size: 16px;
  margin: 3px 0 0;
}

.leaderboard-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.board-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.board-card.is-opportunity {
  border-color: #bbf7d0;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fafc 70%);
}

.board-card.is-risk {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fef2f2 0%, #f8fafc 70%);
}

.board-card.is-breakout {
  border-color: #fde68a;
  background: linear-gradient(180deg, #fffbeb 0%, #f8fafc 70%);
}

.board-card.is-promo {
  border-color: #c7d2fe;
  background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 70%);
}

.board-title {
  align-items: center;
  color: #0f172a;
  display: flex;
  gap: 6px;
}

.board-title strong {
  flex: 1;
  font-size: 13px;
}

.board-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.board-row {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 8px;
  text-align: left;
  width: 100%;
}

.board-row:hover {
  border-color: #94a3b8;
}

.rank {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  min-width: 1.2em;
}

.meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.meta strong {
  color: #0f172a;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta small {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.board-empty {
  margin: 0;
  padding: 8px 2px;
}

@media (max-width: 1280px) {
  .leaderboard-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .leaderboard-grid,
  .leaderboard-head {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>