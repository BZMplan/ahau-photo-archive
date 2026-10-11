import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/server/auth/pages";
import { getModerationService } from "@/server/services/moderation";

export const metadata: Metadata = { title: "管理概览" };

export default async function AdminPage() {
  const admin = await requireAdminPage();
  const stats = getModerationService().stats();
  const cards = [
    ["待审核", stats.pending, "/admin/reviews"],
    ["已发布", stats.approved, "/admin/photos?status=approved"],
    ["已拒绝", stats.rejected, "/admin/photos?status=rejected"],
    ["已隐藏", stats.hidden, "/admin/photos?status=hidden"],
  ] as const;
  return (
    <>
      <h1 className="text-2xl font-medium">档案概览</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        欢迎回来，{admin.name}。整理影像，让校园记忆有序留存。
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href}>
            <Card className="hover:bg-muted/30 h-full">
              <CardHeader>
                <CardTitle className="text-muted-foreground text-sm font-normal">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl">{value}</p>
                <p className="text-muted-foreground mt-3 text-xs">
                  来自当前数据库
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <section className="mt-12">
        <h2 className="text-base font-medium">工作区域</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/reviews"
            className="hover:bg-muted/30 rounded-lg border p-6"
          >
            <h3 className="text-sm font-medium">投稿审核 →</h3>
            <p className="text-muted-foreground mt-3 text-sm">
              查看待审核照片并逐张处理
            </p>
          </Link>
          <Link
            href="/admin/photos"
            className="hover:bg-muted/30 rounded-lg border p-6"
          >
            <h3 className="text-sm font-medium">照片管理 →</h3>
            <p className="text-muted-foreground mt-3 text-sm">
              管理已发布、隐藏和拒绝的照片
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}
