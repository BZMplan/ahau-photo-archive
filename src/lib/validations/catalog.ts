import { z } from "zod";
import { normalizeLocation } from "@/lib/validations/archive";
export const MAX_PHOTO_TAGS = 20;
export const normalizeCatalogName = (value: string) =>
  value.trim().replace(/\s+/gu, " ");
export const catalogNameKey = (value: string) => normalizeLocation(value);
const name = z
  .string()
  .transform(normalizeCatalogName)
  .pipe(z.string().min(1).max(100));
const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}_-]+$/u);
export const catalogIdSchema = z.string().uuid();
export const tagIdsSchema = z
  .array(catalogIdSchema)
  .max(MAX_PHOTO_TAGS)
  .refine((ids) => new Set(ids).size === ids.length, "标签不能重复选择。");
const fields = {
  name,
  slug: slug.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
};
export const catalogCreateSchema = z.object(fields).strict();
export const catalogUpdateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "缺少修改字段。");
export const catalogSearchSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    limit: z.coerce.number().int().min(1).max(20).default(12),
  })
  .strict();
export const catalogAdminQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  })
  .strict();
