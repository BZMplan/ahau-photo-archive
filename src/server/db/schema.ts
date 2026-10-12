import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const photoStatuses = [
  "pending",
  "approved",
  "rejected",
  "hidden",
] as const;
const uuid = () => text("id").primaryKey().$defaultFn(randomUUID);
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

// One durable marker separates first-run provisioning from later account recovery.
export const bootstrapState = sqliteTable("bootstrap_state", {
  id: integer("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  passwordChangeRequired: integer("password_change_required", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  createdAt: createdAt(),
});

export const submissions = sqliteTable(
  "submissions",
  {
    id: uuid(),
    // attribution/contact are retained for records created before phase 4.
    attribution: text("attribution"),
    contact: text("contact"),
    authorName: text("author_name"),
    contactEmail: text("contact_email"),
    message: text("message"),
    consentAccepted: integer("consent_accepted", { mode: "boolean" })
      .notNull()
      .default(false),
    consentedAt: integer("consented_at", { mode: "timestamp_ms" }),
    requestId: text("request_id"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("submissions_submitted_at_idx").on(table.submittedAt),
    uniqueIndex("submissions_request_id_unique").on(table.requestId),
  ],
);

export const submissionOperations = sqliteTable(
  "submission_operations",
  {
    id: uuid(),
    requestId: text("request_id").notNull().unique(),
    state: text("state", {
      enum: ["writing", "failed", "complete", "cleanup_failed"],
    }).notNull(),
    objects: text("objects", { mode: "json" })
      .$type<{ photoId: string; key: string }[]>()
      .notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("submission_operations_state_idx").on(table.state)],
);

export const submissionRateLimits = sqliteTable(
  "submission_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    submissionCount: integer("submission_count").notNull().default(0),
    photoCount: integer("photo_count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("submission_rate_limits_updated_idx").on(table.updatedAt)],
);

export const locations = sqliteTable(
  "locations",
  {
    id: uuid(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("locations_name_unique").on(table.name),
    uniqueIndex("locations_normalized_name_unique").on(table.normalizedName),
    uniqueIndex("locations_slug_unique").on(table.slug),
    index("locations_active_sort_idx").on(
      table.isActive,
      table.sortOrder,
      table.id,
    ),
    check(
      "locations_name_check",
      sql`length(trim(${table.name})) > 0 and length(${table.normalizedName}) > 0`,
    ),
    check("locations_active_check", sql`${table.isActive} in (0, 1)`),
    check("locations_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const photos = sqliteTable(
  "photos",
  {
    id: uuid(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "restrict",
    }),
    // Date-only value avoids inventing a timezone or precision for historical photos.
    takenAt: text("taken_at"),
    status: text("status", { enum: photoStatuses })
      .notNull()
      .default("pending"),
    originalKey: text("original_key").notNull(),
    previewKey: text("preview_key"),
    displayKey: text("display_key"),
    thumbnailKey: text("thumbnail_key"),
    publicationId: text("publication_id"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    rejectionReason: text("rejection_reason"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("photos_submission_idx").on(table.submissionId),
    index("photos_status_published_idx").on(table.status, table.publishedAt),
    index("photos_status_taken_idx").on(table.status, table.takenAt),
    index("photos_status_location_idx").on(table.status, table.location),
    index("photos_location_id_idx").on(table.locationId, table.status),
    uniqueIndex("photos_original_key_unique").on(table.originalKey),
    uniqueIndex("photos_preview_key_unique").on(table.previewKey),
    uniqueIndex("photos_display_key_unique").on(table.displayKey),
    uniqueIndex("photos_thumbnail_key_unique").on(table.thumbnailKey),
    uniqueIndex("photos_publication_id_unique").on(table.publicationId),
    check(
      "photos_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'hidden')`,
    ),
    check("photos_size_check", sql`${table.byteSize} > 0`),
    check(
      "photos_dimensions_check",
      sql`(${table.width} is null or ${table.width} > 0) and (${table.height} is null or ${table.height} > 0)`,
    ),
    check(
      "photos_approved_assets_check",
      sql`${table.status} != 'approved' or (${table.displayKey} is not null and ${table.thumbnailKey} is not null and ${table.publishedAt} is not null)`,
    ),
  ],
);

// Durable recovery metadata; file services never update photos or review status.
export const imageOperations = sqliteTable(
  "image_operations",
  {
    id: uuid(),
    photoId: text("photo_id").notNull(),
    action: text("action", {
      enum: ["publish", "unpublish", "delete"],
    }).notNull(),
    state: text("state", {
      enum: ["writing", "awaiting_commit", "cleanup_failed", "complete"],
    }).notNull(),
    objects: text("objects", { mode: "json" })
      .$type<{ scope: "private" | "public"; key: string }[]>()
      .notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("image_operations_state_created_idx").on(
      table.state,
      table.createdAt,
    ),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: uuid(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Null is reserved for historical aliases whose relations must remain intact.
    normalizedName: text("normalized_name"),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`)
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("tags_name_unique").on(table.name),
    uniqueIndex("tags_slug_unique").on(table.slug),
    uniqueIndex("tags_normalized_name_unique").on(table.normalizedName),
    index("tags_active_sort_idx").on(table.isActive, table.sortOrder, table.id),
  ],
);

export const photoTags = sqliteTable(
  "photo_tags",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.tagId] }),
    index("photo_tags_tag_idx").on(table.tagId, table.photoId),
  ],
);

export const moderationLogs = sqliteTable(
  "moderation_logs",
  {
    id: uuid(),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "restrict" }),
    // Better Auth schema and its FK will be introduced with administrator provisioning.
    adminId: text("admin_id").notNull(),
    action: text("action", {
      enum: ["approve", "reject", "hide", "restore", "edit"],
    }).notNull(),
    fromStatus: text("from_status", { enum: photoStatuses }).notNull(),
    toStatus: text("to_status", { enum: photoStatuses }).notNull(),
    note: text("note"),
    metadataChanges: text("metadata_changes", { mode: "json" })
      .$type<Record<string, { old: string | null; new: string | null }>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("moderation_logs_photo_created_idx").on(
      table.photoId,
      table.createdAt,
    ),
    index("moderation_logs_admin_created_idx").on(
      table.adminId,
      table.createdAt,
    ),
    check(
      "moderation_logs_action_check",
      sql`${table.action} in ('approve', 'reject', 'hide', 'restore', 'edit')`,
    ),
    check(
      "moderation_logs_from_status_check",
      sql`${table.fromStatus} in ('pending', 'approved', 'rejected', 'hidden')`,
    ),
    check(
      "moderation_logs_to_status_check",
      sql`${table.toStatus} in ('pending', 'approved', 'rejected', 'hidden')`,
    ),
  ],
);

export const cachePurgeTasks = sqliteTable(
  "cache_purge_tasks",
  {
    id: uuid(),
    photoId: text("photo_id").notNull(),
    keys: text("keys", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status", {
      enum: ["pending", "purged", "not_configured", "failed"],
    }).notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("cache_purge_tasks_photo_idx").on(table.photoId, table.createdAt),
    index("cache_purge_tasks_status_idx").on(table.status, table.updatedAt),
  ],
);
