export type PhotoStatus = "pending" | "approved" | "rejected" | "hidden";

// Explicit public projection: private object keys and submitter contact never leave the server.
export interface PublicPhoto {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  takenAt: string | null;
  publishedAt: Date | null;
  attribution: string | null;
  displayUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  tags: string[];
  tagSlugs: string[];
}

export type PublicPhotoSort =
  "published-desc" | "published-asc" | "taken-desc" | "taken-asc";

export interface PublicTag {
  name: string;
  slug: string;
  count: number;
}

export interface PublicPhotoPage {
  items: PublicPhoto[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}
