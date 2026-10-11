import Link from "next/link";
import { PhotoImage } from "@/components/gallery/photo-image";
import type { PublicPhoto } from "@/types/photo";

export function PhotoCard({
  photo,
  priority = false,
}: {
  photo: PublicPhoto;
  priority?: boolean;
}) {
  return (
    <article className="group break-inside-avoid">
      <Link
        href={"/photo/" + photo.id}
        className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <div className="bg-muted overflow-hidden rounded-lg">
          <PhotoImage
            photo={{
              title: photo.title,
              width: photo.width,
              height: photo.height,
              thumbnailUrl: photo.thumbnailUrl,
              displayUrl: photo.displayUrl,
            }}
            priority={priority}
            className="w-full transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
        </div>
        <div className="pt-4">
          <h2 className="text-sm font-medium group-hover:underline">
            {photo.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {photo.location ?? "地点待补充"}
            {photo.takenAt ? " · " + photo.takenAt : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}
