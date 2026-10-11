import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Link
          href="/"
          aria-label="AH AU Photo Archive 首页"
          className="flex items-center gap-3"
        >
          <span className="bg-foreground text-background flex size-9 items-center justify-center rounded-sm text-xs font-semibold tracking-tight">
            AU
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">
              AH AU
            </span>
            <span className="text-muted-foreground block text-[10px] tracking-[0.18em]">
              PHOTO ARCHIVE
            </span>
          </span>
        </Link>
        <nav aria-label="主导航" className="flex items-center gap-2 sm:gap-5">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            影像档案
          </Link>
          <Link
            href="/submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            参与投稿
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
