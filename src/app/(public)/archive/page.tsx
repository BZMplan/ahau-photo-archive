import Link from "next/link";
import type { Metadata } from "next";
import { ArchiveFilters } from "@/components/archive/archive-filters";
import { ArchivePagination } from "@/components/archive/archive-pagination";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import {
  getArchiveFilters,
  getPublishedPhotos,
  parseArchiveQuery,
} from "@/server/services/public-photos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "影像档案",
  description: "沿着时间、季节、地点与标签，重新发现校园的不同模样。",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValues(
  input: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = firstValues(await searchParams);
  const query = parseArchiveQuery(raw);
  const result = getPublishedPhotos(query);
  const filters = getArchiveFilters();
  const hasFilters = Boolean(
    query.year || query.season || query.location || query.tag,
  );

  return (
    <div className="py-12 sm:py-16">
      <header className="border-b pb-10">
        <p className="text-muted-foreground mb-4 text-xs tracking-[0.24em]">
          THE ARCHIVE
        </p>
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          影像档案
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-sm leading-7">
          在这里，沿着时间与地点，重新发现校园的不同模样。
        </p>
      </header>
      <section className="py-8" aria-label="影像筛选">
        <ArchiveFilters
          query={query}
          years={filters.years}
          locations={filters.locations}
          tags={filters.tags}
        />
      </section>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {result.total} 张公开影像
          {hasFilters ? " · 当前筛选结果" : ""}
        </p>
        <p className="text-muted-foreground text-xs">
          第 {result.page} / {result.pageCount} 页
        </p>
      </div>
      <PhotoGrid
        photos={result.items}
        emptyTitle={
          hasFilters ? "没有找到符合条件的照片" : "还没有收录的校园影像"
        }
        emptyDescription={
          hasFilters
            ? "请尝试调整年份、季节、地点或标签，也可以清除筛选条件。"
            : "欢迎成为第一位投稿者，让一段校园记忆从这里开始。"
        }
      />
      {hasFilters && !result.items.length ? (
        <div className="mt-6 text-center">
          <Link
            className="text-sm underline underline-offset-4"
            href="/archive"
          >
            清除筛选条件
          </Link>
        </div>
      ) : null}
      <ArchivePagination query={query} result={result} />
    </div>
  );
}
