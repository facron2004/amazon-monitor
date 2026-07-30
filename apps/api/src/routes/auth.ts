import type { Express, NextFunction, Request, Response } from "express";
import type { SessionContext, UserRole } from "@amazon-monitor/shared";
import { login, logout, resolveContext, isRole } from "../services/auth-service.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { bootstrapRegistrationSchema, createUserSchema, loginSchema, validateBody } from "./validation.js";

function getBootstrapAdmin(store: Store) {
  const users = store.listUsers();
  if (users.length !== 1) return null;
  const [user] = users;
  if (
    user.username.toLowerCase() === "admin" &&
    user.role === "admin" &&
    user.displayName === "Administrator" &&
    user.lastLoginAt === null
  ) {
    return user;
  }
  return null;
}

export interface AuthRouteOptions {
  /** When true, the session fallback is also accepted. Default true. */
  sessionEnabled?: boolean;
}

export const SESSION_COOKIE = "amazon_monitor_session";
export const LEGACY_TOKEN_HEADER = "authorization";

function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/**
 * Express middleware: extracts the HttpOnly session token from Cookie. Attaches
 * `req.sessionContext` and `req.sessionToken` if valid. Does NOT reject requests —
 * that is the job of `requireAuth` below.
 */
export function sessionLoader(store: Store) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractSessionToken(req);
    if (token) {
      const context = resolveContext(store, token);
      if (context) {
        (req as Request & { sessionContext?: SessionContext; sessionToken?: string }).sessionContext = context;
        (req as Request & { sessionToken?: string }).sessionToken = token;
      }
    }
    next();
  };
}

export function extractSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  if (match) {
    return decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  }
  return null;
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
    if (ctx) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized: login required" });
  };
}

export function requireRole(roles: UserRole | UserRole[]) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
    if (!ctx) {
      res.status(401).json({ message: "Unauthorized: login required" });
      return;
    }
    if (!allow.includes(ctx.user.role)) {
      res.status(403).json({ message: `Forbidden: role '${ctx.user.role}' not in [${allow.join(",")}]` });
      return;
    }
    next();
  };
}

export function registerAuthRoutes(app: Express, store: Store, options: AuthRouteOptions = {}): void {
  const { sessionEnabled = true } = options;

  app.post("/api/auth/register-first-user", asyncHandler(async (request, response) => {
    const data = validateBody(bootstrapRegistrationSchema, request.body);
    const users = store.listUsers();
    const bootstrapAdmin = getBootstrapAdmin(store);
    if (users.length > 0 && !bootstrapAdmin) {
      response.status(409).json({ message: "Registration is only available during initial setup. Log in as an admin to create more users." });
      return;
    }
    const org = bootstrapAdmin
      ? store.getOrganization(bootstrapAdmin.orgId)
      : store.createOrganization({ name: data.displayName?.trim() || data.username });
    if (!org) {
      response.status(500).json({ message: "Bootstrap organization is missing" });
      return;
    }
    const user = bootstrapAdmin
      ? store.replaceBootstrapAdmin({
        userId: bootstrapAdmin.id,
        username: data.username,
        password: data.password,
        displayName: data.displayName ?? "Administrator",
        email: data.email ?? null
      })
      : store.createUser({
        orgId: org.id,
        username: data.username,
        password: data.password,
        role: "admin",
        displayName: data.displayName ?? "Administrator",
        email: data.email ?? null
      });
    const result = login(store, data.username, data.password, { ip: request.ip ?? null, userAgent: (request.headers["user-agent"] as string | undefined) ?? null });
    if (!result) {
      response.status(500).json({ message: "Bootstrap registration failed" });
      return;
    }
    if (sessionEnabled) {
      response.setHeader("Set-Cookie", sessionCookie(result.token, 14 * 24 * 3600));
    }
    response.status(201).json({ expiresAt: result.expiresAt, context: result.context, user, organization: org });
  }));

  app.post("/api/auth/login", asyncHandler(async (request, response) => {
    const data = validateBody(loginSchema, request.body);
    const ip = request.ip ?? null;
    const userAgent = (request.headers["user-agent"] as string | undefined) ?? null;
    const result = login(store, data.username, data.password, { ip, userAgent });
    if (!result) {
      response.status(401).json({ message: "Invalid username or password" });
      return;
    }
    if (sessionEnabled) {
      response.setHeader(
        "Set-Cookie",
        sessionCookie(result.token, 14 * 24 * 3600)
      );
    }
    response.json({ expiresAt: result.expiresAt, context: result.context });
  }));

  app.post("/api/auth/logout", asyncHandler(async (request, response) => {
    const token = (request as Request & { sessionToken?: string }).sessionToken;
    if (token) {
      logout(store, token);
    }
    response.setHeader(
      "Set-Cookie",
      sessionCookie("", 0)
    );
    response.status(204).end();
  }));

  app.get("/api/auth/me", (request, response) => {
    const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
    if (!ctx) {
      response.status(401).json({ message: "Unauthorized" });
      return;
    }
    response.json(ctx);
  });

  app.get("/api/users", requireAuth(), (request, response) => {
    const ctx = (request as Request & { sessionContext: SessionContext }).sessionContext;
    response.json(store.listUsers().filter((user) => user.orgId === ctx.organization.id));
  });

  app.post("/api/users", requireRole("admin"), asyncHandler(async (request, response) => {
    const data = validateBody(createUserSchema, request.body);
    if (!isRole(data.role)) {
      response.status(400).json({ message: `Invalid role: ${data.role}` });
      return;
    }
    const ctx = (request as Request & { sessionContext: SessionContext }).sessionContext;
    const orgId = data.orgId ?? ctx.organization.id;
    if (orgId !== ctx.organization.id) {
      response.status(403).json({ message: "Forbidden: cannot create users in another organization" });
      return;
    }
    const user = store.createUser({
      orgId,
      username: data.username,
      password: data.password,
      role: data.role,
      displayName: data.displayName ?? null,
      email: data.email ?? null
    });
    response.status(201).json(user);
  }));
}
