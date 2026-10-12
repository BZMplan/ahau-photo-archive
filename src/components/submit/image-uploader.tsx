"use client";

import { useRef, type ReactNode } from "react";
import { ImagePlus, Upload } from "lucide-react";
import {
  MAX_IMAGE_BYTES,
  MAX_SUBMISSION_PHOTOS,
  MAX_SUBMISSION_PHOTO_BYTES,
} from "@/lib/submission-limits";
import type { UploadItem } from "@/lib/submission-editor";
import { Button } from "@/components/ui/button";
export type { UploadItem } from "@/lib/submission-editor";

interface ImageUploaderProps {
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
  errors: string[];
  onErrors: (errors: string[]) => void;
  disabled?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
}
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxMiB = MAX_IMAGE_BYTES / 1024 / 1024;

export function ImageUploader({
  items,
  onChange,
  errors,
  onErrors,
  disabled = false,
  children,
  actions,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  function addFiles(fileList: FileList | null) {
    if (!fileList || disabled) return;
    const next = [...items];
    const nextErrors: string[] = [];
    let totalBytes = items.reduce((total, item) => total + item.file.size, 0);
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_SUBMISSION_PHOTOS) {
        nextErrors.push(`一次最多选择 ${MAX_SUBMISSION_PHOTOS} 张照片。`);
        break;
      }
      if (!allowedTypes.has(file.type)) {
        nextErrors.push(`${file.name}：仅支持 JPEG、PNG 和 WebP。`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        nextErrors.push(`${file.name}：文件不能超过 ${maxMiB} MiB。`);
        continue;
      }
      if (totalBytes + file.size > MAX_SUBMISSION_PHOTO_BYTES) {
        nextErrors.push("图片总大小超过批次限制。");
        continue;
      }
      totalBytes += file.size;
      next.push({
        id: globalThis.crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    onChange(next);
    onErrors(nextErrors);
    if (inputRef.current) inputRef.current.value = "";
  }
  return (
    <section
      className="submission-photo-stage"
      aria-label="本地照片浏览器"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id="submission-files"
        className="sr-only"
        tabIndex={-1}
        type="file"
        aria-label="选择照片文件"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled}
        onChange={(event) => addFiles(event.target.files)}
      />
      {items.length ? (
        children
      ) : (
        <button
          id="editor-files"
          type="button"
          className="submission-upload-empty"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload aria-hidden="true" className="mb-7 size-8" strokeWidth={1} />
          <span className="text-2xl font-medium tracking-tight sm:text-3xl">
            添加你的校园影像
          </span>
          <span className="mt-4 text-sm text-white/60">
            拖拽照片到此处，或点击选择文件。
          </span>
          <span className="mt-3 text-xs text-white/40">
            JPEG、PNG、WebP · 最多 {MAX_SUBMISSION_PHOTOS} 张 · 单张 {maxMiB}{" "}
            MiB
          </span>
        </button>
      )}
      <div className="submission-viewer-tools">
        {errors.length ? (
          <ul role="alert" className="submission-upload-errors">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || items.length >= MAX_SUBMISSION_PHOTOS}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            添加照片
          </Button>
          {actions}
        </div>
      </div>
    </section>
  );
}
