import { ArrowDownRight } from "lucide-react";
import { PhotoGrid } from "@/components/photo-grid";
import { Badge } from "@/components/ui/badge";
import { listPublicPhotos } from "@/server/services/public-photos";
export const dynamic = "force-dynamic";
export default function HomePage() {
  const photos = listPublicPhotos();
  return (
    <>
      <section className="flex flex-col justify-between gap-10 border-b py-16 sm:py-24 lg:flex-row lg:items-end">
        <div>
          <p className="text-muted-foreground mb-6 text-xs tracking-[0.24em]">
            CAMPUS / MEMORY / THROUGH THE LENS
          </p>
          <h1 className="text-4xl leading-[1.3] font-medium tracking-tight sm:text-6xl">
            留住校园，
            <br />
            <span className="text-muted-foreground">也留住时光。</span>
          </h1>
          <p className="text-muted-foreground mt-7 max-w-lg text-sm leading-8">
            建筑与树影，四季与日常。
            <br />
            一座校园的故事，由每一个看见它的人共同记录。
          </p>
        </div>
        <div className="text-muted-foreground flex items-center gap-5">
          <p className="text-xs leading-6">
            AH AU PHOTO ARCHIVE
            <br />
            校园影像档案馆
          </p>
          <ArrowDownRight
            aria-hidden="true"
            className="size-10"
            strokeWidth={1}
          />
        </div>
      </section>
      <section className="py-10 sm:py-14" aria-label="公开影像">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-medium">影像馆藏</h2>
            <Badge variant="secondary">
              {photos.length ? `最近 ${photos.length} 张` : "0 张"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            时间 / 地点 / 标签筛选 · 即将开放
          </p>
        </div>
        <PhotoGrid photos={photos} />
        <p className="text-muted-foreground mt-7 text-xs leading-6">
          档案正在筹备中。投稿与图片展示将在后续阶段开放。
        </p>
      </section>
    </>
  );
}
