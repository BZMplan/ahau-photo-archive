import Link from "next/link";
import { PhotoCard } from "@/components/gallery/photo-card";
import { buttonVariants } from "@/components/ui/button";
import type { PublicPhoto } from "@/types/photo";

export function PhotoGrid({
  photos,
  emptyTitle = "尚未收录校园影像。",
  emptyDescription = "欢迎分享你镜头中的安徽农业大学。",
  archiveReturn,
  filtered = false,
}: {
  photos: PublicPhoto[];
  emptyTitle?: string;
  emptyDescription?: string;
  archiveReturn?: string;
  filtered?: boolean;
}) {
  if (!photos.length)
    return (
      <div className="archive-empty">
        <p className="text-muted-foreground mb-8 font-mono text-xs tracking-widest">
          THE ARCHIVE / 00
        </p>
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
          {emptyTitle}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-md text-sm leading-7">
          {emptyDescription}
        </p>
        <Link
          href={filtered ? "/archive" : "/submit"}
          className={buttonVariants({ variant: "outline", className: "mt-8" })}
        >
          {filtered ? "清除筛选" : "分享校园影像"}
        </Link>
      </div>
    );
  return (
    <div className="masonry-gallery" aria-label="公开影像照片墙">
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          priority={index === 0}
          archiveReturn={archiveReturn}
        />
      ))}
    </div>
  );
}
