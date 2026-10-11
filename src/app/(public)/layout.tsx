import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const runtime = "nodejs";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-6 sm:px-10"
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
