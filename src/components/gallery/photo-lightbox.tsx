"use client";

import { useRef, useState } from "react";
import {
  PhotoImage,
  type PhotoImageData,
} from "@/components/gallery/photo-image";

export function PhotoLightbox({ photo }: { photo: PhotoImageData }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [ratio, setRatio] = useState(
    photo.width && photo.height ? photo.width / photo.height : 4 / 3,
  );
  return (
    <div className="min-w-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={"放大查看：" + photo.title}
        className="mx-auto block w-full cursor-zoom-in rounded-none focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{ maxWidth: `min(100%, ${ratio * 72}svh)` }}
      >
        <PhotoImage
          photo={photo}
          variant="display"
          onRatioChange={setRatio}
          priority
          className="w-full rounded-none"
        />
      </button>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        点击照片，放大查看
      </p>
      <dialog
        ref={dialog}
        aria-label={"大图：" + photo.title}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="bg-background text-foreground fixed inset-0 m-auto max-h-[100svh] max-w-[100vw] border-0 p-4 backdrop:bg-black/85 open:flex open:flex-col open:items-center"
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="mb-3 min-h-11 self-end rounded-md border px-5 text-sm"
        >
          关闭 · Esc
        </button>
        <div style={{ width: `min(calc(100vw - 2rem), ${ratio * 80}svh)` }}>
          <PhotoImage photo={photo} variant="display" priority />
        </div>
      </dialog>
    </div>
  );
}
