import type { Metadata } from "next";
import { FilterDock } from "@/components/archive/filter-dock";
import { ArchivePagination } from "@/components/archive/archive-pagination";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { archiveHref } from "@/lib/validations/archive";
import {
  getArchiveFilters,
  getPublishedPhotos,
  parseArchiveQuery,
} from "@/server/services/public-photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "影像档案",
  description: "沿着时间、季节、地点与标签，重新发现安徽农业大学的不同模样。",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = Object.fromEntries(
    Object.entries(await searchParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const query = parseArchiveQuery(raw);
  const result = getPublishedPhotos(query);
  const filters = getArchiveFilters();
  const hasFilters = Boolean(
    query.year || query.season || query.location || query.tag,
  );
  return (
    <div className="archive-page">
      <header className="archive-heading">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-medium tracking-tight">影像档案</h1>
          <span className="text-muted-foreground hidden font-mono text-[10px] tracking-widest sm:inline">
            THE ARCHIVE
          </span>
        </div>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {result.total} 张公开影像{hasFilters ? " · 当前筛选结果" : ""}
          <span className="ml-4">
            {result.page} / {result.pageCount}
          </span>
        </p>
      </header>
      <PhotoGrid
        photos={result.items}
        archiveReturn={archiveHref(query, result.page)}
        filtered={hasFilters}
        emptyTitle={
          hasFilters ? "没有找到符合条件的影像。" : "尚未收录校园影像。"
        }
        emptyDescription={
          hasFilters
            ? "换一个时间、地点或标签，发现校园的另一面。"
            : "欢迎分享你镜头中的安徽农业大学。"
        }
      />
      <ArchivePagination query={query} result={result} />
      <FilterDock
        query={query}
        years={filters.years}
        locations={filters.locations}
        tags={filters.tags}
      />
    </div>
  );
}
