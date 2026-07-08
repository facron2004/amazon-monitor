import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
});

afterEach(() => {
  db.close();
});

describe("auth API (Stage 0)", () => {
  it("seeds an admin user on first boot and lets them log in", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    expect(login.body.token).toMatch(/^[a-f0-9]+\.[A-Za-z0-9_-]+$/);
    expect(login.body.context.user.username).toBe("admin");
    expect(login.body.context.user.role).toBe("admin");
    expect(login.body.context.organization.name).toBe("Default Organization");
    expect(login.headers["set-cookie"][0]).toMatch(/amazon_monitor_session=/);
  });

  it("lets first-time registration replace the seeded bootstrap admin", async () => {
    const registered = await request(app)
      .post("/api/auth/register-first-user")
      .send({ username: "owner", password: "password-1234" })
      .expect(201);

    expect(registered.body.context.user.username).toBe("owner");
    expect(registered.body.context.user.role).toBe("admin");
    expect(registered.headers["set-cookie"][0]).toMatch(/amazon_monitor_session=/);

    await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(401);

    await request(app)
      .post("/api/auth/login")
      .send({ username: "owner", password: "password-1234" })
      .expect(200);
  });

  it("rejects bootstrap registration after the default admin has been used", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);

    const response = await request(app)
      .post("/api/auth/register-first-user")
      .send({ username: "owner", password: "password-1234" })
      .expect(409);

    expect(response.body.message).toContain("initial setup");
  });

  it("sets Secure on session cookies in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.AMAZON_MONITOR_API_KEY;
    const originalInitialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    process.env.NODE_ENV = "production";
    process.env.AMAZON_MONITOR_API_KEY = "legacy-key";
    process.env.ADMIN_INITIAL_PASSWORD = "admin123";
    const prodDb = new DatabaseSync(":memory:");
    try {
      initSchema(prodDb);
      const prodApp = createApiApp(createStore(prodDb));
      const login = await request(prodApp)
        .post("/api/auth/login")
        .send({ username: "admin", password: "admin123" })
        .expect(200);

      expect(login.headers["set-cookie"][0]).toContain("Secure");
    } finally {
      prodDb.close();
      if (originalNodeEnv) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalApiKey) {
        process.env.AMAZON_MONITOR_API_KEY = originalApiKey;
      } else {
        delete process.env.AMAZON_MONITOR_API_KEY;
      }
      if (originalInitialPassword) {
        process.env.ADMIN_INITIAL_PASSWORD = originalInitialPassword;
      } else {
        delete process.env.ADMIN_INITIAL_PASSWORD;
      }
    }
  });

  it("rejects login with a bad password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" })
      .expect(401);
    expect(response.body.message).toMatch(/invalid/i);
  });

  it("returns the session context on /api/auth/me with the session token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    const token: string = login.body.token;
    const me = await request(app)
      .get("/api/auth/me")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(me.body.user.username).toBe("admin");
  });

  it("returns 401 on /api/auth/me without a session token", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("lets admin create a developer user via /api/users", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    const token: string = login.body.token;
    const created = await request(app)
      .post("/api/users")
      .set("x-amazon-monitor-session", token)
      .send({ username: "sara", password: "password-1234", role: "developer" })
      .expect(201);
    expect(created.body.username).toBe("sara");
    expect(created.body.role).toBe("developer");

    // The new user can log in
    const saraLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "sara", password: "password-1234" })
      .expect(200);
    expect(saraLogin.body.context.user.role).toBe("developer");
  });

  it("forbids non-admin from creating users", async () => {
    // Seed a second user manually
    const org = store.listOrganizations()[0];
    store.createUser({
      orgId: org.id,
      username: "op1",
      password: "password-1234",
      role: "operator"
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "op1", password: "password-1234" })
      .expect(200);
    const token: string = login.body.token;
    await request(app)
      .post("/api/users")
      .set("x-amazon-monitor-session", token)
      .send({ username: "x", password: "password-1234", role: "operator" })
      .expect(403);
  });

  it("revokes a session on logout", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    const token: string = login.body.token;
    await request(app)
      .post("/api/auth/logout")
      .set("x-amazon-monitor-session", token)
      .expect(204);
    await request(app)
      .get("/api/auth/me")
      .set("x-amazon-monitor-session", token)
      .expect(401);
  });
});
