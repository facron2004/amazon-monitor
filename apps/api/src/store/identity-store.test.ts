import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIdentityStore } from "./identity-store.js";
import { initSchema } from "./db.js";

let db: DatabaseSync;
let store: ReturnType<typeof createIdentityStore>;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createIdentityStore(db);
});

afterEach(() => {
  db.close();
});

describe("identity-store", () => {
  it("creates an organization and lists users (admin seeded by identity_v1 when no API key is set)", () => {
    const org = store.createOrganization({ name: "Acme Co" });
    expect(org.id).toBeGreaterThan(0);
    expect(org.plan).toBe("standard");
    // identity_v1 seeds an admin when AMAZON_MONITOR_API_KEY is unset (dev/test).
    const users = store.listUsers();
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.find((u) => u.username === "admin")).toBeDefined();
    const defaultOrgCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM organizations WHERE name = 'Default Organization'"
    ).get() as { cnt: number };
    expect(defaultOrgCount.cnt).toBe(1);
  });

  it("seeds an admin user even when the legacy API key is configured", () => {
    const originalApiKey = process.env.AMAZON_MONITOR_API_KEY;
    process.env.AMAZON_MONITOR_API_KEY = "legacy-key";
    const legacyDb = new DatabaseSync(":memory:");
    try {
      initSchema(legacyDb);
      const legacyStore = createIdentityStore(legacyDb);

      expect(legacyStore.listUsers().find((u) => u.username === "admin" && u.role === "admin")).toBeDefined();
      expect(legacyStore.listOrganizations().filter((org) => org.name === "Default Organization")).toHaveLength(1);
    } finally {
      legacyDb.close();
      if (originalApiKey) {
        process.env.AMAZON_MONITOR_API_KEY = originalApiKey;
      } else {
        delete process.env.AMAZON_MONITOR_API_KEY;
      }
    }
  });

  it("hashes passwords with scrypt and verifies the correct one", () => {
    const org = store.createOrganization({ name: "Acme" });
    const user = store.createUser({
      orgId: org.id,
      username: "alice",
      password: "correct-horse-battery",
      role: "operator"
    });
    expect(user.username).toBe("alice");
    expect(user.role).toBe("operator");

    expect(store.verifyUserCredentials("alice", "correct-horse-battery")).not.toBeNull();
    expect(store.verifyUserCredentials("alice", "wrong-password")).toBeNull();
    expect(store.verifyUserCredentials("ALICE", "correct-horse-battery")).not.toBeNull(); // case-insensitive
  });

  it("issues opaque session tokens and revokes them on logout", () => {
    const org = store.createOrganization({ name: "Acme" });
    const user = store.createUser({
      orgId: org.id,
      username: "bob",
      password: "password-1234",
      role: "developer"
    });
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const { token, session } = store.createSession({
      userId: user.id,
      expiresAt,
      ip: "127.0.0.1",
      userAgent: "vitest"
    });
    expect(token).toMatch(/^[a-f0-9]+\.[A-Za-z0-9_-]+$/);
    expect(session.userId).toBe(user.id);

    const resolved = store.findSessionByToken(token);
    expect(resolved?.id).toBe(session.id);

    store.revokeSession(session.id);
    expect(store.findSessionByToken(token)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const org = store.createOrganization({ name: "Acme" });
    const user = store.createUser({
      orgId: org.id,
      username: "carol",
      password: "password-1234",
      role: "operator"
    });
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const { token } = store.createSession({ userId: user.id, expiresAt });
    expect(store.findSessionByToken(token)).toBeNull();
  });

  it("purges expired or revoked sessions", () => {
    const org = store.createOrganization({ name: "Acme" });
    const user = store.createUser({
      orgId: org.id,
      username: "dave",
      password: "password-1234",
      role: "operator"
    });
    const past = new Date(Date.now() - 1000).toISOString();
    const { token } = store.createSession({ userId: user.id, expiresAt: past });
    expect(store.findSessionByToken(token)).toBeNull();

    const purged = store.purgeExpiredSessions();
    expect(purged).toBeGreaterThanOrEqual(1);
  });

  it("rejects disabled users from logging in", () => {
    const org = store.createOrganization({ name: "Acme" });
    const user = store.createUser({
      orgId: org.id,
      username: "eve",
      password: "password-1234",
      role: "operator"
    });
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user.id);
    expect(store.verifyUserCredentials("eve", "password-1234")).toBeNull();
  });
});
