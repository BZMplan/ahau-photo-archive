import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  metadataUpdateSchema,
  type MetadataUpdateInput,
} from "@/lib/validations/moderation";
import { getDb } from "@/server/db";
import type { openDatabase } from "@/server/db/connection";
import {
  moderationLogs,
  cachePurgeTasks,
  photoTags,
  photos,
  submissions,
  tags,
} from "@/server/db/schema";
import type { PhotoStatus } from "@/types/photo";
import { StorageError } from "@/server/storage/errors";
import {
  purgePublicImageUrls,
  type CachePurgeResult,
} from "@/server/storage/cache-invalidation";
import { getPublicImageUrl } from "@/server/storage/urls";
import {
  ImageOperationError,
  getImageService,
  type VersionedPublicationReceipt,
} from "./image-service";

type Database = ReturnType<typeof openDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const statuses: PhotoStatus[] = ["pending", "approved", "rejected", "hidden"];

export interface ReviewListQuery {
  status?: PhotoStatus;
  page?: number;
  pageSize?: number;
}

export interface ModerationPhotoSummary {
  id: string;
  title: string;
  description: string | null;
  takenAt: string | null;
  location: string | null;
  status: PhotoStatus;
  submittedAt: Date;
  publishedAt: Date | null;
  authorName: string;
  previewUrl: string;
  displayUrl: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  mimeType: string;
  tags: string[];
}

export interface ModerationPhotoDetail extends ModerationPhotoSummary {
  submissionId: string;
  submissionMessage: string | null;
  contactEmail: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  siblings: ModerationPhotoSummary[];
}

export interface ModerationLogDto {
  id: string;
  photoId: string;
  adminId: string;
  action: "approve" | "reject" | "hide" | "restore" | "edit";
  fromStatus: PhotoStatus;
  toStatus: PhotoStatus;
  note: string | null;
  metadataChanges: Record<string, { old: string | null; new: string | null }>;
  createdAt: Date;
}

export type ModerationErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "STORAGE_FAILURE"
  | "DATABASE_FAILURE";

export class ModerationError extends Error {
  constructor(
    readonly code: ModerationErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ModerationError";
  }
}

export interface ModerationDependencies {
  db: Database;
  imageService: Pick<
    ReturnType<typeof getImageService>,
    "publishImageVersion" | "confirmVersionPublication" | "unpublishPublication"
  >;
  purge: (keys: string[]) => Promise<CachePurgeResult>;
  now: () => Date;
}

function defaultDependencies(): ModerationDependencies {
  return {
    db: getDb(),
    imageService: getImageService(),
    purge: purgePublicImageUrls,
    now: () => new Date(),
  };
}

export class ModerationService {
  constructor(private readonly dependencies: ModerationDependencies) {}

  listReviews(query: ReviewListQuery = {}) {
    return this.listPhotos({ ...query, status: query.status ?? "pending" });
  }

