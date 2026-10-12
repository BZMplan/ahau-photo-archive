import Link from "next/link";
import { PhotoImage } from "@/components/gallery/photo-image";
import type { PublicPhoto } from "@/types/photo";

export function PhotoCard({
  photo,
  priority = false,
  archiveReturn,
}: {
  photo: PublicPhoto;
  priority?: boolean;
  archiveReturn?: string;
}) {
  return (
    <article className="photo-item group">
      <Link
        href={
          "/photo/" +
          photo.id +
          (archiveReturn ? "?from=" + encodeURIComponent(archiveReturn) : "")
        }
        prefetch={false}
        aria-label={[photo.title, photo.location, photo.takenAt?.slice(0, 4)]
          .filter(Boolean)
          .join(" · ")}
        className="relative block rounded-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <PhotoImage
          photo={{
            title: photo.title,
            width: photo.width,
            height: photo.height,
            thumbnailUrl: photo.thumbnailUrl,
            displayUrl: photo.displayUrl,
          }}
          priority={priority}
        />
        <div className="photo-hover-info" aria-hidden="true">
          <h2 className="text-sm leading-snug font-medium">{photo.title}</h2>
          <p className="mt-1 text-xs text-white/80">
            {photo.location ?? "地点待补充"}
            {photo.takenAt ? " · " + photo.takenAt.slice(0, 4) : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}
