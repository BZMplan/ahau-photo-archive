import {
  archiveHref,
  parseArchiveQuery,
  type ArchiveQuery,
} from "@/lib/validations/archive";

export type ArchiveFilterKey = "year" | "season" | "location" | "tag" | "sort";

export function archiveFilterHref(
  query: ArchiveQuery,
  key: ArchiveFilterKey,
  value: string,
) {
  return archiveHref(parseArchiveQuery({ ...query, [key]: value, page: 1 }));
}

// Only return to the local archive, and rebuild its query from validated fields.
export function archiveReturnHref(value: unknown) {
  if (typeof value !== "string") return "/archive";
  let url: URL;
  try {
    url = new URL(value, "https://archive.invalid");
  } catch {
    return "/archive";
  }
  if (url.origin !== "https://archive.invalid" || url.pathname !== "/archive")
    return "/archive";
  const query = parseArchiveQuery(Object.fromEntries(url.searchParams));
  return archiveHref(query, query.page);
}
