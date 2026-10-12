import { adminCatalogGet, adminCatalogPost } from "@/server/api/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = adminCatalogGet("tags");
export const POST = adminCatalogPost("tags");
