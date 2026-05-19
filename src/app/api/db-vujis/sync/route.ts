import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dbVujisRecords, auditLog } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const HEADER_MAP: Record<string, string> = {
  sr_no: "srNo",
  company_name: "companyName",
  country_name: "countryName",
  region: "region",
  proof_of_import_as_per_reg_form_y: "proofOfImportY",
  proof_of_import_as_per_reg_form_n: "proofOfImportN",
  vujis: "vujis",
  import_value_in_usd: "importValueVujis",
  dollar_business: "dollarBusiness",
  import_value_in_usd_1: "importValueDollar",
  both: "bothDbVujis",
  importing_from_india: "importingFromIndia",
  importing_from_other_country: "importingFromOtherCountry",
  your_main_import_product_1: "mainImportProduct1",
  main_import_product_1: "mainImportProduct1",
  your_main_import_product_2: "mainImportProduct2",
  main_import_product_2: "mainImportProduct2",
  poc: "poc",
  reason: "reason",
  comment: "comment"
};

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    // ── Use raw SQL to avoid schema mismatch if db_vujis_sheet_name column
    //    hasn't been added to production Neon yet ──────────────────────────
    const settingsResult = await db.execute(sql`
      SELECT
        gas_web_app_url,
        registration_sheet_id,
        COALESCE(
          CASE WHEN column_name IS NOT NULL THEN db_vujis_sheet_name ELSE NULL END,
          'DB & vujis'
        ) AS db_vujis_sheet_name
      FROM app_settings
      LEFT JOIN (
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'app_settings' AND column_name = 'db_vujis_sheet_name'
        LIMIT 1
      ) cols ON TRUE
      LIMIT 1
    `).catch(() => null);

    // Fallback: simple select without the new column
    let settings: { gas_web_app_url?: string; registration_sheet_id?: string; db_vujis_sheet_name?: string } | null = null;

    if (settingsResult && settingsResult.rows?.length > 0) {
      settings = settingsResult.rows[0] as typeof settings;
    } else {
      // Try without the new column
      const fallback = await db.execute(sql`
        SELECT gas_web_app_url, registration_sheet_id FROM app_settings LIMIT 1
      `);
      if (fallback.rows?.length > 0) {
        settings = fallback.rows[0] as typeof settings;
      }
    }

    if (!settings?.gas_web_app_url) return NextResponse.json({ error: "GAS Web App URL not configured in Settings" }, { status: 400 });
    if (!settings?.registration_sheet_id) return NextResponse.json({ error: "Sheet ID not configured in Settings" }, { status: 400 });

    const sheetName = settings.db_vujis_sheet_name || "DB & vujis";

    // ── Ensure db_vujis_records table exists ─────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS db_vujis_records (
        id                       SERIAL PRIMARY KEY,
        sr_no                    INTEGER UNIQUE,
        company_name             TEXT,
        country_name             TEXT,
        region                   TEXT,
        proof_of_import_y        TEXT,
        proof_of_import_n        TEXT,
        vujis                    TEXT,
        import_value_vujis       TEXT,
        dollar_business          TEXT,
        import_value_dollar      TEXT,
        both_db_vujis            TEXT,
        importing_from_india     TEXT,
        importing_from_other_country TEXT,
        main_import_product_1    TEXT,
        main_import_product_2    TEXT,
        poc                      TEXT,
        reason                   TEXT,
        comment                  TEXT,
        created_at               TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at               TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // ── Also ensure the column exists on app_settings ─────────────────────
    await db.execute(sql`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS db_vujis_sheet_name TEXT DEFAULT 'DB & vujis'
    `);

    const gasUrl = new URL(settings.gas_web_app_url);
    gasUrl.searchParams.set("action", "getRows");
    gasUrl.searchParams.set("sheetId", settings.registration_sheet_id);
    gasUrl.searchParams.set("sheetName", sheetName);

    const gasRes = await fetch(gasUrl.toString(), {
      redirect: "follow",
      headers: { "Cache-Control": "no-cache" }
    });

    const data = await gasRes.json();
    if (!data.ok) throw new Error(data.error ?? "Unknown GAS error");

    const rawRows = data.rows as Record<string, unknown>[];
    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "No data found in sheet" });
    }

    const mappedRecords = [];
    for (const r of rawRows) {
      const mapped: Record<string, any> = {};
      for (const [rawKey, value] of Object.entries(r)) {
        const norm = normalizeHeader(rawKey);
        const mappedKey = HEADER_MAP[norm];
        if (mappedKey) {
          mapped[mappedKey] = value != null && String(value).trim() !== "" ? String(value).trim() : null;
        }
      }

      const srNo = Number(mapped.srNo);
      if (!isNaN(srNo) && srNo > 0) {
        mapped.srNo = srNo;
        mappedRecords.push(mapped);
      }
    }

    let totalUpserted = 0;
    const BATCH = 100;
    for (let i = 0; i < mappedRecords.length; i += BATCH) {
      const batch = mappedRecords.slice(i, i + BATCH);
      const srNos = batch.map(b => b.srNo);
      if (srNos.length > 0) {
        await db.delete(dbVujisRecords).where(inArray(dbVujisRecords.srNo, srNos));
        await db.insert(dbVujisRecords).values(batch);
        totalUpserted += batch.length;
      }
    }

    try {
      await db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "sync_db_vujis",
        entityType: "db_vujis",
        metadata: { count: totalUpserted },
      });
    } catch {
      // audit log failure is non-fatal
    }

    return NextResponse.json({ ok: true, synced: totalUpserted });
  } catch (err: unknown) {
    console.error("[POST /api/db-vujis/sync]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
