import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/server/auth/pages";

export const metadata: Metadata = { title: "投稿审核" };

export default async function ReviewsPage() {
  await requireAdminPage();
  return (
    <>
      <h1 className="text-2xl font-medium">投稿审核</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-7">
        审核后，照片才能进入公开档案。
      </p>
      <div className="my-8 flex flex-wrap gap-2">
        <Button disabled variant="outline" size="sm">
          待审核 · 尚未接入
        </Button>
        <Button disabled variant="ghost" size="sm">
          已通过
        </Button>
        <Button disabled variant="ghost" size="sm">
          已拒绝
        </Button>
      </div>
      <EmptyState
        title="审核队列尚未接入"
        description="此处将展示私有投稿预览、照片信息和审核操作。当前不会读取任何投稿数据。"
      />
    </>
  );
}
