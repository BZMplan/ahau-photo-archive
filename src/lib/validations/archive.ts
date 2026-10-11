import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;
export const seasonLabels = {
  spring: "春季",
  summer: "夏季",
  autumn: "秋季",
  winter: "冬季",
} as const;
export function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional().catch(undefined),
  );
const positive = z.coerce.number().int().positive().max(1_000_000);
const schema = z.object({
  year: optional(z.string().regex(/^[1-9]\d{3}$/)),
  season: optional(z.enum(["spring", "summer", "autumn", "winter"])),
  location: optional(
    z.string().trim().min(1).max(100).transform(normalizeLocation),
  ),
  tag: optional(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[\p{L}\p{N}_-]+$/u),
  ),
  sort: z
    .enum(["published-desc", "published-asc", "taken-desc", "taken-asc"])
    .catch("published-desc"),
  page: positive.catch(1),
  pageSize: positive
    .transform((n) => Math.min(n, MAX_PAGE_SIZE))
    .catch(DEFAULT_PAGE_SIZE),
});
export type ArchiveQuery = z.output<typeof schema>;
export function parseArchiveQuery(input: unknown = {}): ArchiveQuery {
  const result = schema.safeParse(input);
  return result.success ? result.data : schema.parse({});
}
export function archiveHref(query: ArchiveQuery, page = 1, base = "/archive") {
  const params = new URLSearchParams();
  for (const key of ["year", "season", "location", "tag"] as const) {
    if (query[key] && !(key === "tag" && base.startsWith("/tags/")))
      params.set(key, query[key]);
  }
  if (query.sort !== "published-desc") params.set("sort", query.sort);
  if (query.pageSize !== DEFAULT_PAGE_SIZE)
    params.set("pageSize", String(query.pageSize));
  if (page > 1) params.set("page", String(page));
  return base + (params.size ? "?" + params.toString() : "");
}
