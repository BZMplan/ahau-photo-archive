import "server-only";
import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import type { openDatabase } from "@/server/db/connection";
import {
  photos,
  submissionOperations,
  submissionRateLimits,
  submissions,
} from "@/server/db/schema";
import {
  MAX_IMAGE_BYTES,
  MAX_SUBMISSION_PHOTO_BYTES,
  MAX_SUBMISSION_PHOTOS,
  PHOTOS_PER_DAY,
  SUBMISSIONS_PER_HOUR,
  SUBMISSION_DAY_MS,
  SUBMISSION_HOUR_MS,
} from "@/lib/submission-limits";
import {
  photoMetadataListSchema,
  photoSubmissionSchema,
  type PhotoMetadataInput,
} from "@/lib/validations/submission";
import { ImageValidationError } from "@/server/images/errors";
import { ImageService, getImageService } from "@/server/services/image-service";
import { StorageError } from "@/server/storage/errors";
import { previewKey } from "@/server/storage/keys";
import {
  TurnstileError,
  verifyTurnstile,
  type TurnstileVerification,
} from "@/server/security/turnstile";

type Database = ReturnType<typeof openDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Clock = () => Date;

export interface SubmissionFile {
  file: File;
  metadata: unknown;
}

export interface CreateSubmissionInput {
  authorName: string;
  contactEmail?: string;
  message?: string;
  consentAccepted: boolean;
  submissionRequestId: string;
  turnstileToken: string;
  sourceKey: string;
  files: SubmissionFile[];
}

export interface SubmissionResult {
  submissionId: string;
  photoCount: number;
  status: "pending";
}

export type SubmissionErrorCode =
  | "INVALID_INPUT"
  | "NO_FILES"
  | "TOO_MANY_FILES"
  | "PAYLOAD_TOO_LARGE"
  | "TURNSTILE_INVALID"
  | "RATE_LIMITED"
  | "DUPLICATE_REQUEST"
  | "STORAGE_FAILURE"
  | "DATABASE_FAILURE";

