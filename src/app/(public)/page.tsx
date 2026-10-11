import Link from "next/link";
import { ArrowDownRight, ArrowRight } from "lucide-react";
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
            校园影像
            <br />
            <span className="text-muted-foreground">记录四季与时光。</span>
          </h1>
          <p className="text-muted-foreground mt-7 max-w-lg text-sm leading-8">
            建筑与树影，四季与日常。
            <br />
            通过镜头保存那些值得记住的校园瞬间。
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
            <h2 className="text-base font-medium">最近收录</h2>
            <Badge variant="secondary">
              {photos.length ? "最近 " + photos.length + " 张" : "暂无公开影像"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">已审核公开影像</p>
        </div>
        <PhotoGrid photos={photos} />
        <div className="mt-10 flex justify-center">
          <Link
            href="/archive"
            className="group inline-flex items-center gap-2 text-sm font-medium"
          >
            浏览全部影像
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
        <p className="text-muted-foreground mt-7 text-xs leading-6">
          让一张照片，成为校园记忆的一部分。
        </p>
      </section>
    </>
  );
}
