import { publicCatalogGet } from "@/server/api/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = publicCatalogGet("tags");
