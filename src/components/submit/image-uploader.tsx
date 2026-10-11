"use client";

import { useRef } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import {
  MAX_IMAGE_BYTES,
  MAX_SUBMISSION_PHOTOS,
} from "@/lib/submission-limits";
import { Button } from "@/components/ui/button";

export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface ImageUploaderProps {
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
  errors: string[];
  onErrors: (errors: string[]) => void;
}

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ImageUploader({
  items,
  onChange,
  errors,
  onErrors,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next = [...items];
    const nextErrors: string[] = [];
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_SUBMISSION_PHOTOS) {
        nextErrors.push("一次最多选择 5 张照片。");
        break;
      }
      if (!allowedTypes.has(file.type)) {
        nextErrors.push(`${file.name}：仅支持 JPEG、PNG 和 WebP。`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        nextErrors.push(`${file.name}：文件不能超过 10 MB。`);
        continue;
      }
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
  function remove(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(items.filter((candidate) => candidate.id !== id));
  }
  return (
    <div className="space-y-4">
      <button
        type="button"
        className="text-muted-foreground hover:border-foreground hover:text-foreground flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-5 text-sm transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="size-6" strokeWidth={1.25} aria-hidden="true" />
        <span>点击选择或拖拽照片到这里</span>
        <span className="text-xs">
          JPEG、PNG、WebP · 最多 5 张 · 单张不超过 10 MB
        </span>
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => addFiles(event.target.files)}
      />
      {errors.length > 0 && (
        <ul className="text-destructive space-y-1 text-sm" role="alert">
          {errors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              className="bg-muted/30 relative flex gap-3 rounded-lg border p-2"
              key={item.id}
            >
              <Image
                className="size-20 rounded object-cover"
                src={item.previewUrl}
                alt=""
                width={80}
                height={80}
                unoptimized
              />
              <div className="min-w-0 flex-1 py-1">
                <p className="truncate text-sm font-medium">{item.file.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`删除 ${item.file.name}`}
                onClick={() => remove(item.id)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
