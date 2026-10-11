import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireAdminPage } from "@/server/auth/pages";
import { getModerationService } from "@/server/services/moderation";

export const metadata: Metadata = { title: "投稿审核" };

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const page = Number(query.page ?? "1");
  const status =
    query.status &&
    ["pending", "approved", "rejected", "hidden"].includes(query.status)
      ? (query.status as "pending" | "approved" | "rejected" | "hidden")
      : "pending";
  const result = getModerationService().listReviews({
    page: Number.isInteger(page) && page > 0 ? page : 1,
    status,
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">投稿审核</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            逐张检查投稿，批准后才会生成公开图片。
          </p>
        </div>
        <Badge variant="secondary">
          待审核 {getModerationService().stats().pending}
        </Badge>
      </div>
      <nav className="my-8 flex flex-wrap gap-2" aria-label="审核状态筛选">
        {(["pending", "approved", "rejected", "hidden"] as const).map(
          (item) => (
            <Link
              key={item}
              href={`/admin/reviews?status=${item}`}
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
              <Link href={`/admin/reviews/${photo.id}`} className="block">
                <div className="bg-muted aspect-[4/3] overflow-hidden">
                  <img
                    src={photo.previewUrl}
                    alt={photo.title}
                    className="size-full object-contain"
                  />
                </div>
              </Link>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{photo.title}</h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {photo.authorName} · {photo.location ?? "地点待补充"}
                    </p>
                  </div>
                  <Badge
                    variant={
                      photo.status === "pending" ? "secondary" : "outline"
                    }
                  >
                    {statusLabel(photo.status)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  投稿于 {photo.submittedAt.toLocaleString("zh-CN")}
                </p>
                <div className="mt-4">
                  <ModerationActions photoId={photo.id} status={photo.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {result.pageCount > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            第 {result.page} / {result.pageCount} 页
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/admin/reviews?status=${status}&page=${result.page - 1}`}
              >
                上一页
              </Link>
            )}
            {result.page < result.pageCount && (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/admin/reviews?status=${status}&page=${result.page + 1}`}
              >
                下一页
              </Link>
            )}
          </div>
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
