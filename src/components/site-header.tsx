import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="AHAU Photo Archive 首页"
          prefetch={false}
          className="site-brand"
        >
          <span className="whitespace-nowrap">AHAU</span>{" "}
          <span className="site-brand-caption">Photo Archive</span>
        </Link>
        <nav
          aria-label="主导航"
          className="flex shrink-0 items-center gap-4 sm:gap-7"
        >
          <Link
            href="/archive"
            prefetch={false}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm transition-colors"
          >
            影像档案
          </Link>
          <Link
            href="/submit"
            prefetch={false}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm"
          >
            投稿
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
