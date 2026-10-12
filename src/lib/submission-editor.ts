import {
  photoMetadataListSchema,
  photoSubmissionSchema,
} from "@/lib/validations/submission";

export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
}
export interface MetadataDraft {
  title: string;
  description: string;
  takenAt: string;
  location: string;
}
export interface AuthorDraft {
  authorName: string;
  contactEmail: string;
  message: string;
  consentAccepted: boolean;
}
export interface EditorError {
  photoId?: string;
  field: keyof MetadataDraft | keyof AuthorDraft | "files" | "turnstile";
  message: string;
}
export const emptyMetadata = (): MetadataDraft => ({
  title: "",
  description: "",
  takenAt: "",
  location: "",
});

export function nextActivePhotoId(
  previous: UploadItem[],
  next: UploadItem[],
  activeId: string | null,
) {
  if (next.some((item) => item.id === activeId)) return activeId;
  const previousIndex = Math.max(
    0,
    previous.findIndex((item) => item.id === activeId),
  );
  return next[Math.min(previousIndex, next.length - 1)]?.id ?? null;
}

export function validateEditor(
  items: UploadItem[],
  metadata: Record<string, MetadataDraft>,
  author: AuthorDraft,
  requestId: string,
  token: string,
): EditorError | undefined {
  if (!items.length) return { field: "files", message: "请至少选择一张照片。" };
  const result = photoMetadataListSchema.safeParse(
    items.map((item) => metadata[item.id] ?? emptyMetadata()),
  );
  if (!result.success) {
    const issue = result.error.issues[0];
    const index = typeof issue.path[0] === "number" ? issue.path[0] : 0;
    const field = issue.path[1];
    const labels = {
      title: "标题（1–100 字符）",
      description: "说明（最多 1000 字符）",
      takenAt: "拍摄日期",
      location: "地点（最多 100 字符）",
    };
    if (
      field === "title" ||
      field === "description" ||
      field === "takenAt" ||
      field === "location"
    )
      return {
        photoId: items[index]?.id,
        field,
        message: `第 ${index + 1} 张照片：${field === "takenAt" ? issue.message : "请检查" + labels[field] + "。"}`,
      };
    return { field: "files", message: "请选择符合数量限制的照片。" };
  }
  const common = photoSubmissionSchema.safeParse({
    ...author,
    submissionRequestId: requestId,
  });
  if (!common.success) {
    const field = common.error.issues[0].path[0];
    if (field === "authorName")
      return { field, message: "请填写投稿署名（1–50 字符）。" };
    if (field === "contactEmail")
      return { field, message: "请填写有效的联系邮箱。" };
    if (field === "message")
      return { field, message: "投稿备注不能超过 1000 字符。" };
    return { field: "consentAccepted", message: "请先确认投稿授权说明。" };
  }
  if (!token) return { field: "turnstile", message: "请完成安全验证。" };
}

export function submissionFormData(
  items: UploadItem[],
  metadata: Record<string, MetadataDraft>,
  author: AuthorDraft,
  requestId: string,
  token: string,
) {
  const form = new FormData();
  for (const item of items) form.append("files", item.file, item.file.name);
  form.set(
    "metadata",
    JSON.stringify(items.map((item) => metadata[item.id] ?? emptyMetadata())),
  );
  form.set("authorName", author.authorName);
  form.set("contactEmail", author.contactEmail);
  form.set("message", author.message);
  form.set("consentAccepted", String(author.consentAccepted));
  form.set("turnstileToken", token);
  form.set("submissionRequestId", requestId);
  return form;
}