export class SubmissionError extends Error {
  constructor(
    readonly code: SubmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

export class SubmissionRateLimitError extends SubmissionError {
  constructor(readonly retryAfter: number) {
    super("RATE_LIMITED", "投稿频率或照片数量已达到限制，请稍后再试。");
    this.name = "SubmissionRateLimitError";
  }
}

export interface SubmissionDependencies {
  db: Database;
  imageService: Pick<
    ImageService,
    | "saveOriginal"
    | "generatePreview"
    | "cleanupPrivateFiles"
    | "cleanupPrivatePhoto"
  >;
  verifyTurnstile: (token: string) => Promise<TurnstileVerification>;
  now: Clock;
}

const defaultDependencies = (): SubmissionDependencies => ({
  db: getDb(),
  imageService: getImageService(),
  verifyTurnstile,
  now: () => new Date(),
});

export class SubmissionService {
  constructor(private readonly dependencies: SubmissionDependencies) {}

  async create(input: CreateSubmissionInput): Promise<SubmissionResult> {
    const parsed = photoSubmissionSchema.safeParse({
      authorName: input.authorName,
      contactEmail: input.contactEmail,
      message: input.message,
      consentAccepted: input.consentAccepted,
      submissionRequestId: input.submissionRequestId,
    });
    if (input.files.length === 0)
      throw new SubmissionError("NO_FILES", "请至少选择一张照片。");
    if (input.files.length > MAX_SUBMISSION_PHOTOS)
      throw new SubmissionError("TOO_MANY_FILES", "一次最多投稿 5 张照片。");
    const metadata = photoMetadataListSchema.safeParse(
      input.files.map((item) => item.metadata),
    );
    if (
      !parsed.success ||
      !metadata.success ||
      metadata.data.length !== input.files.length
    )
      throw new SubmissionError("INVALID_INPUT", "投稿信息格式不正确。");
    if (!input.turnstileToken.trim() || input.turnstileToken.length > 2048)
      throw new TurnstileError("MISSING_TOKEN");

    const turnstile = await this.dependencies.verifyTurnstile(
      input.turnstileToken,
    );
    if (!turnstile.success)
      throw new SubmissionError(
        "TURNSTILE_INVALID",
        "安全验证未通过，请重新验证。",
      );

    const existing = this.dependencies.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.requestId, parsed.data.submissionRequestId))
      .get();
    if (existing)
      return {
        submissionId: existing.id,
        photoCount: this.dependencies.db
          .select({ id: photos.id })
          .from(photos)
          .where(eq(photos.submissionId, existing.id))
          .all().length,
        status: "pending",
      };

    const totalBytes = input.files.reduce(
      (total, item) => total + item.file.size,
      0,
    );
    if (
      input.files.some((item) => item.file.size > MAX_IMAGE_BYTES) ||
      totalBytes > MAX_SUBMISSION_PHOTO_BYTES
    )
      throw new SubmissionError("PAYLOAD_TOO_LARGE", "上传图片超过大小限制。");

    const operation = beginOperation(
      this.dependencies.db,
      parsed.data.submissionRequestId,
      this.dependencies.now(),
    );
    const saved: Array<{
      photoId: string;
      originalKey: string;
      previewKey: string;
      metadata: Awaited<ReturnType<ImageService["saveOriginal"]>>["metadata"];
      input: PhotoMetadataInput;
    }> = [];
    const activePhotoIds = new Set<string>();
    try {
      for (const item of input.files) {
        const bytes = Buffer.from(await item.file.arrayBuffer());
        const photoId = randomUUID();
        activePhotoIds.add(photoId);
        const original = await this.dependencies.imageService.saveOriginal(
          bytes,
          photoId,
        );
        const savedItem = {
          photoId: original.photoId,
          originalKey: original.key,
          previewKey: previewKey(original.photoId),
          metadata: original.metadata,
          input: metadata.data[saved.length],
        };
        saved.push(savedItem);
        // Record the original before preview generation, so an interruption
        // cannot leave an untracked private object.
        this.dependencies.db
          .update(submissionOperations)
          .set({
            objects: saved.flatMap((savedItem) => [
              { photoId: savedItem.photoId, key: savedItem.originalKey },
              { photoId: savedItem.photoId, key: savedItem.previewKey },
            ]),
            updatedAt: this.dependencies.now(),
          })
          .where(eq(submissionOperations.id, operation.id))
          .run();
        const preview = await this.dependencies.imageService.generatePreview(
          original.photoId,
          original.key,
        );
        if (preview.key !== savedItem.previewKey)
          throw new StorageError("INVALID_KEY");
        activePhotoIds.delete(photoId);
      }

      const now = this.dependencies.now();
      const result = this.dependencies.db.transaction((tx) => {
        const duplicate = tx
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.requestId, parsed.data.submissionRequestId))
          .get();
        if (duplicate)
          return {
            submissionId: duplicate.id,
            photoCount: tx
              .select({ id: photos.id })
              .from(photos)
              .where(eq(photos.submissionId, duplicate.id))
              .all().length,
            duplicate: true,
          };

        reserveRateLimit(tx, input.sourceKey, saved.length, now.getTime());
        const submission = tx
          .insert(submissions)
          .values({
            attribution: parsed.data.authorName,
            contact: parsed.data.contactEmail,
            authorName: parsed.data.authorName,
            contactEmail: parsed.data.contactEmail,
            message: parsed.data.message,
            consentAccepted: true,
            consentedAt: now,
            requestId: parsed.data.submissionRequestId,
            submittedAt: now,
          })
          .returning()
          .get();
        for (const item of saved)
          tx.insert(photos)
            .values({
              id: item.photoId,
              submissionId: submission.id,
              title: item.input.title,
              description: item.input.description,
              takenAt: item.input.takenAt,
              location: item.input.location,
              status: "pending",
              originalKey: item.originalKey,
              previewKey: item.previewKey,
              mimeType: item.metadata.mimeType,
              byteSize: item.metadata.size,
              width: item.metadata.width,
              height: item.metadata.height,
              submittedAt: now,
              updatedAt: now,
            })
            .run();
        tx.update(submissionOperations)
          .set({ state: "complete", updatedAt: now })
          .where(eq(submissionOperations.id, operation.id))
          .run();
        return {
          submissionId: submission.id,
          photoCount: saved.length,
          duplicate: false,
        };
      });
      if (result.duplicate) {
        const cleaned = await cleanupSaved(
          this.dependencies,
          saved,
          operation.id,
        );
        this.dependencies.db
          .update(submissionOperations)
          .set({
            state: cleaned ? "failed" : "cleanup_failed",
            errorCode: cleaned ? "DUPLICATE_REQUEST" : "CLEANUP_FAILED",
            updatedAt: this.dependencies.now(),
          })
          .where(eq(submissionOperations.id, operation.id))
          .run();
        if (!cleaned)
          throw new SubmissionError(
            "STORAGE_FAILURE",
            "重复投稿的临时文件清理失败，请稍后重试。",
          );
      }
      return {
        submissionId: result.submissionId,
        photoCount: result.photoCount,
        status: "pending",
      };
    } catch (error) {
      const cleanupSucceeded = await cleanupSaved(
        this.dependencies,
        saved,
        operation.id,
      );
      const activeCleanup = await Promise.allSettled(
        [...activePhotoIds].map((photoId) =>
          this.dependencies.imageService.cleanupPrivatePhoto(photoId),
        ),
      );
      if (activeCleanup.some((result) => result.status === "rejected"))
        console.error(
          JSON.stringify({
            event: "submission_active_cleanup_failed",
            operationId: operation.id,
          }),
        );
      const allCleanupSucceeded =
        cleanupSucceeded &&
        activeCleanup.every((result) => result.status === "fulfilled");
      this.dependencies.db
        .update(submissionOperations)
        .set({
          state: allCleanupSucceeded ? "failed" : "cleanup_failed",
          errorCode: allCleanupSucceeded ? errorCode(error) : "CLEANUP_FAILED",
          updatedAt: this.dependencies.now(),
        })
        .where(eq(submissionOperations.id, operation.id))
        .run();
      throw error;
    }
  }
}

