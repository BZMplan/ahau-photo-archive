import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireAdminPage } from "@/server/auth/pages";
import { getModerationService } from "@/server/services/moderation";

export const metadata: Metadata = { title: "照片管理" };

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const status =
    query.status &&
    ["approved", "hidden", "rejected", "pending"].includes(query.status)
      ? (query.status as "approved" | "hidden" | "rejected" | "pending")
      : "approved";
  const page = Number(query.page ?? "1");
  const result = getModerationService().listPhotos({
    status,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">照片管理</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            管理已发布和已隐藏的照片，编辑信息不会重新上传原图。
          </p>
        </div>
        <Link
          href="/admin/reviews"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          前往审核队列
        </Link>
      </div>
      <nav className="my-8 flex flex-wrap gap-2" aria-label="照片状态筛选">
        {(["approved", "hidden", "rejected", "pending"] as const).map(
          (item) => (
            <Link
              key={item}
              href={`/admin/photos?status=${item}`}
              className={buttonVariants({
                variant: status === item ? "secondary" : "ghost",
                size: "sm",
              })}
            >
              {statusLabel(item)}
            </Link>
          ),
        )}
      </nav>
      {!result.items.length ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            当前筛选没有照片。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((photo) => (
            <Card key={photo.id}>
              <Link href={`/admin/reviews/${photo.id}`}>
                <div className="bg-muted aspect-[4/3] overflow-hidden">
                  {photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.title}
                      className="size-full object-contain"
                    />
                  ) : (
                    <img
                      src={photo.previewUrl}
                      alt={photo.title}
                      className="size-full object-contain"
                    />
                  )}
                </div>
              </Link>
              <CardContent>
                <div className="flex justify-between gap-3">
                  <h2 className="font-medium">{photo.title}</h2>
                  <Badge
                    variant={
                      photo.status === "approved" ? "default" : "outline"
                    }
                  >
                    {statusLabel(photo.status)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {photo.takenAt ?? "拍摄日期待补充"} ·{" "}
                  {photo.location ?? "地点待补充"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {photo.publishedAt
                    ? `发布于 ${photo.publishedAt.toLocaleString("zh-CN")}`
                    : "未发布"}
                </p>
                <div className="mt-4">
                  <ModerationActions photoId={photo.id} status={photo.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function statusLabel(status: "pending" | "approved" | "rejected" | "hidden") {
  return {
    pending: "待审核",
    approved: "已发布",
    rejected: "已拒绝",
    hidden: "已隐藏",
  }[status];
}
