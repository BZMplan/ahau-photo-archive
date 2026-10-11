import "server-only";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "./index";

function publicUser(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const user = value as Record<string, unknown>;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  const allowed =
    request.method === "GET"
      ? ["/ok", "/get-session"]
      : ["/sign-in/email", "/sign-out"];
  // Provisioning and user/role mutation stay server-only, including Admin plugin routes.
  if (!allowed.includes(path))
    return Response.json(
      { error: { code: "NOT_FOUND", message: "此认证接口未开放。" } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  const handler = toNextJsHandler(getAuth());
  const response = await (request.method === "GET"
    ? handler.GET(request)
    : handler.POST(request));
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  if (response.ok && ["/sign-in/email", "/get-session"].includes(path)) {
    const body: unknown = await response.json();
    let safeBody: unknown = null;
    if (body && typeof body === "object") {
      const data = body as Record<string, unknown>;
      if (path === "/sign-in/email")
        safeBody = {
          redirect: data.redirect,
          url: data.url,
          user: publicUser(data.user),
        };
      else {
        const session =
          data.session && typeof data.session === "object"
            ? (data.session as Record<string, unknown>)
            : {};
        safeBody = {
          user: publicUser(data.user),
          session: {
            id: session.id,
            userId: session.userId,
            expiresAt: session.expiresAt,
          },
        };
      }
    }
    headers.delete("Content-Length");
    return Response.json(safeBody, { status: response.status, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}
