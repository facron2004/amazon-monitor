<script setup lang="ts">
import { computed } from "vue";
import { Activity, ArrowRight, Database, Layers, LockKeyhole, ShieldCheck, UserRound } from "@lucide/vue";

interface Props {
  visible: boolean;
  usernameInput: string;
  passwordInput: string;
  authError: string;
  loading?: boolean;
  mode?: "login" | "register";
}

interface Emits {
  (e: "update:username-input", value: string): void;
  (e: "update:password-input", value: string): void;
  (e: "submit"): void;
  (e: "switch-mode", value: "login" | "register"): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  mode: "login"
});
const emit = defineEmits<Emits>();

const title = computed(() => (props.mode === "register" ? "创建管理员账号" : "登录监控台"));
const copy = computed(() =>
  props.mode === "register"
    ? "首次初始化会替换默认管理员，并在创建后自动进入看板。"
    : "使用管理员或运营账号进入类目、关键词和竞品复盘。"
);
const submitLabel = computed(() => {
  if (props.loading) return props.mode === "register" ? "正在创建" : "正在登录";
  return props.mode === "register" ? "创建并登录" : "登录";
});
</script>

<template>
  <div v-if="visible" class="auth-overlay">
    <div class="auth-shell" role="dialog" aria-modal="true" :aria-label="title">
      <section class="auth-brand-panel">
        <div class="auth-brand">
          <span class="auth-brand-mark">
            <Database :size="24" />
          </span>
          <div>
            <strong>亚马逊运营监控台</strong>
            <span>采集、情报、行动复盘</span>
          </div>
        </div>

        <div class="auth-hero-copy">
          <p class="auth-kicker">Operation Console</p>
          <h2>把榜单变化和后续动作放回同一张工作台。</h2>
          <p>登录后继续查看类目榜单、关键词排名、竞品池和行动中心，不需要在多个工具之间切换。</p>
        </div>

        <div class="auth-signal-board" aria-label="监控台能力概览">
          <article>
            <span class="auth-signal-icon"><Activity :size="18" /></span>
            <div>
              <strong>采集状态</strong>
              <small>队列、Worker 和快照新鲜度集中查看</small>
            </div>
          </article>
          <article>
            <span class="auth-signal-icon"><Layers :size="18" /></span>
            <div>
              <strong>类目情报</strong>
              <small>榜单、品牌压力和评价增长串联复盘</small>
            </div>
          </article>
          <article>
            <span class="auth-signal-icon"><ShieldCheck :size="18" /></span>
            <div>
              <strong>行动中心</strong>
              <small>预警、任务和 SOP 形成闭环</small>
            </div>
          </article>
        </div>
      </section>

      <section class="auth-card">
        <div class="auth-header">
          <p class="auth-kicker">{{ mode === 'register' ? 'Initial Setup' : 'Secure Access' }}</p>
          <h3>{{ title }}</h3>
          <p>{{ copy }}</p>
        </div>

        <div class="auth-mode-switch" role="tablist" aria-label="登录模式">
          <button
            type="button"
            :class="{ active: mode === 'login' }"
            role="tab"
            :aria-selected="mode === 'login'"
            @click="emit('switch-mode', 'login')"
          >
            登录
          </button>
          <button
            type="button"
            :class="{ active: mode === 'register' }"
            role="tab"
            :aria-selected="mode === 'register'"
            @click="emit('switch-mode', 'register')"
          >
            初始化账号
          </button>
        </div>

        <form class="auth-form" @submit.prevent="emit('submit')">
          <label class="auth-field">
            <span>账号</span>
            <div class="auth-input-wrap">
              <UserRound :size="17" />
              <input
                :value="usernameInput"
                type="text"
                placeholder="请输入用户名"
                class="auth-input"
                required
                autocomplete="username"
                @input="emit('update:username-input', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </label>

          <label class="auth-field">
            <span>密码</span>
            <div class="auth-input-wrap">
              <LockKeyhole :size="17" />
              <input
                :value="passwordInput"
                type="password"
                placeholder="请输入密码"
                class="auth-input"
                required
                autofocus
                :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
                @input="emit('update:password-input', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </label>

          <p v-if="authError" class="auth-error-msg">{{ authError }}</p>

          <button type="submit" class="primary auth-submit-btn" :disabled="loading">
            <span>{{ submitLabel }}</span>
            <ArrowRight :size="17" />
          </button>
        </form>

        <p class="auth-footnote">
          {{ mode === 'register' ? '已有账号时请切回登录，新增成员由管理员在系统内创建。' : '首次使用请先初始化管理员账号。' }}
        </p>
      </section>
    </div>
  </div>
</template>
