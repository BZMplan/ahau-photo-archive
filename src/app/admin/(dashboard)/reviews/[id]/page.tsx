import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ModerationActions } from "@/components/admin/moderation-actions";
import { PhotoMetadataEditor } from "@/components/admin/photo-metadata-editor";
import { requireAdminPage } from "@/server/auth/pages";
import {
  ModerationError,
  getModerationService,
} from "@/server/services/moderation";

export const metadata: Metadata = { title: "审核照片" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const service = getModerationService();
  let photo;
  try {
    photo = service.getPhoto(id);
  } catch (error) {
    if (error instanceof ModerationError && error.code === "NOT_FOUND")
      notFound();
    throw error;
  }
  const logs = service.listLogs(id);
  return (
    <>
      <Link
        href="/admin/reviews"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← 返回审核队列
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{photo.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {photo.authorName} · {photo.location ?? "地点待补充"}
          </p>
        </div>
        <Badge variant={photo.status === "pending" ? "secondary" : "outline"}>
          {statusLabel(photo.status)}
        </Badge>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <div className="bg-muted flex min-h-[360px] items-center justify-center overflow-hidden">
              <img
                src={photo.previewUrl}
                alt={photo.title}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
            <CardContent className="grid gap-3 py-5 text-sm sm:grid-cols-2">
              <Info
                label="投稿时间"
                value={photo.submittedAt.toLocaleString("zh-CN")}
              />
              <Info label="拍摄日期" value={photo.takenAt ?? "未填写"} />
              <Info
                label="尺寸"
                value={
                  photo.width && photo.height
                    ? `${photo.width} × ${photo.height}`
                    : "未知"
                }
              />
              <Info
                label="文件"
                value={`${photo.mimeType} · ${formatBytes(photo.byteSize)}`}
              />
              <Info label="投稿备注" value={photo.submissionMessage ?? "无"} />
              <Info
                label="审核时间"
                value={photo.reviewedAt?.toLocaleString("zh-CN") ?? "尚未审核"}
              />
            </CardContent>
          </Card>
          <PhotoMetadataEditor photo={photo} />
          <section className="rounded-xl border p-5">
            <h2 className="font-medium">审核操作</h2>
            <div className="mt-4">
              <ModerationActions photoId={photo.id} status={photo.status} />
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          <Card>
            <CardContent className="py-5">
              <h2 className="font-medium">同批投稿</h2>
              <div className="mt-4 space-y-3">
                {photo.siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/admin/reviews/${sibling.id}`}
                    className={`flex items-center gap-3 rounded-lg border p-2 ${sibling.id === photo.id ? "border-primary" : "hover:bg-muted/40"}`}
                  >
                    <img
                      src={sibling.previewUrl}
                      alt=""
                      className="size-14 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {sibling.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {statusLabel(sibling.status)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <h2 className="font-medium">审核记录</h2>
              <div className="mt-4 space-y-4">
                {logs.length ? (
                  logs.map((log) => (
                    <div key={log.id} className="border-b pb-3 last:border-0">
                      <p className="text-sm">
                        {actionLabel(log.action)} · {statusLabel(log.toStatus)}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {log.createdAt.toLocaleString("zh-CN")} · {log.adminId}
                      </p>
                      {log.note && <p className="mt-1 text-xs">{log.note}</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    暂无审核记录。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function statusLabel(status: "pending" | "approved" | "rejected" | "hidden") {
  return {
    pending: "待审核",
    approved: "已发布",
    rejected: "已拒绝",
    hidden: "已隐藏",
  }[status];
}
function actionLabel(
  action: "approve" | "reject" | "hide" | "restore" | "edit",
) {
  return {
    approve: "批准发布",
    reject: "拒绝",
    hide: "撤回发布",
    restore: "恢复发布",
    edit: "编辑信息",
  }[action];
}
