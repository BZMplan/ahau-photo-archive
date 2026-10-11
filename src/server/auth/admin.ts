import "server-only";
import { getAuth } from "./index";
import type { AdminUser } from "@/types/admin";
import type { createArchiveAuth } from "./options";

export type AuthSession = ReturnType<
  typeof createArchiveAuth
>["$Infer"]["Session"];
export type AdminSession = AuthSession & {
  user: AuthSession["user"] & { role: "admin" };
};

export class AuthenticationError extends Error {
  readonly status: 401 | 403;
  constructor(readonly code: "UNAUTHORIZED" | "FORBIDDEN") {
    super(
      code === "UNAUTHORIZED"
        ? "请先登录管理员账号。"
        : "当前账号没有管理员权限。",
    );
    this.status = code === "UNAUTHORIZED" ? 401 : 403;
  }
}

export async function getCurrentSession(
  requestHeaders: Headers,
): Promise<AuthSession | null> {
  return getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true },
  });
}

export function isAdminSession(
  session: AuthSession | null,
): session is AdminSession {
  return (
    !!session &&
    session.user.role === "admin" &&
    !session.user.banned &&
    !session.session.impersonatedBy
  );
}

export async function requireSession(
  requestHeaders: Headers,
): Promise<AuthSession> {
  const session = await getCurrentSession(requestHeaders);
  if (!session) throw new AuthenticationError("UNAUTHORIZED");
  return session;
}

export async function requireAdmin(
  requestHeaders: Headers,
): Promise<AdminSession> {
  const session = await requireSession(requestHeaders);
  if (!isAdminSession(session)) throw new AuthenticationError("FORBIDDEN");
  return session;
}

export async function getAdminSession(
  requestHeaders: Headers,
): Promise<AdminSession | null> {
  const session = await getCurrentSession(requestHeaders);
  return isAdminSession(session) ? session : null;
}

export function toAdminUser(session: AdminSession): AdminUser {
  const { id, name, email } = session.user;
  return { id, name, email, role: "admin" };
}

export function authenticationErrorResponse(error: unknown): Response {
  if (!(error instanceof AuthenticationError)) throw error;
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
