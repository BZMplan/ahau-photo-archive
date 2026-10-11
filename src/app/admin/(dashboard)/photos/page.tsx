import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "照片管理" };

export default function PhotosPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">照片管理</h1>
        <Button disabled variant="outline" size="sm">
          分类与标签 · 即将开放
        </Button>
      </div>
      <p className="text-muted-foreground mt-3 mb-8 text-sm leading-7">
        维护标题、日期、地点和标签，管理公开与隐藏状态。
      </p>
      <EmptyState
        title="照片管理尚未接入"
        description="后续将支持搜索、编辑照片信息、隐藏照片及维护标签。当前不提供管理操作。"
      />
    </>
  );
}
