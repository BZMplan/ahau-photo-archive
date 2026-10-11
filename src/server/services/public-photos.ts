import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { photos, submissions } from "@/server/db/schema";
import type { PublicPhoto } from "@/types/photo";

const publicFields = {
  id: photos.id,
  title: photos.title,
  description: photos.description,
  location: photos.location,
  takenAt: photos.takenAt,
  publishedAt: photos.publishedAt,
  attribution: submissions.attribution,
};

const publicCondition = and(
  eq(photos.status, "approved"),
  isNotNull(photos.displayKey),
  isNotNull(photos.thumbnailKey),
  isNotNull(photos.publishedAt),
);

export function listPublicPhotos(): PublicPhoto[] {
  return getDb()
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(publicCondition)
    .orderBy(desc(photos.publishedAt), desc(photos.id))
    .limit(60)
    .all();
}

export function findPublicPhoto(id: string): PublicPhoto | undefined {
  return getDb()
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(and(publicCondition, eq(photos.id, id)))
    .get();
}
