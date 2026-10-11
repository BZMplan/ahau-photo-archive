import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { ArchivePagination } from "@/components/archive/archive-pagination";
import {
  getPublishedPhotos,
  getPublishedTagBySlug,
  parseArchiveQuery,
} from "@/server/services/public-photos";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = getPublishedTagBySlug(slug);
  return tag
    ? {
        title: "标签：" + tag.name,
        description: "浏览校园影像档案中的“" + tag.name + "”作品。",
      }
    : { title: "标签不存在" };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const tag = getPublishedTagBySlug(slug);
  if (!tag) notFound();
  const raw = await searchParams;
  const pageValue = typeof raw.page === "string" ? raw.page : undefined;
  const query = parseArchiveQuery({ tag: slug, page: pageValue });
  const result = getPublishedPhotos(query);

  return (
    <div className="py-12 sm:py-16">
      <header className="border-b pb-10">
        <Link
          href="/archive"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← 返回影像档案
        </Link>
        <p className="text-muted-foreground mt-8 mb-4 text-xs tracking-[0.24em]">
          TAG ARCHIVE
        </p>
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          {tag.name}
        </h1>
        <p className="text-muted-foreground mt-5 text-sm">
          {tag.count} 张公开影像
        </p>
      </header>
      <section className="py-10">
        <PhotoGrid
          photos={result.items}
          emptyTitle="这个标签暂时没有公开影像"
          emptyDescription="相关影像撤回后，标签页面会自动隐藏它们。"
        />
        <ArchivePagination
          query={query}
          result={result}
          base={"/tags/" + encodeURIComponent(slug)}
        />
      </section>
    </div>
  );
}
