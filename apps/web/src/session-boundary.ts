import { resetSessionScopedStores } from "./stores/session-store-reset";

export interface SessionCacheIdentity {
  organizationId: number;
  userId: number;
}

type SessionBoundaryListener = () => void;

let generation = 0;
let namespace = `anonymous:${generation}`;
const listeners = new Set<SessionBoundaryListener>();

export function getSessionCacheNamespace(): string {
  return namespace;
}

export function beginSessionBoundary(identity: SessionCacheIdentity | null): void {
  generation += 1;
  namespace = identity
    ? `organization:${identity.organizationId}:user:${identity.userId}:generation:${generation}`
    : `anonymous:${generation}`;

  resetSessionScopedStores();
  for (const listener of listeners) {
    listener();
  }
}

export function registerSessionBoundaryListener(listener: SessionBoundaryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
