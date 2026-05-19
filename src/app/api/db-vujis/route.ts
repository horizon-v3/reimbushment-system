import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dbVujisRecords } from "@/db/schema";
import { asc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "5000");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  try {
    const rows = await db
      .select()
      .from(dbVujisRecords)
      .orderBy(asc(dbVujisRecords.srNo))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dbVujisRecords);

    // Convert keys to snake_case for frontend
    const toSnake = (obj: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k.replace(/([A-Z]|\d+)/g, "_$1").toLowerCase(),
          v,
        ])
      );

    return NextResponse.json({ rows: rows.map(toSnake), total: Number(count) });
  } catch (err) {
    console.error("[GET /api/db-vujis]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
