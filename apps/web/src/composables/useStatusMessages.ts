import { onUnmounted, ref } from "vue";
import type { ToastType } from "./useToast";

interface UseStatusMessagesOptions {
  showToast(message: string, type: ToastType): void;
}

export function useStatusMessages(options: UseStatusMessagesOptions) {
  const actionMessage = ref("");
  const errorMessage = ref("");
  let actionTimer: ReturnType<typeof setTimeout> | null = null;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  function setAction(message: string) {
    actionMessage.value = message;
    if (actionTimer) {
      clearTimeout(actionTimer);
    }
    actionTimer = setTimeout(() => {
      actionMessage.value = "";
    }, 5000);
    options.showToast(message, "success");
  }

  function setError(message: string) {
    errorMessage.value = message;
    if (errorTimer) {
      clearTimeout(errorTimer);
    }
    errorTimer = setTimeout(() => {
      errorMessage.value = "";
    }, 8000);
    options.showToast(message, "danger");
  }

  function clearMessages() {
    actionMessage.value = "";
    errorMessage.value = "";
  }

  onUnmounted(() => {
    if (actionTimer) {
      clearTimeout(actionTimer);
    }
    if (errorTimer) {
      clearTimeout(errorTimer);
    }
  });

  return {
    actionMessage,
    errorMessage,
    setAction,
    setError,
    clearMessages
  };
}
