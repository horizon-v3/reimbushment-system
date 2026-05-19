import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { registrations, appSettings, auditLog } from "@/db/schema";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { backupRegistrationToSheet, exportSheetToExcel } from "@/lib/gas-client";

// ============================================================
// Normalize a raw CSV / JSON key into a stable lookup string:
//   1. trim + lowercase
//   2. replace ALL non-word characters (spaces, /, &, -, (, ) …) with "_"
//   3. collapse multiple consecutive underscores
//   4. strip leading / trailing underscore
// Examples:
//   "B/L Supplier Country"  => "b_l_supplier_country"
//   "Flight & Hotel"        => "flight_hotel"
//   "First Name (As Written On Passport)" => "first_name_as_written_on_passport"
// ============================================================
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")   // replace every run of non-word chars with "_"
    .replace(/_+/g, "_")       // collapse consecutive underscores
    .replace(/^_|_$/g, "");    // strip leading / trailing underscore
}

// Google Form column header (normalized) => DB snake_case column name
const HEADER_MAP: Record<string, string> = {
  timestamp:                                                       "timestamp_raw",
  sr_no:                                                           "sr_no",
  title:                                                           "title",
  // "First Name (As Written on Passport)"
  first_name_as_written_on_passport:                               "first_name",
  first_name:                                                      "first_name",
  // "Last Name (As Written on Passport)"
  last_name_as_written_on_passport:                                "last_name",
  last_name:                                                       "last_name",
  country_name:                                                    "country_name",
  passport_country:                                                "passport_country",
  region:                                                          "region",
  // "Participant Mobile/Whatsapp Number (With ISD Code)"
  participant_mobile_whatsapp_number_with_isd_code:                "participant_mobile",
  participant_mobile:                                              "participant_mobile",
  participant_email:                                               "participant_email",
  company_name:                                                    "company_name",
  company_website:                                                 "company_website",
  // "Designation of the Representative"
  designation_of_the_representative:                              "designation",
  designation:                                                     "designation",
  passport_number:                                                 "passport_number",
  place_of_issue:                                                  "place_of_issue",
  date_of_expiry:                                                  "date_of_expiry",
  passport_front_copy:                                             "passport_front_copy",
  passport_back_copy:                                              "passport_back_copy",
  nature_of_business:                                              "nature_of_business",
  // "Your Main Import Product - 1" → all possible normalizations
  your_main_import_product_1:                                      "main_import_product_1",
  your_main_import_product__1:                                     "main_import_product_1",
  your_main_import_product___1:                                    "main_import_product_1",
  your_main_import_products_1:                                     "main_import_product_1",
  main_import_product_1:                                           "main_import_product_1",
  import_product_1:                                                "main_import_product_1",
  primary_sector:                                                  "main_import_product_1",
  sector_1:                                                        "main_import_product_1",
  // "Your Main Import Product - 2" → all possible normalizations
  your_main_import_product_2:                                      "main_import_product_2",
  your_main_import_product__2:                                     "main_import_product_2",
  your_main_import_product___2:                                    "main_import_product_2",
  your_main_import_products_2:                                     "main_import_product_2",
  main_import_product_2:                                           "main_import_product_2",
  import_product_2:                                                "main_import_product_2",
  secondary_sector:                                                "main_import_product_2",
  sector_2:                                                        "main_import_product_2",
  // Various proof-of-import header spellings
  upload_one_proof_of_your_import_please_enter_valid_document_eg_bill_of_lading: "proof_upload",
  upload_one_proof_of_your_import:                                 "proof_upload",
  proof_upload:                                                    "proof_upload",
  // "Which of the below describes your products/services"
  which_of_the_below_describes_your_products_services:             "products_services",
  products_services:                                               "products_services",
  // "Please upload your Business Card"
  please_upload_your_business_card:                                "business_card_upload",
  business_card_upload:                                            "business_card_upload",
  poc:                                                             "poc",
  proof_of_import:                                                 "proof_import",
  proof_import:                                                    "proof_import",
  type_of_poi:                                                     "type_of_poi",
  // "B/L Supplier Country" => "b_l_supplier_country"
  b_l_supplier_country:                                            "bl_supplier_country",
  bl_supplier_country:                                             "bl_supplier_country",
  // "B/L Buyer Country" => "b_l_buyer_country"
  b_l_buyer_country:                                               "bl_buyer_country",
  bl_buyer_country:                                                "bl_buyer_country",
  status:                                                          "status",
  // "Flight & Hotel" => "flight_hotel"
  flight_hotel:                                                    "flight_hotel_code",
  flight_hotel_code:                                               "flight_hotel_code",
  remarks:                                                         "remarks",
  // "B/L Status" => "b_l_status"
  b_l_status:                                                      "bl_status",
  bl_status:                                                       "bl_status",
  bb_invitation_letter_status:                                     "bb_invitation_status",
  bb_invitation_status:                                            "bb_invitation_status",
  // "Will Not Attend" column — any non-blank value = will not attend, blank = attend
  will_not_attend:                                                 "will_not_attend",
  // Drive URLs populated by GAS
  drive_passport_front_url:                                        "drive_passport_front_url",
  drive_passport_back_url:                                         "drive_passport_back_url",
  drive_proof_url:                                                 "drive_proof_url",
  drive_business_card_url:                                         "drive_business_card_url",
};

