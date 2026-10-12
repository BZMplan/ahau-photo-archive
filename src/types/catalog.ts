export type CatalogKind = "locations" | "tags";
export interface CatalogOption {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}
export interface AdminCatalogEntry extends CatalogOption {
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface AdminCatalogPage {
  items: AdminCatalogEntry[];
  total: number;
  page: number;
  pageCount: number;
}
