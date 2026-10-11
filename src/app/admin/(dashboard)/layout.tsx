import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/server/auth/pages";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdminPage();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
