import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().get(sql`select 1 from photos limit 1`);
    return Response.json({ data: { status: "ok" } });
  } catch {
    return Response.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "数据库未就绪，请先执行迁移。",
        },
      },
      { status: 503 },
    );
  }
}
