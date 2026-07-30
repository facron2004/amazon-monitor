import { createApp, ref } from "vue";
import { createPinia, defineStore, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@amazon-monitor/shared";
import { getSessionCacheNamespace } from "../session-boundary";
import { useSessionStore } from "./session";
import { createSessionStoreResetPlugin } from "./session-store-reset";

const useTestDomainStore = defineStore("session-reset-test-domain", {
  state: () => ({ rows: [] as string[] })
});
const useSetupDomainStore = defineStore("session-reset-setup-domain", () => {
  const rows = ref<Array<{ labels: string[] }>>([]);
  return { rows };
});

function createContext(organizationId: number, userId: number): SessionContext {
  return {
    user: {
      id: userId,
      orgId: organizationId,
      username: `user-${userId}`,
      role: "admin",
      displayName: null,
      email: null,
      status: "active",
      lastLoginAt: null,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z"
    },
    organization: {
      id: organizationId,
      name: `Organization ${organizationId}`,
      plan: "team",
      status: "active",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z"
    },
    expiresAt: "2026-08-11T00:00:00.000Z"
  };
}

describe("session store reset plugin", () => {
  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(createSessionStoreResetPlugin());
    createApp({}).use(pinia);
    setActivePinia(pinia);
  });

  it("clears domain state and advances the namespace on organization change and logout", () => {
    const domainStore = useTestDomainStore();
    const sessionStore = useSessionStore();

    sessionStore.setContext(createContext(1, 10));
    domainStore.rows = ["organization-a-only"];

    sessionStore.setContext(createContext(2, 20));
    expect(domainStore.rows).toEqual([]);
    expect(getSessionCacheNamespace()).toContain("organization:2:user:20");

    domainStore.rows = ["organization-b-only"];
    sessionStore.clearContext();
    expect(domainStore.rows).toEqual([]);
    expect(getSessionCacheNamespace()).toMatch(/^anonymous:/);
  });

  it("clones setup-store arrays after Vue has made them reactive", () => {
    const setupStore = useSetupDomainStore();
    const sessionStore = useSessionStore();
    setupStore.rows = [{ labels: ["agent"] }];

    sessionStore.clearContext();

    expect(setupStore.rows).toEqual([]);
  });
});
