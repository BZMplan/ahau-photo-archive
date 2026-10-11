import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession, isAdminSession, toAdminUser } from "./admin";
import { passwordChangeRequired } from "./bootstrap-policy";

export const getPageSession = cache(async () =>
  getCurrentSession(await headers()),
);

export const requireAdminPage = cache(
  async (allowBootstrapPassword = false) => {
    const session = await getPageSession();
    if (!session) redirect("/admin/login");
    if (!isAdminSession(session)) redirect("/admin/login?error=forbidden");
    if (!allowBootstrapPassword && passwordChangeRequired(session.user.id))
      redirect("/admin/settings");
    return toAdminUser(session);
  },
);
