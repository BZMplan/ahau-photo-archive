import { adminCatalogPatch } from "@/server/api/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const PATCH = adminCatalogPatch("tags");
