import type { Organization, SessionContext, User } from "@amazon-monitor/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { login as apiLogin, logout as apiLogout, fetchMe, registerBootstrapAdmin as apiRegisterBootstrapAdmin } from "../api-auth";
import { beginSessionBoundary } from "../session-boundary";

export const useSessionStore = defineStore("session", () => {
  const user = ref<User | null>(null);
  const organization = ref<Organization | null>(null);
  const expiresAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const role = computed(() => user.value?.role ?? null);
  const isAdmin = computed(() => role.value === "admin");

  function applyContext(ctx: SessionContext) {
    beginSessionBoundary({
      organizationId: ctx.organization.id,
      userId: ctx.user.id
    });
    user.value = ctx.user;
    organization.value = ctx.organization;
    expiresAt.value = ctx.expiresAt;
  }

  function setContext(ctx: SessionContext) {
    applyContext(ctx);
  }

  function clearContext() {
    beginSessionBoundary(null);
    user.value = null;
    organization.value = null;
    expiresAt.value = null;
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await apiLogin(username, password);
      setContext(result.context);
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function registerBootstrapAdmin(username: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await apiRegisterBootstrapAdmin(username, password);
      setContext(result.context);
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function refreshMe(): Promise<boolean> {
    try {
      const ctx = await fetchMe();
      applyContext(ctx);
      return true;
    } catch {
      clearContext();
      return false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } catch {
      // ignore — best effort
    }
    clearContext();
  }

  return {
    user,
    organization,
    expiresAt,
    loading,
    error,
    isAuthenticated,
    role,
    isAdmin,
    setContext,
    clearContext,
    login,
    registerBootstrapAdmin,
    refreshMe,
    logout
  };
});
