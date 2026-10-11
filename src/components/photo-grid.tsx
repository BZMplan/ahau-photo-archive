import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import type { PublicPhoto } from "@/types/photo";
export function PhotoGrid({ photos }: { photos: PublicPhoto[] }) {
  if (!photos.length)
    return (
      <EmptyState
        title="档案的第一帧，留给你"
        description="这里还没有公开的照片。未来每一张投稿都会经过审核，再成为校园影像档案的一部分。"
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
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {photos.map((photo) => (
        <Link
          key={photo.id}
          href={`/photo/${photo.id}`}
          className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <div className="bg-muted text-muted-foreground flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-md text-xs">
            <ImageIcon aria-hidden="true" className="size-5" />
            图片展示将在下一阶段开放
          </div>
          <h2 className="mt-4 text-sm font-medium group-hover:underline">
            {photo.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {photo.location ?? "地点待补充"} ·{" "}
            {photo.takenAt ?? "拍摄日期待补充"}
          </p>
        </Link>
      ))}
    </div>
  );
}
