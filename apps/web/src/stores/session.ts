import type { Organization, SessionContext, User } from "@amazon-monitor/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { login as apiLogin, logout as apiLogout, fetchMe, registerBootstrapAdmin as apiRegisterBootstrapAdmin } from "../api-auth";

const LEGACY_TOKEN_KEY = "amazon_monitor_auth_token";
const SESSION_TOKEN_KEY = "amazon_monitor_session";

export const useSessionStore = defineStore("session", () => {
  const user = ref<User | null>(null);
  const organization = ref<Organization | null>(null);
  const expiresAt = ref<string | null>(null);
  const sessionToken = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const role = computed(() => user.value?.role ?? null);
  const isAdmin = computed(() => role.value === "admin");

  function readLegacyToken(): string | null {
    try {
      return localStorage.getItem(LEGACY_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function readSessionToken(): string | null {
    return sessionToken.value;
  }

  function setStoredSessionToken(token: string | null) {
    sessionToken.value = token;
    try {
      if (token) {
        localStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }

  function setContext(ctx: SessionContext, token: string) {
    user.value = ctx.user;
    organization.value = ctx.organization;
    expiresAt.value = ctx.expiresAt;
    setStoredSessionToken(token);
  }

  function clearContext() {
    user.value = null;
    organization.value = null;
    expiresAt.value = null;
    setStoredSessionToken(null);
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // ignore storage failures
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await apiLogin(username, password);
      setContext(result.context, result.token);
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
      setContext(result.context, result.token);
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function refreshMe(): Promise<boolean> {
    const token = readSessionToken() ?? readLegacyToken();
    try {
      const ctx = await fetchMe(token);
      user.value = ctx.user;
      organization.value = ctx.organization;
      expiresAt.value = ctx.expiresAt;
      return true;
    } catch {
      clearContext();
      return false;
    }
  }

  async function logout(): Promise<void> {
    const token = readSessionToken() ?? readLegacyToken();
    try {
      await apiLogout(token);
    } catch {
      // ignore — best effort
    }
    clearContext();
  }

  return {
    user,
    organization,
    expiresAt,
    sessionToken,
    loading,
    error,
    isAuthenticated,
    role,
    isAdmin,
    readLegacyToken,
    readSessionToken,
    setContext,
    clearContext,
    login,
    registerBootstrapAdmin,
    refreshMe,
    logout
  };
});
