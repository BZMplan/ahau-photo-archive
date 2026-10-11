import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { openDatabase } from "../db/connection";
import type { AuthEnvironment } from "./environment";

export function createArchiveAuth(
  db: ReturnType<typeof openDatabase>["db"],
  environment: AuthEnvironment,
  runtimePlugins: BetterAuthPlugin[] = [],
) {
  return betterAuth({
    appName: "AH AU Photo Archive",
    secret: environment.secret,
    baseURL: environment.baseURL,
    basePath: "/api/auth",
    trustedOrigins: [environment.baseURL],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // The Admin plugin's createUser bypasses public sign-up password minimums.
        if (
          ctx.path === "/admin/create-user" &&
          (typeof ctx.body?.password !== "string" ||
            ctx.body.password.length < 12)
        ) {
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_TOO_SHORT",
            message: "管理员密码至少需要 12 个字符。",
          });
        }
      }),
    },
    // better-sqlite3 transactions are synchronous; the adapter callbacks are async.
    database: drizzleAdapter(db, { provider: "sqlite", transaction: false }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    // No mail transport is configured. Only the dedicated admin settings route
    // may update an email after rechecking the current password.
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 10 } },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "ahau",
      useSecureCookies: environment.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      trustedProxyHeaders: false,
      // Until an authenticated ingress is configured, use Better Auth's shared limiter.
      // Client-supplied forwarded IP headers must not create fresh rate-limit buckets.
      ipAddress: { ipAddressHeaders: [] },
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      ...runtimePlugins,
    ],
  });
}
