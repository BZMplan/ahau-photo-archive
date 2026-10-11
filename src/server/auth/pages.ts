import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession, isAdminSession, toAdminUser } from "./admin";

export const getPageSession = cache(async () =>
  getCurrentSession(await headers()),
);

export const requireAdminPage = cache(async () => {
  const session = await getPageSession();
  if (!session) redirect("/admin/login");
  if (!isAdminSession(session)) redirect("/admin/login?error=forbidden");
  return toAdminUser(session);
});
