"use client";

import Image from "next/image";
import { useState } from "react";
import type { UploadItem } from "@/lib/submission-editor";

export function PhotoPreview({
  item,
  eager,
}: {
  item: UploadItem;
  eager: boolean;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <div className="submission-photo-frame">
      {failedUrl === item.previewUrl ? (
        <p
          role="status"
          className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-white/70"
        >
          无法预览这张照片，请检查图片文件。
        </p>
      ) : (
        <Image
          src={item.previewUrl}
          alt={"本地预览：" + item.file.name}
          fill
          unoptimized
          sizes="(max-width: 767px) 100vw, (max-width: 1099px) 60vw, 65vw"
          loading={eager ? "eager" : "lazy"}
          onLoad={() => setLoadedUrl(item.previewUrl)}
          onError={() => setFailedUrl(item.previewUrl)}
          className={
            "rounded-none object-contain transition-opacity duration-200 motion-reduce:transition-none " +
            (loadedUrl === item.previewUrl ? "opacity-100" : "opacity-0")
          }
        />
      )}
    </div>
  );
}
