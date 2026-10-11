import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { PhotoLightbox } from "@/components/gallery/photo-lightbox";
import {
  findPublicPhoto,
  getRelatedPhotos,
} from "@/server/services/public-photos";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const photo = findPublicPhoto(id);
  if (!photo) notFound();
  return {
    metadataBase: new URL(
      process.env.BETTER_AUTH_URL || "http://localhost:3000",
    ),
    title: photo.title,
    description: photo.description || "校园影像档案中的一段校园记忆。",
    openGraph: {
      title: photo.title + " - 校园影像档案",
      description: photo.description || undefined,
      images: [{ url: photo.displayUrl, alt: photo.title }],
    },
  };
}

function formatDate(value: string | null) {
  return value || "未知";
}

export default async function PhotoPage({ params }: { params: Params }) {
  const { id } = await params;
  const photo = findPublicPhoto(id);
  if (!photo) notFound();
  const related = getRelatedPhotos(photo.id);

  return (
    <article className="py-10 sm:py-14">
      <Link
        href="/archive"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← 返回影像档案
      </Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
        <PhotoLightbox
          photo={{
            title: photo.title,
            width: photo.width,
            height: photo.height,
            displayUrl: photo.displayUrl,
            thumbnailUrl: photo.thumbnailUrl,
          }}
        />
        <div>
          <p className="text-muted-foreground mb-4 text-xs tracking-[0.2em]">
            PHOTO / {photo.id.slice(0, 8)}
          </p>
          <h1 className="text-3xl leading-tight font-medium tracking-tight">
            {photo.title}
          </h1>
          {photo.description ? (
            <p className="text-muted-foreground mt-5 text-sm leading-7">
              {photo.description}
            </p>
          ) : null}
          <dl className="mt-10 space-y-6 text-sm">
            <div>
              <dt className="text-muted-foreground">拍摄日期</dt>
              <dd className="mt-1">{formatDate(photo.takenAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">校园地点</dt>
              <dd className="mt-1">{photo.location || "待补充"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">摄影署名</dt>
              <dd className="mt-1">{photo.attribution || "匿名投稿"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">公开日期</dt>
              <dd className="mt-1">
                {photo.publishedAt?.toISOString().slice(0, 10) || "待发布"}
              </dd>
            </div>
          </dl>
          {photo.tags.length ? (
            <div className="mt-10 border-t pt-6">
              <h2 className="text-muted-foreground text-xs tracking-[0.16em]">
                标签
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {photo.tags.map((tag, index) => (
                  <Link
                    key={photo.tagSlugs[index] || tag}
                    href={"/tags/" + encodeURIComponent(photo.tagSlugs[index])}
                    className="hover:bg-muted rounded-full border px-3 py-1.5 text-xs"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {related.length ? (
        <section className="mt-20 border-t pt-10">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="text-xl font-medium">更多影像</h2>
            <p className="text-muted-foreground text-xs">相同地点或标签</p>
          </div>
          <PhotoGrid photos={related} />
        </section>
      ) : null}
    </article>
  );
}
