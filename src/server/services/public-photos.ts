import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  photoTags,
  photos,
  submissions,
  tags,
  locations,
} from "@/server/db/schema";
import { getPublicImageUrl } from "@/server/storage/urls";
import type {
  PublicPhoto,
  PublicPhotoPage,
  PublicPhotoSort,
  PublicTag,
} from "@/types/photo";

import {
  parseArchiveQuery,
  type ArchiveQuery,
} from "@/lib/validations/archive";
export { parseArchiveQuery, seasonLabels } from "@/lib/validations/archive";
export type { ArchiveQuery } from "@/lib/validations/archive";
import { cache } from "react";
const HOMEPAGE_PAGE_SIZE = 12;

// Linked names follow the managed catalog; untouched historical text remains readable.
const locationName = sql<
  string | null
>`coalesce((select ${locations.name} from ${locations} where ${locations.id} = ${photos.locationId}), ${photos.location})`;

const publicFields = {
  id: photos.id,
  title: photos.title,
  description: photos.description,
  location: locationName,
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

const seasonCondition = (season: NonNullable<ArchiveQuery["season"]>) => {
  const month = sql<number>`cast(substr(${photos.takenAt}, 6, 2) as integer)`;
  if (season === "spring")
    return and(isNotNull(photos.takenAt), sql`${month} between 3 and 5`);
  if (season === "summer")
    return and(isNotNull(photos.takenAt), sql`${month} between 6 and 8`);
  if (season === "autumn")
    return and(isNotNull(photos.takenAt), sql`${month} between 9 and 11`);
  return and(
    isNotNull(photos.takenAt),
    or(sql`${month} = 12`, sql`${month} between 1 and 2`),
  );
};

function archiveCondition(query: ArchiveQuery) {
  const conditions = [publicCondition];
  if (query.year)
    conditions.push(
      and(
        sql`${photos.takenAt} >= ${query.year + "-01-01"}`,
        sql`${photos.takenAt} <= ${query.year + "-12-31"}`,
      ),
    );
  if (query.season) conditions.push(seasonCondition(query.season));
  if (query.location)
    conditions.push(
      sql`normalize_location(${locationName}) = normalize_location(${query.location})`,
    );
  if (query.tag)
    conditions.push(
      exists(
        getDb()
          .select({ value: sql`1` })
          .from(photoTags)
          .innerJoin(tags, eq(photoTags.tagId, tags.id))
          .where(
            and(eq(photoTags.photoId, photos.id), eq(tags.slug, query.tag)),
          ),
      ),
    );
  return and(...conditions);
}

function orderFor(sort: PublicPhotoSort) {
  if (sort === "published-asc")
    return [asc(photos.publishedAt), asc(photos.id)] as const;
  if (sort === "taken-desc")
    return [
      asc(isNull(photos.takenAt)),
      desc(photos.takenAt),
      desc(photos.id),
    ] as const;
  if (sort === "taken-asc")
    return [
      asc(isNull(photos.takenAt)),
      asc(photos.takenAt),
      asc(photos.id),
    ] as const;
  return [desc(photos.publishedAt), desc(photos.id)] as const;
}

function tagRowsForPhotos(db: ReturnType<typeof getDb>, ids: string[]) {
  const result = new Map<string, { names: string[]; slugs: string[] }>();
  if (!ids.length) return result;
  const rows = db
    .select({ photoId: photoTags.photoId, name: tags.name, slug: tags.slug })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(inArray(photoTags.photoId, ids))
    .orderBy(asc(tags.name), asc(tags.slug))
    .all();
  for (const row of rows) {
    const current = result.get(row.photoId) ?? { names: [], slugs: [] };
    current.names.push(row.name);
    current.slugs.push(row.slug);
    result.set(row.photoId, current);
  }
  return result;
}

function toPublicPhotos(
  rows: PublicPhotoRow[],
  db: ReturnType<typeof getDb>,
): PublicPhoto[] {
  const tagMap = tagRowsForPhotos(
    db,
    rows.map((row) => row.id),
  );
  return rows.flatMap((photo) => {
    if (!photo.displayKey || !photo.thumbnailKey) return [];
    const displayUrl = getPublicImageUrl(photo.displayKey);
    const thumbnailUrl = getPublicImageUrl(photo.thumbnailKey);
    const photoTags = tagMap.get(photo.id) ?? { names: [], slugs: [] };
    return [
      {
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
        tags: photoTags.names,
        tagSlugs: photoTags.slugs,
      },
    ];
  });
}

export function getPublishedPhotos(queryInput: unknown = {}): PublicPhotoPage {
  const query = parseArchiveQuery(queryInput);
  const db = getDb();
  const condition = archiveCondition(query);
  const rows = db
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(condition)
    .orderBy(...orderFor(query.sort))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all() as PublicPhotoRow[];
  const total =
    db.select({ value: count() }).from(photos).where(condition).get()?.value ??
    0;
  return {
    items: toPublicPhotos(rows, db),
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    total,
  };
}

export function listPublicPhotos(): PublicPhoto[] {
  return getPublishedPhotos({ pageSize: HOMEPAGE_PAGE_SIZE }).items;
}

export function findPublicPhoto(id: string): PublicPhoto | undefined {
  return getPublishedPhotoById(id);
}

export const getPublishedPhotoById = cache(
  (id: string): PublicPhoto | undefined => {
    const db = getDb();
    const row = db
      .select(publicFields)
      .from(photos)
      .innerJoin(submissions, eq(photos.submissionId, submissions.id))
      .where(and(publicCondition, eq(photos.id, id)))
      .get() as PublicPhotoRow | undefined;
    return row ? toPublicPhotos([row], db)[0] : undefined;
  },
);

export function getPublishedTags(): PublicTag[] {
  return getDb()
    .select({
      name: tags.name,
      slug: tags.slug,
      count: count(photoTags.photoId),
    })
    .from(tags)
    .innerJoin(photoTags, eq(photoTags.tagId, tags.id))
    .innerJoin(photos, eq(photoTags.photoId, photos.id))
    .where(publicCondition)
    .groupBy(tags.id, tags.name, tags.slug)
    .orderBy(asc(tags.name))
    .all();
}

export const getPublishedTagBySlug = cache(
  (slug: string): PublicTag | undefined => {
    const db = getDb();
    const tag = db
      .select({ name: tags.name, slug: tags.slug, id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .get();
    if (!tag) return undefined;
    const total =
      db
        .select({ value: count() })
        .from(photoTags)
        .innerJoin(photos, eq(photoTags.photoId, photos.id))
        .where(and(publicCondition, eq(photoTags.tagId, tag.id)))
        .get()?.value ?? 0;
    return { name: tag.name, slug: tag.slug, count: total };
  },
);

export function getArchiveFilters() {
  const db = getDb();
  const condition = publicCondition;
  const years = db
    .select({ year: sql<string>`substr(${photos.takenAt}, 1, 4)` })
    .from(photos)
    .where(and(condition, isNotNull(photos.takenAt)))
    .groupBy(sql`substr(${photos.takenAt}, 1, 4)`)
    .orderBy(desc(sql`substr(${photos.takenAt}, 1, 4)`))
    .all()
    .map((row) => row.year);
  const locations = db
    .select({ value: sql<string>`normalize_location(${locationName})` })
    .from(photos)
    .where(
      and(
        condition,
        isNotNull(locationName),
        sql`normalize_location(${locationName}) <> ''`,
      ),
    )
    .groupBy(sql`normalize_location(${locationName})`)
    .orderBy(asc(sql`normalize_location(${locationName})`))
    .all()
    .map((row) => row.value)
    .filter((value): value is string => Boolean(value));
  return { years, locations, tags: getPublishedTags() };
}

export function getRelatedPhotos(photoId: string, limit = 4): PublicPhoto[] {
  const photo = getPublishedPhotoById(photoId);
  if (!photo) return [];
  const db = getDb();
  const relatedCondition = or(
    photo.location
      ? sql`normalize_location(${locationName}) = normalize_location(${photo.location})`
      : undefined,
    photo.tagSlugs.length
      ? exists(
          db
            .select({ value: sql`1` })
            .from(photoTags)
            .innerJoin(tags, eq(photoTags.tagId, tags.id))
            .where(
              and(
                eq(photoTags.photoId, photos.id),
                inArray(tags.slug, photo.tagSlugs),
              ),
            ),
        )
      : undefined,
  );
  if (!relatedCondition) return [];
  const rows = db
    .select(publicFields)
    .from(photos)
    .innerJoin(submissions, eq(photos.submissionId, submissions.id))
    .where(
      and(publicCondition, relatedCondition, sql`${photos.id} <> ${photoId}`),
    )
    .orderBy(desc(photos.publishedAt), desc(photos.id))
    .limit(Math.max(1, Math.min(limit, 12)))
    .all() as PublicPhotoRow[];
  return toPublicPhotos(rows, db);
}

// Sitemap reads only public identifiers, in bounded database batches.
export function listPublishedPhotoIds(): string[] {
  const ids: string[] = [];
  let after = "";
  for (;;) {
    const batch = getDb()
      .select({ id: photos.id })
      .from(photos)
      .where(and(publicCondition, sql`${photos.id} > ${after}`))
      .orderBy(asc(photos.id))
      .limit(1000)
      .all();
    ids.push(...batch.map((row) => row.id));
    if (batch.length < 1000) return ids;
    after = batch[batch.length - 1].id;
  }
}
