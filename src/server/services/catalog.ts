import "server-only";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { locations, tags, photos, photoTags } from "@/server/db/schema";
import {
  catalogAdminQuerySchema,
  catalogCreateSchema,
  catalogIdSchema,
  catalogNameKey,
  normalizeCatalogName,
  catalogSearchSchema,
  catalogUpdateSchema,
} from "@/lib/validations/catalog";
import type {
  AdminCatalogEntry,
  AdminCatalogPage,
  CatalogKind,
  CatalogOption,
} from "@/types/catalog";

type Database = ReturnType<typeof getDb>;
export type CatalogTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type Reader = Database | CatalogTransaction;
type CatalogRow = Pick<
  typeof locations.$inferSelect,
  | "id"
  | "name"
  | "slug"
  | "description"
  | "isActive"
  | "sortOrder"
  | "createdAt"
  | "updatedAt"
>;
export class CatalogError extends Error {
  constructor(
    readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INVALID_SELECTION",
    message: string,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}
const tableFor = (kind: CatalogKind) =>
  kind === "locations" ? locations : tags;
const fields = (kind: CatalogKind) => {
  const table = tableFor(kind);
  return {
    id: table.id,
    name: table.name,
    slug: table.slug,
    description: table.description,
    isActive: table.isActive,
    sortOrder: table.sortOrder,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
};

export class CatalogService {
  constructor(private readonly db: Database = getDb()) {}
  search(kind: CatalogKind, input: unknown = {}): CatalogOption[] {
    const query = catalogSearchSchema.safeParse(input);
    if (!query.success)
      throw new CatalogError("INVALID_INPUT", "搜索参数不正确。");
    const table = tableFor(kind);
    return this.db
      .select({ id: table.id, name: table.name, slug: table.slug })
      .from(table)
      .where(
        and(
          eq(table.isActive, true),
          isNotNull(table.normalizedName),
          sql`instr(normalize_location(${table.name}), ${catalogNameKey(query.data.q)}) > 0`,
        ),
      )
      .orderBy(asc(table.sortOrder), asc(table.name), asc(table.id))
      .limit(query.data.limit)
      .all();
  }
  list(kind: CatalogKind, input: unknown = {}): AdminCatalogPage {
    const parsed = catalogAdminQuerySchema.safeParse(input);
    if (!parsed.success)
      throw new CatalogError("INVALID_INPUT", "目录查询参数不正确。");
    const table = tableFor(kind);
    const condition = sql`instr(normalize_location(${table.name}), ${catalogNameKey(parsed.data.q)}) > 0`;
    const rows = this.db
      .select(fields(kind))
      .from(table)
      .where(condition)
      .orderBy(asc(table.sortOrder), asc(table.name), asc(table.id))
      .limit(20)
      .offset((parsed.data.page - 1) * 20)
      .all();
    const total =
      this.db.select({ value: count() }).from(table).where(condition).get()
        ?.value ?? 0;
    return {
      items: rows.map((row) => this.dto(kind, row)),
      total,
      page: parsed.data.page,
      pageCount: Math.max(1, Math.ceil(total / 20)),
    };
  }
  create(kind: CatalogKind, input: unknown): AdminCatalogEntry {
    const parsed = catalogCreateSchema.safeParse(input);
    if (!parsed.success)
      throw new CatalogError(
        "INVALID_INPUT",
        "名称、标识或目录信息格式不正确。",
      );
    try {
      const row = this.db.transaction((tx) => {
        const table = tableFor(kind),
          now = new Date();
        const value = parsed.data;
        const saved = tx
          .insert(table)
          .values({
            id: randomUUID(),
            name: value.name,
            normalizedName: catalogNameKey(value.name),
            slug: value.slug ?? `entry-${randomUUID()}`,
            description: value.description || null,
            isActive: value.isActive ?? true,
            sortOrder: value.sortOrder ?? 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        if (kind === "locations")
          this.linkLegacyLocations(tx, saved.id, catalogNameKey(saved.name));
        return saved;
      });
      refreshCatalog();
      return this.dto(kind, row);
    } catch (error) {
      return throwCatalogWriteError(error);
    }
  }
  update(kind: CatalogKind, id: string, input: unknown): AdminCatalogEntry {
    if (!catalogIdSchema.safeParse(id).success)
      throw new CatalogError("INVALID_INPUT", "目录 ID 格式不正确。");
    const parsed = catalogUpdateSchema.safeParse(input);
    if (!parsed.success)
      throw new CatalogError("INVALID_INPUT", "目录修改字段不正确。");
    try {
      const row = this.db.transaction((tx) => {
        const table = tableFor(kind);
        const current = tx.select().from(table).where(eq(table.id, id)).get();
        if (!current) throw new CatalogError("NOT_FOUND", "目录选项不存在。");
        const value = parsed.data,
          name = normalizeCatalogName(value.name ?? current.name),
          isActive = value.isActive ?? current.isActive;
        if (
          value.slug &&
          value.slug !== current.slug &&
          usageCount(tx, kind, id) > 0
        )
          throw new CatalogError(
            "CONFLICT",
            "已有照片使用此选项，不能修改其 URL 标识。",
          );
        const historicalAlias =
          kind === "tags" &&
          current.normalizedName === null &&
          !isActive &&
          catalogNameKey(name) === catalogNameKey(current.name);
        const saved = tx
          .update(table)
          .set({
            name: historicalAlias ? current.name : name,
            normalizedName: historicalAlias ? null : catalogNameKey(name),
            slug: value.slug ?? current.slug,
            description:
              value.description === undefined
                ? current.description
                : value.description || null,
            isActive,
            sortOrder: value.sortOrder ?? current.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(table.id, id))
          .returning()
          .get();
        if (!saved) throw new CatalogError("NOT_FOUND", "目录选项不存在。");
        if (kind === "locations")
          this.linkLegacyLocations(tx, id, catalogNameKey(saved.name));
        return saved;
      });
      refreshCatalog();
      return this.dto(kind, row);
    } catch (error) {
      return throwCatalogWriteError(error);
    }
  }
  private linkLegacyLocations(
    tx: CatalogTransaction,
    id: string,
    nameKey: string,
  ) {
    // Only exact normalized matches are linked, and the original text is retained.
    tx.update(photos)
      .set({ locationId: id })
      .where(
        and(
          isNull(photos.locationId),
          sql`normalize_location(${photos.location}) = ${nameKey}`,
        ),
      )
      .run();
  }
  private dto(kind: CatalogKind, row: CatalogRow): AdminCatalogEntry {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      photoCount: usageCount(this.db, kind, row.id),
    };
  }
}
function usageCount(db: Reader, kind: CatalogKind, id: string): number {
  return kind === "locations"
    ? (db
        .select({ value: count() })
        .from(photos)
        .where(eq(photos.locationId, id))
        .get()?.value ?? 0)
    : (db
        .select({ value: count() })
        .from(photoTags)
        .where(eq(photoTags.tagId, id))
        .get()?.value ?? 0);
}
function throwCatalogWriteError(error: unknown): never {
  if (error instanceof CatalogError) throw error;
  if (
    error instanceof Error &&
    (/SQLITE_CONSTRAINT_UNIQUE|UNIQUE constraint/i.test(error.message) ||
      (error.cause instanceof Error &&
        /SQLITE_CONSTRAINT_UNIQUE|UNIQUE constraint/i.test(
          error.cause.message,
        )))
  )
    throw new CatalogError(
      "CONFLICT",
      "名称或标识已存在，请使用其他名称或标识。",
    );
  throw error;
}
function refreshCatalog() {
  try {
    for (const path of [
      "/admin/locations",
      "/admin/tags",
      "/admin/reviews",
      "/admin/photos",
      "/submit",
      "/archive",
    ])
      revalidatePath(path);
    revalidatePath("/photo/[id]", "page");
    revalidatePath("/tags/[slug]", "page");
  } catch {
    /* CLI/tests have no request cache. */
  }
}

export function validateCatalogSelection(
  db: Reader,
  locationId: string | null | undefined,
  tagIds: string[],
  retained?: { locationId: string | null; tagIds: string[] },
) {
  let location: { id: string; name: string } | null = null;
  if (locationId) {
    const row = db
      .select()
      .from(locations)
      .where(eq(locations.id, locationId))
      .get();
    if (!row || (!row.isActive && retained?.locationId !== locationId))
      throw new CatalogError(
        "INVALID_SELECTION",
        "拍摄地点已失效，请重新搜索并选择地点。",
      );
    location = { id: row.id, name: row.name };
  }
  const selected = tagIds.length
    ? db
        .select({
          id: tags.id,
          name: tags.name,
          isActive: tags.isActive,
          normalizedName: tags.normalizedName,
        })
        .from(tags)
        .where(inArray(tags.id, tagIds))
        .all()
    : [];
  if (
    selected.length !== tagIds.length ||
    selected.some(
      (row) =>
        (!row.isActive || row.normalizedName === null) &&
        !retained?.tagIds.includes(row.id),
    )
  )
    throw new CatalogError(
      "INVALID_SELECTION",
      "照片标签已失效，请重新搜索并选择标签。",
    );
  return {
    location,
    tags: tagIds.map((id) => selected.find((row) => row.id === id)!),
  };
}