  listPhotos(query: ReviewListQuery = {}) {
    const status =
      query.status && statuses.includes(query.status)
        ? query.status
        : undefined;
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Math.floor(query.pageSize ?? 24)),
    );
    const condition = status ? eq(photos.status, status) : undefined;
    const rows = this.dependencies.db
      .select({
        photo: photos,
        authorName: sql<string>`coalesce(${submissions.authorName}, ${submissions.attribution}, '匿名投稿')`,
      })
      .from(photos)
      .innerJoin(submissions, eq(photos.submissionId, submissions.id))
      .where(condition)
      .orderBy(
        desc(status === "pending" ? photos.submittedAt : photos.publishedAt),
        desc(photos.submittedAt),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const total =
      this.dependencies.db
        .select({ value: count() })
        .from(photos)
        .where(condition)
        .get()?.value ?? 0;
    return {
      items: rows.map(({ photo, authorName }) =>
        this.toSummary(photo, authorName),
      ),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  getPhoto(photoId: string): ModerationPhotoDetail {
    const row = this.dependencies.db
      .select({ photo: photos, submission: submissions })
      .from(photos)
      .innerJoin(submissions, eq(photos.submissionId, submissions.id))
      .where(eq(photos.id, photoId))
      .get();
    if (!row) throw new ModerationError("NOT_FOUND", "照片不存在。");
    const siblingRows = this.dependencies.db
      .select({
        photo: photos,
        authorName: sql<string>`coalesce(${submissions.authorName}, ${submissions.attribution}, '匿名投稿')`,
      })
      .from(photos)
      .innerJoin(submissions, eq(photos.submissionId, submissions.id))
      .where(eq(photos.submissionId, row.photo.submissionId))
      .orderBy(photos.submittedAt, photos.id)
      .all();
    return {
      ...this.toSummary(
        row.photo,
        row.submission.authorName ?? row.submission.attribution ?? "匿名投稿",
      ),
      submissionId: row.photo.submissionId,
      submissionMessage: row.submission.message,
      contactEmail: row.submission.contactEmail,
      reviewedBy: row.photo.reviewedBy,
      reviewedAt: row.photo.reviewedAt,
      rejectionReason: row.photo.rejectionReason,
      siblings: siblingRows.map(({ photo, authorName }) =>
        this.toSummary(photo, authorName),
      ),
    };
  }

  listLogs(photoId: string): ModerationLogDto[] {
    this.requirePhoto(photoId);
    return this.dependencies.db
      .select()
      .from(moderationLogs)
      .where(eq(moderationLogs.photoId, photoId))
      .orderBy(desc(moderationLogs.createdAt), desc(moderationLogs.id))
      .all() as ModerationLogDto[];
  }

  stats() {
    const rows = this.dependencies.db
      .select({ status: photos.status, value: count() })
      .from(photos)
      .groupBy(photos.status)
      .all();
    return Object.fromEntries(
      statuses.map((status) => [
        status,
        rows.find((row) => row.status === status)?.value ?? 0,
      ]),
    ) as Record<PhotoStatus, number>;
  }

  async approvePhoto(
    photoId: string,
    adminId: string,
    requestHeaders: Headers,
  ) {
    return this.publishFrom(
      photoId,
      adminId,
      requestHeaders,
      "pending",
      "approve",
    );
  }

  async restorePhoto(
    photoId: string,
    adminId: string,
    requestHeaders: Headers,
  ) {
    return this.publishFrom(
      photoId,
      adminId,
      requestHeaders,
      "hidden",
      "restore",
    );
  }

  rejectPhoto(photoId: string, adminId: string, reason?: string) {
    const note = reason?.trim() || null;
    if (note && note.length > 1000)
      throw new ModerationError(
        "INVALID_INPUT",
        "拒绝原因不能超过 1000 个字符。",
      );
    const now = this.dependencies.now();
    const result = this.dependencies.db.transaction((tx) => {
      const current = tx
        .select()
        .from(photos)
        .where(eq(photos.id, photoId))
        .get();
      if (!current) throw new ModerationError("NOT_FOUND", "照片不存在。");
      if (current.status !== "pending")
        throw new ModerationError("CONFLICT", "只有待审核照片可以拒绝。");
      const updated = tx
        .update(photos)
        .set({
          status: "rejected",
          reviewedBy: adminId,
          reviewedAt: now,
          rejectionReason: note,
          updatedAt: now,
        })
        .where(and(eq(photos.id, photoId), eq(photos.status, "pending")))
        .returning()
        .get();
      if (!updated)
        throw new ModerationError(
          "CONFLICT",
          "照片状态已经发生变化，请刷新后重试。",
        );
      tx.insert(moderationLogs)
        .values({
          photoId,
          adminId,
          action: "reject",
          fromStatus: "pending",
          toStatus: "rejected",
          note,
          createdAt: now,
        })
        .run();
      return updated;
    });
    revalidateAdminPaths();
    return { photoId: result.id, status: result.status };
  }

  async hidePhoto(
    photoId: string,
    adminId: string,
    requestHeaders: Headers,
    reason?: string,
  ) {
    const normalizedReason = reason?.trim() || null;
    if (normalizedReason && normalizedReason.length > 1000)
      throw new ModerationError(
        "INVALID_INPUT",
        "撤回原因不能超过 1000 个字符。",
      );
    const current = this.requirePhoto(photoId);
    if (current.status !== "approved")
      throw new ModerationError("CONFLICT", "只有已发布照片可以撤回。");
    if (!current.displayKey || !current.thumbnailKey)
      throw new ModerationError("STORAGE_FAILURE", "公开图片文件记录不完整。");
    const keys = {
      displayKey: current.displayKey,
      thumbnailKey: current.thumbnailKey,
    };
    const now = this.dependencies.now();
    const updated = this.dependencies.db.transaction((tx) => {
      const changed = tx
        .update(photos)
        .set({
          status: "hidden",
          displayKey: null,
          thumbnailKey: null,
          publicationId: null,
          publishedAt: null,
          reviewedBy: adminId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(and(eq(photos.id, photoId), eq(photos.status, "approved")))
        .returning()
        .get();
      if (!changed)
        throw new ModerationError(
          "CONFLICT",
          "照片状态已经发生变化，请刷新后重试。",
        );
      tx.insert(moderationLogs)
        .values({
          photoId,
          adminId,
          action: "hide",
          fromStatus: "approved",
          toStatus: "hidden",
          note: normalizedReason,
          createdAt: now,
        })
        .run();
      return changed;
    });
    let cleanup: "complete" | "failed" = "complete";
    try {
      await this.dependencies.imageService.unpublishPublication(
        photoId,
        keys,
        requestHeaders,
      );
    } catch (error) {
      cleanup = "failed";
      console.error(
        JSON.stringify({
          event: "moderation_unpublish_failed",
          photoId,
          code: moderationErrorCode(error),
        }),
      );
    }
    const purgeTask = this.dependencies.db
      .insert(cachePurgeTasks)
      .values({
        photoId,
        keys: Object.values(keys),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    const cachePurge = await this.dependencies.purge(Object.values(keys));
    this.dependencies.db
      .update(cachePurgeTasks)
      .set({
        status: cachePurge.status,
        errorCode: cachePurge.status === "failed" ? cachePurge.reason : null,
        updatedAt: this.dependencies.now(),
      })
      .where(eq(cachePurgeTasks.id, purgeTask.id))
      .run();
    if (cleanup === "failed")
      throw new ModerationError(
        "STORAGE_FAILURE",
        "照片已从公开查询中撤回，但公开文件清理失败，请稍后重试。",
        { cachePurge },
      );
    if (cachePurge.status === "failed")
      throw new ModerationError(
        "STORAGE_FAILURE",
        "照片已撤回，但 CDN 缓存清除失败，请人工重试。",
        { cachePurge },
      );
    revalidateAdminPaths();
    return { photoId: updated.id, status: updated.status, cleanup, cachePurge };
  }

  updateMetadata(photoId: string, adminId: string, input: unknown) {
    const parsed = metadataUpdateSchema.safeParse(input);
    if (!parsed.success)
      throw new ModerationError(
        "INVALID_INPUT",
        "照片信息格式不正确。",
        parsed.error.flatten(),
      );
    const now = this.dependencies.now();
    const result = this.dependencies.db.transaction((tx) =>
      this.updateMetadataTransaction(tx, photoId, adminId, parsed.data, now),
    );
    revalidateAdminPaths();
    return this.toSummary(result.photo, result.authorName);
  }

  private updateMetadataTransaction(
    tx: Transaction,
    photoId: string,
    adminId: string,
    values: MetadataUpdateInput,
    now: Date,
  ) {
    const row = tx
      .select({
        photo: photos,
        authorName: sql<string>`coalesce(${submissions.authorName}, ${submissions.attribution}, '匿名投稿')`,
      })
      .from(photos)
      .innerJoin(submissions, eq(photos.submissionId, submissions.id))
      .where(eq(photos.id, photoId))
      .get();
    if (!row) throw new ModerationError("NOT_FOUND", "照片不存在。");
    const changes: Record<string, { old: string | null; new: string | null }> =
      {};
    for (const [key, next] of Object.entries({
      title: values.title,
      description: values.description,
      takenAt: values.takenAt,
      location: values.location,
    })) {
      const old = String(
        row.photo[key as "title" | "description" | "takenAt" | "location"] ??
          "",
      );
      const normalizedNew = next ?? "";
      if (old !== normalizedNew)
        changes[key] = { old: old || null, new: normalizedNew || null };
    }
    const normalizedTags = [
      ...new Set(values.tags.map(normalizeTagName).filter(Boolean)),
    ];
    const oldTagNames = tx
      .select({ name: tags.name })
      .from(photoTags)
      .innerJoin(tags, eq(photoTags.tagId, tags.id))
      .where(eq(photoTags.photoId, photoId))
      .all()
      .map((tag) => tag.name);
    if (oldTagNames.join("\u0000") !== normalizedTags.join("\u0000"))
      changes.tags = {
        old: oldTagNames.join(", ") || null,
        new: normalizedTags.join(", ") || null,
      };
    tx.update(photos)
      .set({
        title: values.title,
        description: values.description,
        takenAt: values.takenAt,
        location: values.location,
        updatedAt: now,
      })
      .where(eq(photos.id, photoId))
      .run();
    tx.delete(photoTags).where(eq(photoTags.photoId, photoId)).run();
    for (const name of normalizedTags) {
      const slug = normalizeTagSlug(name);
      const slugOwner = tx
        .select({ name: tags.name })
        .from(tags)
        .where(eq(tags.slug, slug))
        .get();
      tx.insert(tags)
        .values({
          id: randomUUID(),
          name,
          slug:
            slugOwner && slugOwner.name !== name
              ? `${slug}-${randomUUID().slice(0, 8)}`
              : slug,
          createdAt: now,
        })
        .onConflictDoNothing({ target: tags.name })
        .run();
      const tag = tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name))
        .get();
      if (tag)
        tx.insert(photoTags)
          .values({ photoId, tagId: tag.id })
          .onConflictDoNothing()
          .run();
    }
    tx.insert(moderationLogs)
      .values({
        photoId,
        adminId,
        action: "edit",
        fromStatus: row.photo.status,
        toStatus: row.photo.status,
        metadataChanges: changes,
        createdAt: now,
      })
      .run();
    const updated = tx
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .get();
    if (!updated)
      throw new ModerationError("DATABASE_FAILURE", "照片信息保存失败。");
    return { photo: updated, authorName: row.authorName };
  }

  private async publishFrom(
    photoId: string,
    adminId: string,
    requestHeaders: Headers,
    expected: "pending" | "hidden",
    action: "approve" | "restore",
  ) {
    const current = this.requirePhoto(photoId);
    if (current.status !== expected)
      throw new ModerationError(
        "CONFLICT",
        expected === "pending"
          ? "只有待审核照片可以批准。"
          : "只有已隐藏照片可以恢复。",
      );
    if (!current.originalKey)
      throw new ModerationError("STORAGE_FAILURE", "原图记录不存在。");
    const receipt = await this.dependencies.imageService.publishImageVersion(
      photoId,
      current.originalKey,
      requestHeaders,
    );
    const now = this.dependencies.now();
    let updated: typeof current;
    try {
      updated = this.dependencies.db.transaction((tx) => {
        const changed = tx
          .update(photos)
          .set({
            status: "approved",
            displayKey: receipt.displayKey,
            thumbnailKey: receipt.thumbnailKey,
            publicationId: receipt.publicationId,
            publishedAt: now,
            reviewedBy: adminId,
            reviewedAt: now,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(and(eq(photos.id, photoId), eq(photos.status, expected)))
          .returning()
          .get();
        if (!changed)
          throw new ModerationError(
            "CONFLICT",
            "照片状态已经发生变化，请刷新后重试。",
          );
        tx.insert(moderationLogs)
          .values({
            photoId,
            adminId,
            action,
            fromStatus: expected,
            toStatus: "approved",
            createdAt: now,
          })
          .run();
        return changed;
      });
    } catch (error) {
      await this.compensatePublication(photoId, receipt, requestHeaders, error);
      throw error;
    }
    try {
      await this.dependencies.imageService.confirmVersionPublication(
        receipt,
        requestHeaders,
      );
    } catch (error) {
      const rolledBack = await this.rollbackUnconfirmedPublication(
        photoId,
        adminId,
        receipt,
        requestHeaders,
        error,
      );
      throw new ModerationError(
        "STORAGE_FAILURE",
        rolledBack
          ? "公开文件确认失败，照片已保持隐藏，请稍后重试。"
          : "公开文件确认失败，状态需要人工恢复，请通过操作记录排查。",
      );
    }
    revalidateAdminPaths();
    return {
      photoId: updated.id,
      status: updated.status,
      publicationId: receipt.publicationId,
    };
  }

  private async compensatePublication(
    photoId: string,
    receipt: VersionedPublicationReceipt,
    requestHeaders: Headers,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.dependencies.imageService.unpublishPublication(
        photoId,
        { displayKey: receipt.displayKey, thumbnailKey: receipt.thumbnailKey },
        requestHeaders,
      );
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          event: "moderation_publication_cleanup_failed",
          photoId,
          operationId: receipt.operationId,
          code: moderationErrorCode(cleanupError),
        }),
      );
      throw new ModerationError(
        "STORAGE_FAILURE",
        "审核未完成，公开文件清理失败，请通过操作记录恢复。",
        { originalError, cleanupError },
      );
    }
  }

  private async rollbackUnconfirmedPublication(
    photoId: string,
    adminId: string,
    receipt: VersionedPublicationReceipt,
    requestHeaders: Headers,
    originalError: unknown,
  ): Promise<boolean> {
    const now = this.dependencies.now();
    let rolledBack = false;
    try {
      this.dependencies.db.transaction((tx) => {
        const changed = tx
          .update(photos)
          .set({
            status: "hidden",
            displayKey: null,
            thumbnailKey: null,
            publicationId: null,
            publishedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(photos.id, photoId),
              eq(photos.status, "approved"),
              eq(photos.displayKey, receipt.displayKey),
              eq(photos.thumbnailKey, receipt.thumbnailKey),
            ),
          )
          .returning()
          .get();
        if (!changed) return;
        rolledBack = true;
        tx.insert(moderationLogs)
          .values({
            photoId,
            adminId,
            action: "hide",
            fromStatus: "approved",
            toStatus: "hidden",
            note: "公开文件确认失败，系统自动撤回。",
            createdAt: now,
          })
          .run();
      });
    } catch (rollbackError) {
      console.error(
        JSON.stringify({
          event: "moderation_publication_rollback_failed",
          photoId,
          operationId: receipt.operationId,
          code: moderationErrorCode(rollbackError),
        }),
      );
    }
    try {
      await this.dependencies.imageService.unpublishPublication(
        photoId,
        { displayKey: receipt.displayKey, thumbnailKey: receipt.thumbnailKey },
        requestHeaders,
      );
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          event: "moderation_publication_rollback_cleanup_failed",
          photoId,
          operationId: receipt.operationId,
          code: moderationErrorCode(cleanupError),
          original: moderationErrorCode(originalError),
        }),
      );
    }
    return rolledBack;
  }

  private requirePhoto(photoId: string) {
    const photo = this.dependencies.db
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .get();
    if (!photo) throw new ModerationError("NOT_FOUND", "照片不存在。");
    return photo;
  }

  private toSummary(
    photo: typeof photos.$inferSelect,
    authorName: string,
  ): ModerationPhotoSummary {
    return {
      id: photo.id,
      title: photo.title,
      description: photo.description,
      takenAt: photo.takenAt,
      location: photo.location,
      status: photo.status,
      submittedAt: photo.submittedAt,
      publishedAt: photo.publishedAt,
      authorName,
      previewUrl: `/api/admin/photos/${photo.id}/preview`,
      displayUrl: safePublicUrl(photo.displayKey),
      thumbnailUrl: safePublicUrl(photo.thumbnailKey),
      width: photo.width,
      height: photo.height,
      byteSize: photo.byteSize,
      mimeType: photo.mimeType,
      tags: this.dependencies.db
        .select({ name: tags.name })
        .from(photoTags)
        .innerJoin(tags, eq(photoTags.tagId, tags.id))
        .where(eq(photoTags.photoId, photo.id))
        .orderBy(tags.name)
        .all()
        .map((tag) => tag.name),
    };
  }
}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeTagSlug(value: string): string {
  return (
    value
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .slice(0, 80) || randomUUID()
  );
}

function moderationErrorCode(error: unknown): string {
  if (error instanceof ImageOperationError) return error.code;
  if (error instanceof StorageError) return error.code;
  if (error instanceof ModerationError) return error.code;
  return "INTERNAL_ERROR";
}

function safePublicUrl(key: string | null): string | null {
  if (!key) return null;
  try {
    return getPublicImageUrl(key);
  } catch {
    return null;
  }
}

function revalidateAdminPaths(): void {
  try {
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/reviews");
    revalidatePath("/admin/photos");
  } catch {
    // Tests and non-request contexts may not have an incremental cache.
  }
}

export function getModerationService(): ModerationService {
  return new ModerationService(defaultDependencies());
}