// ─── GET /api/registrations ─────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "5000");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  try {
    const rows = await db
      .select()
      .from(registrations)
      .orderBy(asc(registrations.srNo))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(registrations);

    // Drizzle returns camelCase keys — frontend expects snake_case
    const toSnake = (obj: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k.replace(/([A-Z]|\d+)/g, "_$1").toLowerCase(),
          v,
        ])
      );

    return NextResponse.json({ rows: rows.map(toSnake), total: Number(count) });
  } catch (err) {
    console.error("[GET /api/registrations]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── PATCH /api/registrations (admin-only) ── patch sector columns only ──────
// Body: { records: Array<{ sr_no, raw_key_1, raw_key_2 }> }
// The client sends raw CSV rows; we extract product columns by fuzzy key scan
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { records: Record<string, unknown>[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const records = body.records ?? [];
  let updated = 0;
  let skipped = 0;

  for (const r of records) {
    // Extract sr_no
    let srNo: number | null = null;
    for (const [k, v] of Object.entries(r)) {
      if (k.toLowerCase().trim().includes("sr") && k.toLowerCase().trim().includes("no")) {
        const n = Number(v); if (!isNaN(n) && n > 0) { srNo = n; break; }
      }
    }
    // Direct key match for sr_no fallback
    if (!srNo) {
      const v = r["Sr No"] ?? r["sr_no"] ?? r["SR NO"] ?? r["Sr. No"];
      if (v != null) { const n = Number(v); if (!isNaN(n) && n > 0) srNo = n; }
    }
    if (!srNo) { skipped++; continue; }

    // Extract product columns by simple includes
    let p1: string | null = null;
    let p2: string | null = null;
    for (const [k, v] of Object.entries(r)) {
      const lk = k.toLowerCase().trim();
      if (lk.includes("import") && lk.includes("product")) {
        const val = v != null && String(v).trim() ? String(v).replace(/[\r\n]+/g, " ").trim() : null;
        if (lk.includes("2")) { if (!p2) p2 = val; }
        else                  { if (!p1) p1 = val; }
      }
    }

    try {
      await db
        .update(registrations)
        .set({ mainImportProduct1: p1, mainImportProduct2: p2 })
        .where(eq(registrations.srNo, srNo));
      updated++;
    } catch { skipped++; }
  }

  console.log(`[PATCH /api/registrations] updated=${updated} skipped=${skipped}`);
  return NextResponse.json({ ok: true, updated, skipped });
}


// ─── POST /api/registrations (admin-only) ───────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admins and users can insert data
  const role = (session.user as { role?: string }).role ?? "user";
  if (role !== "admin" && role !== "user" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { records, single } = body as {
      records?: Record<string, unknown>[];
      single?: Record<string, unknown>;
    };

    // ── Single record insert ─────────────────────────────────
    if (single) {
      const mapped = mapRegistration(single);
      console.log("[POST /api/registrations] single mapped:", JSON.stringify(mapped).slice(0, 300));

      const [inserted] = await db
        .insert(registrations)
        .values(mapped)
        .returning();

      // Audit log — wrapped so it never breaks the main response
      db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "create_registration",
        entityType: "registration",
        entityId: inserted.id,
      }).catch(console.error);

      return NextResponse.json({ ok: true, record: inserted });
    }

    // ── Bulk CSV import ──────────────────────────────────────
    if (records && records.length > 0) {
      const mapped = records.map(mapRegistration);

      // Debug: log the first mapped row
      // ── DIAGNOSTIC: log first row's normalized keys to catch header issues ──
      const firstRaw = records[0] as Record<string, unknown>;
      const diagKeys: Record<string, string> = {};
      for (const [rawKey] of Object.entries(firstRaw)) {
        const norm = normalizeHeader(rawKey);
        const dbCol = HEADER_MAP[norm] ?? norm;
        diagKeys[rawKey] = `→ norm:"${norm}" → db:"${dbCol}"`;
      }
      console.log("[POST /api/registrations] HEADER DIAGNOSIS:", JSON.stringify(diagKeys, null, 2));
      console.log("[POST /api/registrations] FIRST ROW product_1:", (firstRaw as Record<string,unknown>)["Your Main Import Product - 1"] ?? "KEY NOT FOUND");


      console.log("[POST /api/registrations] first mapped row:", JSON.stringify(mapped[0]));
      console.log("[POST /api/registrations] importing", mapped.length, "rows");

      // PostgreSQL max parameters = 65535. Each row has 38 params.
      // Safe batch size = floor(65535 / 38) = 1724. Use 100 for Neon serverless headroom.
      const BATCH = 100;
      let totalInserted = 0;

      for (let i = 0; i < mapped.length; i += BATCH) {
        const batch = mapped.slice(i, i + BATCH);
        // ── Upsert: delete existing sr_no rows first, then insert fresh ──────
        // This avoids needing a UNIQUE constraint on sr_no while still ensuring
        // re-imports fully overwrite all columns including product fields.
        const srNos = batch.map(r => r.srNo).filter((v): v is number => v != null && !isNaN(v));
        try {
          // Step 1: delete existing rows for these sr_nos (no-op if not present)
          if (srNos.length > 0) {
            await db.delete(registrations).where(inArray(registrations.srNo, srNos));
          }
          // Step 2: insert the full batch fresh
          const result = await db
            .insert(registrations)
            .values(batch)
            .returning({ id: registrations.id });
          totalInserted += result.length;
          console.log(`[POST] batch ${i / BATCH + 1}: inserted ${result.length}/${batch.length}`);
        } catch (batchErr: unknown) {
          // Log the exact DB error for this batch
          console.error(`[POST] batch ${i / BATCH + 1} FAILED:`, batchErr);
          const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
          return NextResponse.json(
            { error: `Batch ${i / BATCH + 1} failed: ${msg}` },
            { status: 500 }
          );
        }
      }

      // Audit log — wrapped so it never blocks the response
      db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "bulk_import_registrations",
        entityType: "registration",
        metadata: { count: totalInserted, total: mapped.length },
      }).catch(console.error);

      return NextResponse.json({ ok: true, inserted: totalInserted, total: mapped.length });
    }

    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[POST /api/registrations] top-level error:", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// ─── DELETE /api/registrations?id=X  OR  ?all=true (admin-only) ─────────────
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "true";

  // ── Wipe ALL registrations ─────────────────────────────────
  if (all) {
    try {
      await db.delete(registrations);

      await db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "clear_all_registrations",
        entityType: "registration",
        metadata: { wipedAt: new Date().toISOString() },
      });

      console.warn(`[DELETE /api/registrations] ALL data wiped by user ${session.user?.id}`);
      return NextResponse.json({ ok: true, wiped: true });
    } catch (err) {
      console.error("[DELETE /api/registrations?all=true]", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // ── Single row delete ──────────────────────────────────────
  const id = parseInt(url.searchParams.get("id") ?? "");
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    await db.delete(registrations).where(eq(registrations.id, id));

    await db.insert(auditLog).values({
      userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
      action: "delete_registration",
      entityType: "registration",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/registrations]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}


// ─── Helpers ────────────────────────────────────────────────

/**
 * Normalize an incoming raw CSV row (or JSON object) into exact DB fields.
 * Keys are normalized via normalizeHeader() so any Google Form header variant
 * maps correctly (e.g. "B/L Supplier Country" -> "b_l_supplier_country" -> "bl_supplier_country").
 */
function mapRegistration(r: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  // ── Step 1: Direct pre-scan for product/sector columns ───────────────────────
  // Run BEFORE HEADER_MAP so this always wins regardless of normalization
  for (const [rawKey, value] of Object.entries(r)) {
    const k = rawKey.toLowerCase().trim();
    // "Your Main Import Product - 1" / "Your Main Import Product - 2"
    if (k.includes("import") && k.includes("product")) {
      if (k.includes("2")) {
        if (normalized["main_import_product_2"] === undefined) {
          console.log(`[mapReg] pre-scan product_2 ← "${rawKey}"`);
          normalized["main_import_product_2"] = value;
        }
      } else {
        if (normalized["main_import_product_1"] === undefined) {
          console.log(`[mapReg] pre-scan product_1 ← "${rawKey}"`);
          normalized["main_import_product_1"] = value;
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Step 2: HEADER_MAP loop (will not overwrite already-set keys) ─────────────
  for (const [rawKey, value] of Object.entries(r)) {
    const key = normalizeHeader(rawKey);
    const mapped = HEADER_MAP[key] ?? key;
    if (normalized[mapped] === undefined) normalized[mapped] = value;
  }


  // Helper: return string or null (never undefined which causes Drizzle to use DEFAULT)
  const s = (k: string): string | null => {
    const v = normalized[k];
    if (v == null || v === "") return null;
    return String(v).replace(/[\r\n]+/g, " ").trim() || null;
  };

  const n = (k: string): number | null => {
    const v = normalized[k];
    if (v == null || v === "") return null;
    const num = Number(v);
    return isNaN(num) ? null : num;
  };

  return {
    srNo:                  n("sr_no"),
    timestampRaw:          s("timestamp_raw"),
    title:                 s("title"),
    firstName:             s("first_name"),
    lastName:              s("last_name"),
    countryName:           s("country_name"),
    passportCountry:       s("passport_country"),
    region:                s("region"),
    participantMobile:     s("participant_mobile"),
    participantEmail:      s("participant_email"),
    companyName:           s("company_name"),
    companyWebsite:        s("company_website"),
    designation:           s("designation"),
    passportNumber:        s("passport_number"),
    placeOfIssue:          s("place_of_issue"),
    dateOfExpiry:          s("date_of_expiry"),
    passportFrontCopy:     s("passport_front_copy"),
    passportBackCopy:      s("passport_back_copy"),
    natureOfBusiness:      s("nature_of_business"),
    mainImportProduct1:    s("main_import_product_1"),
    mainImportProduct2:    s("main_import_product_2"),
    proofUpload:           s("proof_upload"),
    productsServices:      s("products_services"),
    businessCardUpload:    s("business_card_upload"),
    poc:                   s("poc"),
    proofImport:           s("proof_import"),
    typeOfPoi:             s("type_of_poi"),
    blSupplierCountry:     s("bl_supplier_country"),
    blBuyerCountry:        s("bl_buyer_country"),
    status:                s("status"),
    flightHotelCode:       s("flight_hotel_code"),
    remarks:               s("remarks"),
    blStatus:              s("bl_status"),
    bbInvitationStatus:    s("bb_invitation_status"),
    willNotAttend:         s("will_not_attend"),
    drivePassportFrontUrl: s("drive_passport_front_url"),
    drivePassportBackUrl:  s("drive_passport_back_url"),
    driveProofUrl:         s("drive_proof_url"),
    driveBusinessCardUrl:  s("drive_business_card_url"),
  };
}


