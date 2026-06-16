import { ref } from "vue";

export function useAuthGuard(reloadCurrentView: () => Promise<void>) {
  const showAuthModal = ref(false);
  const passwordInput = ref("");
  const authError = ref("");

  function handleUnauthorized() {
    showAuthModal.value = true;
  }

  async function handleAuthSubmit() {
    if (!passwordInput.value.trim()) {
      authError.value = "请输入 API 访问密码。";
      return;
    }

    localStorage.setItem("amazon_monitor_auth_token", passwordInput.value.trim());
    authError.value = "";

    try {
      await reloadCurrentView();
      showAuthModal.value = false;
      passwordInput.value = "";
    } catch (error) {
      localStorage.removeItem("amazon_monitor_auth_token");
      authError.value = error instanceof Error ? error.message : "验证失败，请检查密码后重试。";
    }
  }

  return {
    showAuthModal,
    passwordInput,
    authError,
    handleUnauthorized,
    handleAuthSubmit
  };
}
