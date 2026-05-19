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
  import_value_in_usd_1:             "import_value_dollar",  // second duplicate
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

/** Normalize a sheet header to a snake_case key */
function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Coerce any value to a DB-safe string or null — never undefined */
function dbStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Coerce to a positive integer or null */
function dbInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
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
    // ── 1. Auto-migrate: ensure table + column exist ────────────────────────
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

    // ── 2. Load settings via raw SQL ────────────────────────────────────────
    const settingsResult = Array.from(await db.execute(sql`
      SELECT
        gas_web_app_url,
        registration_sheet_id,
        COALESCE(db_vujis_sheet_name, 'DB & vujis') AS db_vujis_sheet_name
      FROM app_settings WHERE id = 1 LIMIT 1
    `));

    const s = (settingsResult[0] ?? null) as Record<string, unknown> | null;
    const gasUrl      = dbStr(s?.gas_web_app_url);
    const sheetId     = dbStr(s?.registration_sheet_id);
    const sheetName   = dbStr(s?.db_vujis_sheet_name) || "DB & vujis";

    if (!gasUrl)    return NextResponse.json({ error: "GAS Web App URL not configured in Settings" }, { status: 400 });
    if (!sheetId)   return NextResponse.json({ error: "Sheet ID not configured in Settings" }, { status: 400 });

    // ── 3. Fetch rows from Google Sheet ─────────────────────────────────────
    const fetchUrl = new URL(gasUrl);
    fetchUrl.searchParams.set("action",    "getRows");
    fetchUrl.searchParams.set("sheetId",   sheetId);
    fetchUrl.searchParams.set("sheetName", sheetName);

    let gasData: { ok: boolean; rows?: Record<string, unknown>[]; error?: string };
    try {
      const res = await fetch(fetchUrl.toString(), {
        redirect: "follow",
        headers:  { "Cache-Control": "no-cache" },
        signal:   AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from GAS`);
      gasData = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Failed to reach Google Sheet: ${msg}` }, { status: 502 });
    }

    if (!gasData.ok) {
      return NextResponse.json({ error: gasData.error ?? "GAS returned ok:false" }, { status: 502 });
    }

    const rawRows = gasData.rows ?? [];
    if (rawRows.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: `No rows in sheet "${sheetName}"` });
    }

    // ── 4. Map + validate rows ──────────────────────────────────────────────
    type DbRec = {
      sr_no: number;
      company_name: string | null;
      country_name: string | null;
      region: string | null;
      proof_of_import_y: string | null;
      proof_of_import_n: string | null;
      vujis: string | null;
      import_value_vujis: string | null;
      dollar_business: string | null;
      import_value_dollar: string | null;
      both_db_vujis: string | null;
      importing_from_india: string | null;
      importing_from_other_country: string | null;
      main_import_product_1: string | null;
      main_import_product_2: string | null;
      poc: string | null;
      reason: string | null;
      comment: string | null;
    };

    const records: DbRec[] = [];

    for (const row of rawRows) {
      // Map raw headers → db columns (first-wins for duplicates)
      const flat: Record<string, unknown> = {};
      for (const [rawKey, value] of Object.entries(row)) {
        const norm  = normalizeHeader(rawKey);
        const dbCol = HEADER_MAP[norm];
        if (dbCol && !(dbCol in flat)) {
          flat[dbCol] = value;
        }
      }

      const srNo = dbInt(flat.sr_no);
      if (!srNo) continue;   // skip rows without a valid Sr No

      records.push({
        sr_no:                        srNo,
        company_name:                 dbStr(flat.company_name),
        country_name:                 dbStr(flat.country_name),
        region:                       dbStr(flat.region),
        proof_of_import_y:            dbStr(flat.proof_of_import_y),
        proof_of_import_n:            dbStr(flat.proof_of_import_n),
        vujis:                        dbStr(flat.vujis),
        import_value_vujis:           dbStr(flat.import_value_vujis),
        dollar_business:              dbStr(flat.dollar_business),
        import_value_dollar:          dbStr(flat.import_value_dollar),
        both_db_vujis:                dbStr(flat.both_db_vujis),
        importing_from_india:         dbStr(flat.importing_from_india),
        importing_from_other_country: dbStr(flat.importing_from_other_country),
        main_import_product_1:        dbStr(flat.main_import_product_1),
        main_import_product_2:        dbStr(flat.main_import_product_2),
        poc:                          dbStr(flat.poc),
        reason:                       dbStr(flat.reason),
        comment:                      dbStr(flat.comment),
      });
    }

    if (records.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "No valid rows (missing Sr No)" });
    }

    // ── 5. Upsert each record individually with explicit typed params ────────
    let synced = 0;
    for (const r of records) {
      try {
        await db.execute(sql`
          INSERT INTO db_vujis_records (
            sr_no, company_name, country_name, region,
            proof_of_import_y, proof_of_import_n,
            vujis, import_value_vujis,
            dollar_business, import_value_dollar,
            both_db_vujis,
            importing_from_india, importing_from_other_country,
            main_import_product_1, main_import_product_2,
            poc, reason, comment,
            created_at, updated_at
          ) VALUES (
            ${r.sr_no},
            ${r.company_name},
            ${r.country_name},
            ${r.region},
            ${r.proof_of_import_y},
            ${r.proof_of_import_n},
            ${r.vujis},
            ${r.import_value_vujis},
            ${r.dollar_business},
            ${r.import_value_dollar},
            ${r.both_db_vujis},
            ${r.importing_from_india},
            ${r.importing_from_other_country},
            ${r.main_import_product_1},
            ${r.main_import_product_2},
            ${r.poc},
            ${r.reason},
            ${r.comment},
            NOW(), NOW()
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
        synced++;
      } catch (rowErr) {
        // Log the bad row but continue syncing the rest
        console.error(`[db-vujis/sync] Row sr_no=${r.sr_no} failed:`, rowErr);
      }
    }

    // ── 6. Audit log (non-fatal) ────────────────────────────────────────────
    try {
      await db.execute(sql`
        INSERT INTO audit_log (user_id, action, entity_type, metadata, created_at)
        VALUES (
          ${session.user?.id === "admin" ? 1 : parseInt(session.user?.id ?? "0")},
          ${"sync_db_vujis"},
          ${"db_vujis"},
          ${JSON.stringify({ synced, total: records.length, sheet: sheetName })}::jsonb,
          NOW()
        )
      `);
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      synced,
      total: records.length,
      sheet: sheetName,
    });

  } catch (err: unknown) {
    console.error("[POST /api/db-vujis/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
