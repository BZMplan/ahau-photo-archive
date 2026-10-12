import { adminCatalogGet, adminCatalogPost } from "@/server/api/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = adminCatalogGet("locations");
export const POST = adminCatalogPost("locations");
