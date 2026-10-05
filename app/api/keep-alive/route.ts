/**
 * Keep-alive endpoint để chống Supabase free tier auto-pause (7 ngày idle).
 * Ping bởi UptimeRobot hoặc cron-job.org mỗi 5-15 phút.
 *
 * Public endpoint — trả về JSON status. Không expose data sensitive.
 * Không route qua middleware auth vì matcher trong middleware.ts đã loại /api/*.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Force run on every request (no static/edge cache)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const started = performance.now();
    const [row] = await db.execute(sql`SELECT NOW()::text as now`);
    const ms = Math.round(performance.now() - started);
    return NextResponse.json({
      status: "ok",
      db: (row as { now?: string }).now ?? null,
      latency_ms: ms,
    });
  } catch (err) {
    // Endpoint công khai, không đăng nhập. Không trả err.message ra ngoài vì
    // lỗi kết nối Postgres có kèm host, cổng và tên người dùng.
    console.error("keep-alive:", err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
