import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PhotoCard } from "@/components/gallery/photo-card";
import { buttonVariants } from "@/components/ui/button";
import type { PublicPhoto } from "@/types/photo";

export function PhotoGrid({
  photos,
  emptyTitle = "档案的第一帧，留给你",
  emptyDescription = "这里还没有公开的照片。未来每一张投稿都会经过审核，再成为校园影像档案的一部分。",
}: {
  photos: PublicPhoto[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!photos.length)
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Link
            href="/submit"
            className={buttonVariants({ variant: "outline" })}
          >
            了解如何投稿
          </Link>
        }
      />
    );
  return (
    <div className="grid items-start gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="mb-8">
          <PhotoCard photo={photo} />
        </div>
      ))}
    </div>
  );
}
