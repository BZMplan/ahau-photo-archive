"use client";

import { useCallback, useEffect, useRef } from "react";
import type { UploadItem } from "@/lib/submission-editor";

export function useActivePhoto(
  items: UploadItem[],
  activeId: string | null,
  onActiveChange: (id: string) => void,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeId);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const scrollToPhoto = useCallback(
    (id: string, behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      const slide = Array.from(
        viewport?.querySelectorAll<HTMLElement>("[data-photo-id]") ?? [],
      ).find((element) => element.dataset.photoId === id);
      if (!viewport || !slide) return;
      viewport.scrollTo({
        top: slide.offsetTop,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : behavior,
      });
    },
    [],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !items.length) return;
    const slides = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-photo-id]"),
    );
    let disposed = false;
    // At 60% visibility only one full-height slide can qualify; the midpoint keeps the previous selection.
    const observer = new IntersectionObserver(
      (entries) => {
        if (disposed) return;
        const visible = entries
          .filter(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6,
          )
          .at(-1);
        const id = (visible?.target as HTMLElement | undefined)?.dataset
          .photoId;
        if (id) onActiveChange(id);
      },
      { root: viewport, threshold: [0, 0.6, 1] },
    );
    for (const slide of slides) observer.observe(slide);
    if (activeRef.current) scrollToPhoto(activeRef.current, "auto");
    let previousHeight = viewport.clientHeight;
    const resize = new ResizeObserver(() => {
      if (disposed) return;
      if (viewport.clientHeight !== previousHeight) {
        previousHeight = viewport.clientHeight;
        if (activeRef.current) scrollToPhoto(activeRef.current, "auto");
      }
    });
    resize.observe(viewport);
    const settled = () => {
      const center =
        viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
      const nearest = slides.reduce<HTMLElement | undefined>((best, slide) => {
        const bounds = slide.getBoundingClientRect();
        const distance = Math.abs(bounds.top + bounds.height / 2 - center);
        if (!best) return slide;
        const bestBounds = best.getBoundingClientRect();
        return distance <
          Math.abs(bestBounds.top + bestBounds.height / 2 - center)
          ? slide
          : best;
      }, undefined);
      if (nearest?.dataset.photoId) onActiveChange(nearest.dataset.photoId);
    };
    viewport.addEventListener("scrollend", settled);
    return () => {
      disposed = true;
      observer.disconnect();
      resize.disconnect();
      viewport.removeEventListener("scrollend", settled);
    };
  }, [items, onActiveChange, scrollToPhoto]);
  return { viewportRef, scrollToPhoto };
}
