"use client";

import Image from "next/image";
import { useState } from "react";

export interface PhotoImageData {
  title: string;
  displayUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
}

export function PhotoImage({
  photo,
  variant = "thumbnail",
  priority = false,
  className,
  onRatioChange,
}: {
  photo: PhotoImageData;
  variant?: "thumbnail" | "display";
  priority?: boolean;
  className?: string;
  onRatioChange?: (ratio: number) => void;
}) {
  const src = variant === "display" ? photo.displayUrl : photo.thumbnailUrl;
  const [failedSrc, setFailedSrc] = useState<string>();
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [natural, setNatural] = useState<{ src: string; ratio: number }>();
  const recordedRatio =
    photo.width && photo.height ? photo.width / photo.height : 4 / 3;
  const ratio = natural?.src === src ? natural.ratio : recordedRatio;
  return (
    <span
      className={
        "bg-muted relative block overflow-hidden rounded-none " +
        (className ?? "w-full")
      }
      style={{ aspectRatio: ratio }}
    >
      {failedSrc === src ? (
        <span
          role="status"
          className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center text-sm"
        >
          图片暂时无法加载：{photo.title}
        </span>
      ) : (
        <Image
          src={src}
          alt={photo.title || "校园影像"}
          width={photo.width ?? 4}
          height={photo.height ?? 3}
          sizes={
            variant === "display"
              ? "(max-width: 1024px) 100vw, 75vw"
              : "(max-width: 359px) 100vw, (max-width: 767px) 50vw, (max-width: 1099px) 33vw, (max-width: 1599px) 25vw, (max-width: 2199px) 20vw, 17vw"
          }
          unoptimized
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={(event) => {
            setLoadedSrc(src);
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) {
              const ratio = image.naturalWidth / image.naturalHeight;
              setNatural({ src, ratio });
              onRatioChange?.(ratio);
            }
          }}
          onError={() => setFailedSrc(src)}
          className={
            "absolute inset-0 h-full w-full rounded-none object-contain transition-opacity motion-reduce:transition-none " +
            (loadedSrc === src ? "opacity-100" : "opacity-0")
          }
        />
      )}
    </span>
  );
}
