import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { photoTags, photos, submissions, tags } from "@/server/db/schema";
import { getPublicImageUrl } from "@/server/storage/urls";
import type { PublicPhoto } from "@/types/photo";

const publicFields = {
  id: photos.id,
  title: photos.title,
  description: photos.description,
  location: photos.location,
  takenAt: photos.takenAt,
  publishedAt: photos.publishedAt,
  attribution: sql<
    string | null
  >`coalesce(${submissions.authorName}, ${submissions.attribution})`,
  displayKey: photos.displayKey,
  thumbnailKey: photos.thumbnailKey,
  width: photos.width,
  height: photos.height,
};
type PublicPhotoRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  takenAt: string | null;
  publishedAt: Date | null;
  attribution: string | null;
  displayKey: string | null;
  thumbnailKey: string | null;
  width: number | null;
  height: number | null;
};

const publicCondition = and(
  eq(photos.status, "approved"),
  isNotNull(photos.displayKey),
  isNotNull(photos.thumbnailKey),
  isNotNull(photos.publishedAt),
);

export function listPublicPhotos(): PublicPhoto[] {
  const db = getDb();
  return db
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(publicCondition)
    .orderBy(desc(photos.publishedAt), desc(photos.id))
    .limit(60)
    .all()
    .map((photo) => toPublicPhoto(photo, db))
    .filter((photo): photo is PublicPhoto => !!photo);
}

export function findPublicPhoto(id: string): PublicPhoto | undefined {
  const db = getDb();
  const photo = db
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(and(publicCondition, eq(photos.id, id)))
    .get();
  return photo ? toPublicPhoto(photo, db) : undefined;
}

function toPublicPhoto(
  photo: PublicPhotoRow,
  db: ReturnType<typeof getDb>,
): PublicPhoto | undefined {
  if (!photo.displayKey || !photo.thumbnailKey) return undefined;
  let displayUrl: string;
  let thumbnailUrl: string;
  try {
    displayUrl = getPublicImageUrl(photo.displayKey);
    thumbnailUrl = getPublicImageUrl(photo.thumbnailKey);
  } catch {
    return undefined;
  }
  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    location: photo.location,
    takenAt: photo.takenAt,
    publishedAt: photo.publishedAt,
    attribution: photo.attribution,
    displayUrl,
    thumbnailUrl,
    width: photo.width,
    height: photo.height,
    tags: db
      .select({ name: tags.name })
      .from(photoTags)
      .innerJoin(tags, eq(photoTags.tagId, tags.id))
      .where(eq(photoTags.photoId, photo.id))
      .all()
      .map((tag) => tag.name),
  };
}
