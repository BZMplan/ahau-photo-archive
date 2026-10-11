import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";

// This skeleton exposes no administrative data. Add a server-side session guard before wiring data.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
