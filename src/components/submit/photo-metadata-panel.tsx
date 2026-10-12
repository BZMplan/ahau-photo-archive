import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  EditorError,
  MetadataDraft,
  UploadItem,
} from "@/lib/submission-editor";

export function PhotoMetadataPanel({
  item,
  index,
  total,
  value,
  error,
  disabled,
  onChange,
}: {
  item: UploadItem | undefined;
  index: number;
  total: number;
  value: MetadataDraft;
  error: EditorError | undefined;
  disabled: boolean;
  onChange: (field: keyof MetadataDraft, value: string) => void;
}) {
  const invalid = (field: keyof MetadataDraft) =>
    error?.photoId === item?.id && error?.field === field;
  return (
    <section aria-labelledby="metadata-heading" className="submission-metadata">
      <p
        className="text-muted-foreground mb-3 font-mono text-xs tracking-widest"
        role="status"
      >
        {item
          ? String(index + 1).padStart(2, "0") +
            " / " +
            String(total).padStart(2, "0")
          : "NO PHOTO SELECTED"}
      </p>
      <h1 className="text-2xl font-medium tracking-tight">分享校园影像</h1>
      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 id="metadata-heading" className="text-sm font-medium">
          图片信息
        </h2>
        <span className="text-muted-foreground truncate text-xs">
          {item?.file.name ?? "尚未选择照片"}
        </span>
      </div>
      {!item ? (
        <p className="text-muted-foreground mt-4 text-sm leading-7">
          添加照片后即可编辑详细信息。原图只在本地预览，提交并通过审核后才会公开展示衍生图。
        </p>
      ) : (
        <fieldset disabled={disabled} className="mt-6 min-w-0 space-y-5">
          <legend className="sr-only">当前照片的元数据</legend>
          <div className="space-y-2">
            <Label htmlFor="editor-title">
              标题 <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="editor-title"
              required
              maxLength={100}
              value={value.title}
              aria-invalid={invalid("title")}
              aria-describedby={invalid("title") ? "editor-error" : undefined}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder="给这张影像一个名字"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-description">影像说明（选填）</Label>
            <Textarea
              id="editor-description"
              maxLength={1000}
              value={value.description}
              aria-invalid={invalid("description")}
              aria-describedby={
                invalid("description") ? "editor-error" : undefined
              }
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="记录画面背后的故事"
              className="min-h-24 resize-y"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-takenAt">拍摄日期（选填）</Label>
            <Input
              id="editor-takenAt"
              type="date"
              value={value.takenAt}
              aria-invalid={invalid("takenAt")}
              aria-describedby={invalid("takenAt") ? "editor-error" : undefined}
              onChange={(event) => onChange("takenAt", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-location">校园地点（选填）</Label>
            <Input
              id="editor-location"
              maxLength={100}
              value={value.location}
              aria-invalid={invalid("location")}
              aria-describedby={
                invalid("location") ? "editor-error" : undefined
              }
              onChange={(event) => onChange("location", event.target.value)}
              placeholder="例如：图书馆"
            />
          </div>
        </fieldset>
      )}
    </section>
  );
}
