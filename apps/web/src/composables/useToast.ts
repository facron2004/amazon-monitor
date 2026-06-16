import { ref } from "vue";

export type ToastType = "success" | "danger";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  fadingOut?: boolean;
}

const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;

export function useToast() {
  function showToast(message: string, type: ToastType = "success") {
    const id = ++toastIdCounter;
    toasts.value.push({ id, message, type });

    setTimeout(() => {
      const t = toasts.value.find((item) => item.id === id);
      if (t) t.fadingOut = true;
      setTimeout(() => {
        toasts.value = toasts.value.filter((item) => item.id !== id);
      }, 300);
    }, 4000);
  }

  return {
    toasts,
    showToast
  };
}
