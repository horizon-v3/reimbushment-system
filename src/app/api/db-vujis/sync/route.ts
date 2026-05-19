import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const HEADER_MAP: Record<string, string> = {
  sr_no:                             "sr_no",
  company_name:                      "company_name",
  country_name:                      "country_name",
  region:                            "region",
  proof_of_import_as_per_reg_form_y: "proof_of_import_y",
  proof_of_import_as_per_reg_form_n: "proof_of_import_n",
  vujis:                             "vujis",
  import_value_in_usd:               "import_value_vujis",   // first occurrence
  dollar_business:                   "dollar_business",
  import_value_in_usd_1:             "import_value_dollar",  // second occurrence (deduplicated by GAS)
  both:                              "both_db_vujis",
  importing_from_india:              "importing_from_india",
  importing_from_other_country:      "importing_from_other_country",
  your_main_import_product_1:        "main_import_product_1",
  main_import_product_1:             "main_import_product_1",
  your_main_import_product_2:        "main_import_product_2",
  main_import_product_2:             "main_import_product_2",
  poc:                               "poc",
  reason:                            "reason",
  comment:                           "comment",
};

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ─── POST /api/db-vujis/sync ──────────────────────────────────────────────────
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    // ── 1. Auto-migrate: ensure table and column exist ──────────────────────
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

    await db.execute(sql`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS db_vujis_sheet_name TEXT DEFAULT 'DB & vujis'
    `);

    // ── 2. Fetch settings using raw SQL (avoids schema-column mismatch) ─────
    const settingsRows = await db.execute(sql`
      SELECT
        gas_web_app_url,
        registration_sheet_id,
        COALESCE(db_vujis_sheet_name, 'DB & vujis') AS db_vujis_sheet_name
      FROM app_settings
      WHERE id = 1
      LIMIT 1
    `);

    const settings = (Array.from(settingsRows)[0] ?? null) as Record<string, string> | null;

    if (!settings?.gas_web_app_url) {
      return NextResponse.json({ error: "GAS Web App URL not configured in Settings" }, { status: 400 });
    }
    if (!settings?.registration_sheet_id) {
      return NextResponse.json({ error: "Sheet ID not configured in Settings" }, { status: 400 });
    }

    const sheetName = settings.db_vujis_sheet_name || "DB & vujis";

    // ── 3. Fetch rows from Google Sheet via GAS ────────────────────────────
    const gasUrl = new URL(settings.gas_web_app_url);
    gasUrl.searchParams.set("action",    "getRows");
    gasUrl.searchParams.set("sheetId",   settings.registration_sheet_id);
    gasUrl.searchParams.set("sheetName", sheetName);

    let gasData: { ok: boolean; rows?: Record<string, unknown>[]; error?: string };
    try {
      const gasRes = await fetch(gasUrl.toString(), {
        redirect: "follow",
        headers:  { "Cache-Control": "no-cache" },
        signal:   AbortSignal.timeout(30_000),
      });
      if (!gasRes.ok) {
        throw new Error(`GAS returned HTTP ${gasRes.status}`);
      }
      gasData = await gasRes.json();
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return NextResponse.json({ error: `Failed to reach Google Sheet: ${msg}` }, { status: 502 });
    }

    if (!gasData.ok) {
      return NextResponse.json({ error: gasData.error ?? "Unknown GAS error" }, { status: 502 });
    }

    const rawRows = gasData.rows ?? [];
    if (rawRows.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: `No rows found in sheet "${sheetName}"` });
    }

    // ── 4. Map sheet columns → DB columns ──────────────────────────────────
    const records: Record<string, unknown>[] = [];
    for (const r of rawRows) {
      const mapped: Record<string, unknown> = {};
      for (const [rawKey, value] of Object.entries(r)) {
        const norm      = normalizeHeader(rawKey);
        const dbCol     = HEADER_MAP[norm];
        if (dbCol && !(dbCol in mapped)) {        // first-wins for duplicates
          mapped[dbCol] = str(value);
        }
      }
      const srNo = Number(mapped.sr_no);
      if (!isNaN(srNo) && srNo > 0) {
        mapped.sr_no = srNo;
        records.push(mapped);
      }
    }

    // ── 5. Upsert in batches of 100 ────────────────────────────────────────
    let totalUpserted = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);

      for (const rec of batch) {
        await db.execute(sql`
          INSERT INTO db_vujis_records (
            sr_no, company_name, country_name, region,
            proof_of_import_y, proof_of_import_n,
            vujis, import_value_vujis, dollar_business, import_value_dollar,
            both_db_vujis, importing_from_india, importing_from_other_country,
            main_import_product_1, main_import_product_2,
            poc, reason, comment, updated_at
          ) VALUES (
            ${rec.sr_no as number},
            ${rec.company_name as string},
            ${rec.country_name as string},
            ${rec.region as string},
            ${rec.proof_of_import_y as string},
            ${rec.proof_of_import_n as string},
            ${rec.vujis as string},
            ${rec.import_value_vujis as string},
            ${rec.dollar_business as string},
            ${rec.import_value_dollar as string},
            ${rec.both_db_vujis as string},
            ${rec.importing_from_india as string},
            ${rec.importing_from_other_country as string},
            ${rec.main_import_product_1 as string},
            ${rec.main_import_product_2 as string},
            ${rec.poc as string},
            ${rec.reason as string},
            ${rec.comment as string},
            NOW()
          )
          ON CONFLICT (sr_no) DO UPDATE SET
            company_name                 = EXCLUDED.company_name,
            country_name                 = EXCLUDED.country_name,
            region                       = EXCLUDED.region,
            proof_of_import_y            = EXCLUDED.proof_of_import_y,
            proof_of_import_n            = EXCLUDED.proof_of_import_n,
            vujis                        = EXCLUDED.vujis,
            import_value_vujis           = EXCLUDED.import_value_vujis,
            dollar_business              = EXCLUDED.dollar_business,
            import_value_dollar          = EXCLUDED.import_value_dollar,
            both_db_vujis                = EXCLUDED.both_db_vujis,
            importing_from_india         = EXCLUDED.importing_from_india,
            importing_from_other_country = EXCLUDED.importing_from_other_country,
            main_import_product_1        = EXCLUDED.main_import_product_1,
            main_import_product_2        = EXCLUDED.main_import_product_2,
            poc                          = EXCLUDED.poc,
            reason                       = EXCLUDED.reason,
            comment                      = EXCLUDED.comment,
            updated_at                   = NOW()
        `);
        totalUpserted++;
      }
    }

    // ── 6. Audit log (non-fatal) ────────────────────────────────────────────
    try {
      await db.execute(sql`
        INSERT INTO audit_log (user_id, action, entity_type, metadata, created_at)
        VALUES (
          ${session.user?.id === "admin" ? 1 : parseInt(session.user?.id ?? "0")},
          'sync_db_vujis',
          'db_vujis',
          ${JSON.stringify({ count: totalUpserted, sheet: sheetName })}::jsonb,
          NOW()
        )
      `);
    } catch {
      // audit failure is non-fatal
    }

    return NextResponse.json({ ok: true, synced: totalUpserted, sheet: sheetName });

  } catch (err: unknown) {
    console.error("[POST /api/db-vujis/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
