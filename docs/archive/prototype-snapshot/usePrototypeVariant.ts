// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
// Self-contained variant switcher. Not a Pinia store: variant state is a
// dev-only UI setting, not domain state. Survives reload via sessionStorage,
// survives back/forward via popstate, never pollutes history (replaceState).
import { onMounted, onUnmounted, ref } from "vue";

export type PrototypeVariant = "A" | "B" | "C";

const VALID: PrototypeVariant[] = ["A", "B", "C"];
const STORAGE_KEY = "ac.prototype.variant";
const URL_PARAM = "variant";

function isValid(value: string | null): value is PrototypeVariant {
  return value !== null && (VALID as string[]).includes(value);
}

function readFromUrl(): PrototypeVariant | null {
  const search = window.location.search;
  if (!search) return null;
  const params = new URLSearchParams(search);
  const value = params.get(URL_PARAM);
  return isValid(value) ? value : null;
}

function readFromStorage(): PrototypeVariant | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return isValid(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeToStorage(variant: PrototypeVariant): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // sessionStorage may be unavailable (private mode); ignore.
  }
}

function syncUrl(variant: PrototypeVariant): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) !== variant) {
    url.searchParams.set(URL_PARAM, variant);
    history.replaceState(history.state, "", url.toString());
  }
}

export function usePrototypeVariant() {
  const variant = ref<PrototypeVariant>("A");
  const labels: Record<PrototypeVariant, string> = {
    A: "A — Compact scan · no detail",
    B: "B — Three columns · status funnel",
    C: "C — Master-detail · docked"
  };

  function resolve(): PrototypeVariant {
    return readFromUrl() ?? readFromStorage() ?? "A";
  }

  function set(next: PrototypeVariant): void {
    if (!isValid(next) || next === variant.value) return;
    variant.value = next;
    writeToStorage(next);
    syncUrl(next);
  }

  function onPopState(): void {
    const resolved = resolve();
    if (resolved !== variant.value) variant.value = resolved;
  }

  onMounted(() => {
    variant.value = resolve();
    writeToStorage(variant.value);
    syncUrl(variant.value);
    window.addEventListener("popstate", onPopState);
  });

  onUnmounted(() => {
    window.removeEventListener("popstate", onPopState);
  });

  return { variant, set, labels, variants: VALID };
}
