import type { TabKey } from "../constants/tabs";

export interface AppViewLoaders {
  overview(signal?: AbortSignal): Promise<void>;
  categories(signal?: AbortSignal): Promise<void>;
  keywords(signal?: AbortSignal): Promise<void>;
  competitors(signal?: AbortSignal): Promise<void>;
  products(signal?: AbortSignal): Promise<void>;
  inventory(signal?: AbortSignal): Promise<void>;
  profit(signal?: AbortSignal): Promise<void>;
  "listing-health"(signal?: AbortSignal): Promise<void>;
  ads(signal?: AbortSignal): Promise<void>;
  "review-voc"(signal?: AbortSignal): Promise<void>;
  "action-center"(signal?: AbortSignal): Promise<void>;
  "ai-agents"(signal?: AbortSignal): Promise<void>;
  tasks(signal?: AbortSignal): Promise<void>;
  promotions(signal?: AbortSignal): Promise<void>;
  sops(signal?: AbortSignal): Promise<void>;
  rules(signal?: AbortSignal): Promise<void>;
  "data-sources"(signal?: AbortSignal): Promise<void>;
  alerts(signal?: AbortSignal): Promise<void>;
  reports(signal?: AbortSignal): Promise<void>;
  notifications(signal?: AbortSignal): Promise<void>;
  logs(signal?: AbortSignal): Promise<void>;
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
 *
 * The optional `signal` is forwarded to the tab-specific loader so callers
 * (e.g. `useAppController`) can cancel in-flight requests when switching tabs.
 */
export async function loadAppView(
  activeTab: TabKey,
  loaders: AppViewLoaders,
  date: string,
  force = false,
  signal?: AbortSignal
): Promise<{ cached: boolean }> {
  const entry = cache.get(activeTab);
  if (!force && entry && entry.date === date && Date.now() - entry.loadedAt < CACHE_TTL_MS) {
    return { cached: true };
  }

  await loaders[activeTab](signal);
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
