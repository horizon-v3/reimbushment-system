import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// ─── GET /api/operation-log ───────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const url   = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "200"), 500);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const filter = url.searchParams.get("filter") ?? ""; // action filter

  try {
    // Auto-migrate
    await db.execute(sql`
      ALTER TABLE audit_log
        ADD COLUMN IF NOT EXISTS user_name  TEXT,
        ADD COLUMN IF NOT EXISTS user_role  TEXT,
        ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'success',
        ADD COLUMN IF NOT EXISTS ip_address TEXT
    `);

    const rows = await db.execute(sql`
      SELECT id, user_id, user_name, user_role, action, entity_type, entity_id,
             status, ip_address, metadata, created_at
      FROM audit_log
      ${filter ? sql`WHERE action ILIKE ${'%' + filter + '%'} OR entity_type ILIKE ${'%' + filter + '%'} OR user_name ILIKE ${'%' + filter + '%'}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM audit_log
      ${filter ? sql`WHERE action ILIKE ${'%' + filter + '%'} OR entity_type ILIKE ${'%' + filter + '%'} OR user_name ILIKE ${'%' + filter + '%'}` : sql``}
    `);
    const total = Number((Array.from(countRes)[0] as Record<string, unknown>)?.count ?? 0);

    return NextResponse.json({ logs: Array.from(rows), total });
  } catch (err) {
    console.error("[GET /api/operation-log]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── DELETE /api/operation-log?id=N  — admin blocks / marks a log entry ──────
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get("id") ?? "");
  if (isNaN(id)) return NextResponse.json({ error: "Invalid log ID" }, { status: 400 });

  try {
    await db.execute(sql`
      UPDATE audit_log SET status = 'blocked' WHERE id = ${id}
    `);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/operation-log]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