function reserveRateLimit(
  tx: Transaction,
  sourceKey: string,
  photoCount: number,
  now: number,
) {
  tx.delete(submissionRateLimits)
    .where(lt(submissionRateLimits.updatedAt, now - SUBMISSION_DAY_MS * 2))
    .run();
  const hour = bucket(tx, `hour:${sourceKey}`, now, SUBMISSION_HOUR_MS);
  const day = bucket(tx, `day:${sourceKey}`, now, SUBMISSION_DAY_MS);
  if (hour.submissionCount >= SUBMISSIONS_PER_HOUR)
    throw new SubmissionRateLimitError(
      Math.max(
        1,
        Math.ceil((hour.windowStartedAt + SUBMISSION_HOUR_MS - now) / 1000),
      ),
    );
  if (day.photoCount + photoCount > PHOTOS_PER_DAY)
    throw new SubmissionRateLimitError(
      Math.max(
        1,
        Math.ceil((day.windowStartedAt + SUBMISSION_DAY_MS - now) / 1000),
      ),
    );
  incrementBucket(tx, `hour:${sourceKey}`, hour, now, 1, 0);
  incrementBucket(tx, `day:${sourceKey}`, day, now, 0, photoCount);
}

function beginOperation(db: Database, requestId: string, now: Date) {
  const existing = db
    .select()
    .from(submissionOperations)
    .where(eq(submissionOperations.requestId, requestId))
    .get();
  if (existing) {
    if (existing.state !== "failed")
      throw new SubmissionError(
        "DUPLICATE_REQUEST",
        "这次投稿正在处理或已需要人工排查，请稍后再试。",
      );
    return db
      .update(submissionOperations)
      .set({ state: "writing", objects: [], errorCode: null, updatedAt: now })
      .where(eq(submissionOperations.id, existing.id))
      .returning()
      .get();
  }
  try {
    return db
      .insert(submissionOperations)
      .values({ requestId, state: "writing", objects: [] })
      .returning()
      .get();
  } catch (error) {
    if (isUniqueConstraint(error))
      throw new SubmissionError(
        "DUPLICATE_REQUEST",
        "这次投稿正在处理，请勿重复提交。",
      );
    throw error;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}

function bucket(
  tx: Transaction,
  bucketKey: string,
  now: number,
  duration: number,
) {
  const current = tx
    .select()
    .from(submissionRateLimits)
    .where(eq(submissionRateLimits.bucketKey, bucketKey))
    .get();
  if (!current || now - current.windowStartedAt >= duration)
    return {
      bucketKey,
      windowStartedAt: now,
      submissionCount: 0,
      photoCount: 0,
      updatedAt: now,
    };
  return current;
}

function incrementBucket(
  tx: Transaction,
  bucketKey: string,
  current: ReturnType<typeof bucket>,
  now: number,
  submissionsToAdd: number,
  photosToAdd: number,
) {
  tx.insert(submissionRateLimits)
    .values({
      bucketKey,
      windowStartedAt: current.windowStartedAt,
      submissionCount: current.submissionCount + submissionsToAdd,
      photoCount: current.photoCount + photosToAdd,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: submissionRateLimits.bucketKey,
      set: {
        windowStartedAt: current.windowStartedAt,
        submissionCount: current.submissionCount + submissionsToAdd,
        photoCount: current.photoCount + photosToAdd,
        updatedAt: now,
      },
    })
    .run();
}

async function cleanupSaved(
  dependencies: SubmissionDependencies,
  saved: Array<{
    photoId: string;
    originalKey: string;
    previewKey: string;
  }>,
  operationId: string,
): Promise<boolean> {
  const results = await Promise.allSettled(
    saved.map((item) =>
      dependencies.imageService.cleanupPrivateFiles(
        item.photoId,
        item.originalKey,
        item.previewKey,
      ),
    ),
  );
  if (results.some((result) => result.status === "rejected")) {
    console.error(
      JSON.stringify({ event: "submission_cleanup_failed", operationId }),
    );
    return false;
  }
  return true;
}

function errorCode(error: unknown): string {
  if (error instanceof SubmissionError) return error.code;
  if (error instanceof ImageValidationError) return error.code;
  if (error instanceof StorageError) return error.code;
  if (error instanceof TurnstileError) return error.code;
  return "INTERNAL_ERROR";
}

export async function createSubmission(
  input: CreateSubmissionInput,
  dependencies = defaultDependencies(),
): Promise<SubmissionResult> {
  return new SubmissionService(dependencies).create(input);
}
