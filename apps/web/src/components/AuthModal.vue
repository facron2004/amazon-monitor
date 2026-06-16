<script setup lang="ts">
interface Props {
  visible: boolean;
  passwordInput: string;
  authError: string;
}

interface Emits {
  (e: "update:password-input", value: string): void;
  (e: "submit"): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div v-if="visible" class="auth-overlay">
    <div class="auth-card">
      <div class="auth-header">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lucide lucide-lock"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h3>安全访问校验</h3>
      </div>
      <p>当前看板已开启访问保护，请输入 API 密码后继续。</p>
      <form class="auth-form" @submit.prevent="emit('submit')">
        <div class="form-group">
          <input
            :value="passwordInput"
            type="password"
            placeholder="API 密码"
            class="auth-input"
            required
            autofocus
            @input="emit('update:password-input', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <p v-if="authError" class="auth-error-msg">{{ authError }}</p>
        <button type="submit" class="primary auth-submit-btn">验证访问</button>
      </form>
    </div>
  </div>
</template>
