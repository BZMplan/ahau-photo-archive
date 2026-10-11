import Link from "next/link";
import { archiveHref, type ArchiveQuery } from "@/lib/validations/archive";
import type { PublicPhotoPage } from "@/types/photo";

export function ArchivePagination({
  query,
  result,
  base = "/archive",
}: {
  query: ArchiveQuery;
  result: PublicPhotoPage;
  base?: string;
}) {
  if (result.pageCount <= 1) return null;
  return (
    <nav
      aria-label="档案分页"
      className="mt-12 flex items-center justify-center gap-3 text-sm"
    >
      {result.page > 1 ? (
        <Link
          href={archiveHref(query, result.page - 1, base)}
          className="hover:bg-muted rounded-md border px-4 py-2"
        >
          上一页
        </Link>
      ) : null}
      <span className="text-muted-foreground px-2">
        第 {result.page} / {result.pageCount} 页
      </span>
      {result.page < result.pageCount ? (
        <Link
          href={archiveHref(query, result.page + 1, base)}
          className="hover:bg-muted rounded-md border px-4 py-2"
        >
          下一页
        </Link>
      ) : null}
    </nav>
  );
}
