import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// ─── GET /api/db-vujis ────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit  = parseInt(url.searchParams.get("limit")  ?? "5000");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  try {
    // ── Auto-create table if missing (idempotent) ───────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS db_vujis_records (
        id                           SERIAL PRIMARY KEY,
        sr_no                        INTEGER UNIQUE,
        company_name                 TEXT,
        country_name                 TEXT,
        region                       TEXT,
        proof_of_import_y            TEXT,
        proof_of_import_n            TEXT,
        vujis                        TEXT,
        import_value_vujis           TEXT,
        dollar_business              TEXT,
        import_value_dollar          TEXT,
        both_db_vujis                TEXT,
        importing_from_india         TEXT,
        importing_from_other_country TEXT,
        main_import_product_1        TEXT,
        main_import_product_2        TEXT,
        poc                          TEXT,
        reason                       TEXT,
        comment                      TEXT,
        created_at                   TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at                   TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // postgres-js driver returns the rows directly as an array
    const rows  = await db.execute(sql`
      SELECT
        id, sr_no, company_name, country_name, region,
        proof_of_import_y, proof_of_import_n,
        vujis, import_value_vujis, dollar_business, import_value_dollar,
        both_db_vujis, importing_from_india, importing_from_other_country,
        main_import_product_1, main_import_product_2,
        poc, reason, comment, created_at, updated_at
      FROM db_vujis_records
      ORDER BY sr_no ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRows = await db.execute(sql`SELECT COUNT(*)::int AS count FROM db_vujis_records`);
    const total = Number((countRows[0] as Record<string, unknown>)?.count ?? 0);

    return NextResponse.json({ rows: Array.from(rows), total });
  } catch (err) {
    console.error("[GET /api/db-vujis]", err);
    return NextResponse.json({ error: "Database error", rows: [], total: 0 }, { status: 500 });
  }
}
