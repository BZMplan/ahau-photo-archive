import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "管理概览" };

export default function AdminPage() {
  return (
    <>
      <h1 className="text-2xl font-medium">档案概览</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        整理影像，让校园记忆有序留存。
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {["待审核", "公开照片", "全部影像"].map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-normal">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl">—</p>
              <p className="text-muted-foreground mt-3 text-xs">数据尚未接入</p>
            </CardContent>
          </Card>
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
              查看审核页面结构
            </p>
          </Link>
          <Link
            href="/admin/photos"
            className="hover:bg-muted/30 rounded-lg border p-6"
          >
            <h3 className="text-sm font-medium">照片管理 →</h3>
            <p className="text-muted-foreground mt-3 text-sm">
              查看照片管理页面结构
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}
