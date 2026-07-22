import { hasBusinessCapability, type BusinessCapability, type UserRole } from "@amazon-monitor/shared";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useSessionStore } from "../stores/session";

export function canWriteForRole(
  role: UserRole | null,
  capability: BusinessCapability = "manage_workflow"
): boolean {
  return role !== null && hasBusinessCapability(role, capability);
}

export function useWriteAccess(capability: BusinessCapability = "manage_workflow") {
  const { role } = storeToRefs(useSessionStore());
  const canWrite = computed(() => canWriteForRole(role.value, capability));
  return { canWrite };
}
