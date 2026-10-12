import "server-only";
import {
  requireAdmin,
  AuthenticationError,
  BootstrapPasswordChangeError,
  authenticationErrorResponse,
} from "@/server/auth/admin";
import {
  assertTrustedOrigin,
  TrustedOriginError,
} from "@/server/security/origin";
import { CatalogError, CatalogService } from "@/server/services/catalog";
import type { CatalogKind } from "@/types/catalog";

const success = (data: unknown, status = 200) =>
  Response.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
export function catalogErrorResponse(error: unknown) {
  if (
    error instanceof AuthenticationError ||
    error instanceof BootstrapPasswordChangeError
  )
    return authenticationErrorResponse(error);
  let code = "INTERNAL_ERROR",
    message = "目录服务暂时不可用。",
    status = 500;
  if (error instanceof TrustedOriginError) {
    code = "FORBIDDEN_ORIGIN";
    message = error.message;
    status = 403;
  }
  if (error instanceof CatalogError) {
    code = error.code;
    message = error.message;
    status =
      error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
  }
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function publicCatalogGet(kind: CatalogKind) {
  return async (request: Request) => {
    try {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      return success({ items: new CatalogService().search(kind, query) });
    } catch (error) {
      return catalogErrorResponse(error);
    }
  };
}
export function adminCatalogGet(kind: CatalogKind) {
  return async (request: Request) => {
    try {
      await requireAdmin(request.headers);
      return success(
        new CatalogService().list(
          kind,
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
    } catch (error) {
      return catalogErrorResponse(error);
    }
  };
}
async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CatalogError("INVALID_INPUT", "请求格式不正确。");
  }
}
export function adminCatalogPost(kind: CatalogKind) {
  return async (request: Request) => {
    try {
      await requireAdmin(request.headers);
      assertTrustedOrigin(request);
      return success(
        { item: new CatalogService().create(kind, await jsonBody(request)) },
        201,
      );
    } catch (error) {
      return catalogErrorResponse(error);
    }
  };
}
export function adminCatalogPatch(kind: CatalogKind) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    try {
      await requireAdmin(request.headers);
      assertTrustedOrigin(request);
      const { id } = await context.params;
      return success({
        item: new CatalogService().update(kind, id, await jsonBody(request)),
      });
    } catch (error) {
      return catalogErrorResponse(error);
    }
  };
}
