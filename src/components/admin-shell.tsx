import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            AH AU{" "}
            <span className="text-muted-foreground ml-2 font-normal">
              / 档案管理
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="outline">布局预览</Badge>
            <Link
              href="/admin/login"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              管理员登录
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[200px_1fr]">
        <aside className="border-b px-6 py-6 lg:min-h-[80vh] lg:border-r lg:border-b-0">
          <nav
            aria-label="管理后台导航"
            className="flex flex-wrap gap-4 text-sm lg:flex-col lg:gap-1"
          >
            {[
              ["/admin", "概览"],
              ["/admin/reviews", "投稿审核"],
              ["/admin/photos", "照片管理"],
            ].map(([href, label]) => (
              <Link
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2"
                key={href}
                href={href}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="min-w-0 px-6 py-8 sm:px-10">
          <p className="bg-muted/30 text-muted-foreground mb-8 rounded-md border p-4 text-sm leading-6">
            后台尚未开放，当前仅为页面结构预览。认证、数据读取和管理操作将在后续阶段接入。
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
