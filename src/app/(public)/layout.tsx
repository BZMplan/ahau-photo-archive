import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const runtime = "nodejs";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-site flex min-h-svh flex-col">
      <SiteHeader />
      <main id="main-content" className="w-full min-w-0 flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
