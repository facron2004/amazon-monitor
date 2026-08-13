import { timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
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
  /** One-time desktop setup token. Required for packaged production bootstrap. */
  setupToken?: string;
  /** Optional route-level limiter for credential attempts. */
  loginLimiter?: RequestHandler;
  /** Optional route-level limiter for the one-time bootstrap endpoint. */
  bootstrapLimiter?: RequestHandler;
}

export const SESSION_COOKIE = "amazon_monitor_session";
export const SETUP_COOKIE = "amazon_monitor_setup";
export const LEGACY_TOKEN_HEADER = "authorization";

function sessionCookie(token: string, maxAgeSeconds: number, request: Request): string {
  const secure = shouldUseSecureCookie(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function setupCookie(token: string, maxAgeSeconds: number): string {
  return `${SETUP_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
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
  return extractCookie(req, SESSION_COOKIE);
}

function extractCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
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
  const {
    sessionEnabled = true,
    loginLimiter,
    bootstrapLimiter,
  } = options;
  const setupToken = options.setupToken?.trim() || null;

  app.post("/api/auth/register-first-user", ...(bootstrapLimiter ? [bootstrapLimiter] : []), asyncHandler(async (request, response) => {
    const data = validateBody(bootstrapRegistrationSchema, request.body);
    const users = store.listUsers();
    const bootstrapAdmin = getBootstrapAdmin(store);
    if (users.length > 0 && !bootstrapAdmin) {
      response.status(409).json({ message: "Registration is only available during initial setup. Log in as an admin to create more users." });
      return;
    }
    if (!canBootstrap(request, setupToken)) {
      response.status(setupToken ? 403 : 503).json({
        message: setupToken
          ? "Initial setup token is missing or invalid"
          : "Initial setup is not configured",
      });
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
      response.setHeader("Set-Cookie", [
        sessionCookie(result.token, 14 * 24 * 3600, request),
        setupCookie("", 0),
      ]);
    }
    response.status(201).json({ expiresAt: result.expiresAt, context: result.context, user, organization: org });
  }));

  app.post("/api/auth/login", ...(loginLimiter ? [loginLimiter] : []), asyncHandler(async (request, response) => {
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
        sessionCookie(result.token, 14 * 24 * 3600, request)
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
      sessionCookie("", 0, request)
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

function canBootstrap(request: Request, expectedToken: string | null): boolean {
  if (!isLoopbackRequest(request)) return false;
  if (!expectedToken) return process.env.NODE_ENV !== "production";
  const provided = extractCookie(request, SETUP_COOKIE)
    ?? request.header("x-amazon-monitor-setup-token")
    ?? "";
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isLoopbackRequest(request: Request): boolean {
  const address = request.socket.remoteAddress ?? request.ip ?? "";
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function shouldUseSecureCookie(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (request.secure || request.header("x-forwarded-proto") === "https") return true;
  // Packaged Electron serves the UI from an HTTP loopback origin. Keep that
  // local session usable while retaining Secure for non-loopback production.
  return !isLoopbackRequest(request);
}
