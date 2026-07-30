import type { Pinia, PiniaPlugin, StateTree } from "pinia";
import { getActivePinia } from "pinia";
import { isRef, toRaw } from "vue";

type StoreResetter = () => void;

const resettersByPinia = new WeakMap<Pinia, Set<StoreResetter>>();

function cloneState(state: StateTree): StateTree {
  return structuredClone(toCloneable(state)) as StateTree;
}

function toCloneable(value: unknown): unknown {
  if (isRef(value)) return toCloneable(value.value);
  const raw = typeof value === "object" && value !== null ? toRaw(value) : value;
  if (Array.isArray(raw)) return raw.map(toCloneable);
  if (raw instanceof Date) return new Date(raw);
  if (isPlainRecord(raw)) {
    return Object.fromEntries(
      Object.entries(raw).map(([key, entry]) => [key, toCloneable(entry)]),
    );
  }
  return raw;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function createSessionStoreResetPlugin(): PiniaPlugin {
  return ({ pinia, store }) => {
    if (store.$id === "session") return;

    const initialState = cloneState(store.$state);
    const reset = () => store.$patch(cloneState(initialState));
    const resetters = resettersByPinia.get(pinia) ?? new Set<StoreResetter>();
    resetters.add(reset);
    resettersByPinia.set(pinia, resetters);

    const dispose = store.$dispose;
    store.$dispose = () => {
      resetters.delete(reset);
      dispose();
    };
  };
}

export function resetSessionScopedStores(): void {
  const pinia = getActivePinia();
  if (!pinia) return;

  for (const reset of resettersByPinia.get(pinia) ?? []) {
    reset();
  }
}
