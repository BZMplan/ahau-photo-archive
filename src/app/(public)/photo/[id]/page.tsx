import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { findPublicPhoto } from "@/server/services/public-photos";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "影像详情" };
export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photo = findPublicPhoto(id);
  if (!photo) notFound();
  return (
    <article className="py-12">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← 返回影像档案
      </Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_280px]">
        <EmptyState
          title="影像展示即将开放"
          description="图片访问服务将在后续阶段接入。原图默认不公开。"
        />
        <div>
          <h1 className="text-2xl font-medium">{photo.title}</h1>
          <p className="text-muted-foreground mt-4 text-sm leading-7">
            {photo.description ?? "暂无影像说明。"}
          </p>
          <dl className="mt-8 space-y-6 text-sm">
            <div>
              <dt className="text-muted-foreground">拍摄日期</dt>
              <dd className="mt-1">{photo.takenAt ?? "未知"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">校园地点</dt>
              <dd className="mt-1">{photo.location ?? "待补充"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">摄影署名</dt>
              <dd className="mt-1">{photo.attribution ?? "匿名投稿"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">公开日期</dt>
              <dd className="mt-1">
                {photo.publishedAt?.toISOString().slice(0, 10) ?? "待发布"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}
