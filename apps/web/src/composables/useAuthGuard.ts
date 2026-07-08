import { ref } from "vue";
import { useSessionStore } from "../stores/session";

export function useAuthGuard(reloadCurrentView: () => Promise<void>) {
  const sessionStore = useSessionStore();
  const showAuthModal = ref(true);
  const mode = ref<"login" | "register">("login");
  const usernameInput = ref("admin");
  const passwordInput = ref("");
  const authError = ref("");

  function handleUnauthorized() {
    showAuthModal.value = true;
  }

  async function handleAuthSubmit() {
    authError.value = "";
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      authError.value = "请输入用户名和密码。";
      return;
    }

    try {
      if (mode.value === "register") {
        const ok = await sessionStore.registerBootstrapAdmin(username, password);
        if (!ok) {
          authError.value = sessionStore.error ?? "注册失败。";
          return;
        }
      } else {
        const ok = await sessionStore.login(username, password);
        if (!ok) {
          authError.value = sessionStore.error ?? "登录失败。";
          return;
        }
      }

      await reloadCurrentView();
      showAuthModal.value = false;
      passwordInput.value = "";
    } catch (error) {
      authError.value = error instanceof Error ? error.message : String(error);
    }
  }

  function switchMode(next: "login" | "register") {
    mode.value = next;
    authError.value = "";
  }

  return {
    showAuthModal,
    mode,
    usernameInput,
    passwordInput,
    authError,
    handleUnauthorized,
    handleAuthSubmit,
    switchMode
  };
}
