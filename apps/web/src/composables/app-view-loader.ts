import type { TabKey } from "../constants/tabs";

export interface AppViewLoaders {
  overview(): Promise<void>;
  categories(): Promise<void>;
  keywords(): Promise<void>;
  competitors(): Promise<void>;
  alerts(): Promise<void>;
  reports(): Promise<void>;
  notifications(): Promise<void>;
  logs(): Promise<void>;
}

interface CacheEntry {
  loadedAt: number;
  date: string;
}

/** Cache TTL in milliseconds — data loaded within this window is reused instead of refetched. */
const CACHE_TTL_MS = 30_000;

const cache = new Map<TabKey, CacheEntry>();

/**
 * Load data for the active tab, using a TTL cache keyed by (tab + date).
 * If the same tab+date was loaded within CACHE_TTL_MS and `force` is false, the fetch is skipped.
 */
export async function loadAppView(
  activeTab: TabKey,
  loaders: AppViewLoaders,
  date: string,
  force = false
): Promise<{ cached: boolean }> {
  const entry = cache.get(activeTab);
  if (!force && entry && entry.date === date && Date.now() - entry.loadedAt < CACHE_TTL_MS) {
    return { cached: true };
  }

  await loaders[activeTab]();
  cache.set(activeTab, { loadedAt: Date.now(), date });
  return { cached: false };
}

/** Clear the cache (e.g., after a write operation like collection or creation). */
export function clearViewCache(tab?: TabKey): void {
  if (tab) {
    cache.delete(tab);
  } else {
    cache.clear();
  }
}
