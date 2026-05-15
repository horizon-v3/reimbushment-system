import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings, registrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── POST /api/sync ── Fetch live data from GAS → upsert into Neon ────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load settings
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!settings?.gasWebAppUrl) {
    return NextResponse.json({ error: "GAS Web App URL not configured. Set it in Admin → Settings." }, { status: 400 });
  }
  if (!settings.registrationSheetId) {
    return NextResponse.json({ error: "Sheet ID not configured. Set it in Admin → Settings." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = (body as { mode?: string }).mode ?? "full"; // "full" | "incremental"

  try {
    // ── 1. Call GAS to get sheet data ─────────────────────────────────────────
    const gasUrl = new URL(settings.gasWebAppUrl);
    gasUrl.searchParams.set("action", "getRows");
    gasUrl.searchParams.set("sheetId", settings.registrationSheetId);
    gasUrl.searchParams.set("sheetName", settings.registrationSheetName ?? "Form Responses 1");
    gasUrl.searchParams.set("mode", mode);

    const gasRes = await fetch(gasUrl.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!gasRes.ok) {
      throw new Error(`GAS returned ${gasRes.status}: ${await gasRes.text()}`);
    }

    const gasData = await gasRes.json() as {
      ok: boolean;
      rows: Record<string, unknown>[];
      error?: string;
    };

    if (!gasData.ok) throw new Error(gasData.error ?? "GAS returned ok:false");

    const rows = gasData.rows ?? [];
    if (rows.length === 0) return NextResponse.json({ ok: true, upserted: 0, message: "No rows returned from sheet" });

    // ── 2. Map raw sheet rows → DB fields ─────────────────────────────────────
    const mapped = rows.map(mapSheetRow);

    // ── 3. Batch upsert into Neon (by sr_no) ──────────────────────────────────
    const BATCH = 100;
    let upserted = 0;

    for (let i = 0; i < mapped.length; i += BATCH) {
      const batch = mapped.slice(i, i + BATCH);

      for (const row of batch) {
        if (!row.srNo) continue;

        await db
          .insert(registrations)
          .values(row)
          .onConflictDoUpdate({
            target: registrations.srNo,
            set: {
              firstName:             row.firstName,
              lastName:              row.lastName,
              title:                 row.title,
              countryName:           row.countryName,
              passportCountry:       row.passportCountry,
              region:                row.region,
              participantMobile:     row.participantMobile,
              participantEmail:      row.participantEmail,
              companyName:           row.companyName,
              companyWebsite:        row.companyWebsite,
              designation:           row.designation,
              passportNumber:        row.passportNumber,
              placeOfIssue:          row.placeOfIssue,
              dateOfExpiry:          row.dateOfExpiry,
              natureOfBusiness:      row.natureOfBusiness,
              mainImportProduct1:    row.mainImportProduct1,
              mainImportProduct2:    row.mainImportProduct2,
              productsServices:      row.productsServices,
              poc:                   row.poc,
              proofImport:           row.proofImport,
              typeOfPoi:             row.typeOfPoi,
              blSupplierCountry:     row.blSupplierCountry,
              blBuyerCountry:        row.blBuyerCountry,
              status:                row.status,
              flightHotelCode:       row.flightHotelCode,
              remarks:               row.remarks,
              blStatus:              row.blStatus,
              bbInvitationStatus:    row.bbInvitationStatus,
              passportFrontCopy:     row.passportFrontCopy,
              passportBackCopy:      row.passportBackCopy,
              proofUpload:           row.proofUpload,
              businessCardUpload:    row.businessCardUpload,
              drivePassportFrontUrl: row.drivePassportFrontUrl,
              drivePassportBackUrl:  row.drivePassportBackUrl,
              driveProofUrl:         row.driveProofUrl,
              driveBusinessCardUrl:  row.driveBusinessCardUrl,
              updatedAt:             new Date(),
            },
          });

        upserted++;
      }
    }

    console.log(`[POST /api/sync] upserted=${upserted} from ${rows.length} sheet rows`);
    return NextResponse.json({ ok: true, upserted, total: rows.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    console.error("[POST /api/sync]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/sync — Status / last sync info ──────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(registrations);

  return NextResponse.json({
    configured: !!(settings?.gasWebAppUrl && settings?.registrationSheetId),
    gasWebAppUrl: settings?.gasWebAppUrl ?? null,
    sheetId: settings?.registrationSheetId ?? null,
    sheetName: settings?.registrationSheetName ?? null,
    dbCount: Number(count),
    lastSettingsUpdate: settings?.updatedAt ?? null,
  });
}

// ─── Row mapper: sheet column headers → Drizzle insert object ─────────────────
function mapSheetRow(r: Record<string, unknown>) {
  const s = (keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()];
      if (v != null && String(v).trim()) return String(v).replace(/[\r\n]+/g, " ").trim();
    }
    return null;
  };
  const n = (keys: string[]): number | null => {
    const v = s(keys); if (!v) return null;
    const num = Number(v); return isNaN(num) ? null : num;
  };

  // Robust product matching
  let p1: string | null = null, p2: string | null = null;
  for (const [k, v] of Object.entries(r)) {
    const lk = k.toLowerCase().trim();
    if (lk.includes("import") && lk.includes("product")) {
      const val = v != null && String(v).trim() ? String(v).replace(/[\r\n]+/g, " ").trim() : null;
      if (lk.includes("2")) { if (!p2) p2 = val; }
      else                  { if (!p1) p1 = val; }
    }
  }

  return {
    srNo:                  n(["Sr No", "sr_no", "SR NO", "Sr. No"]),
    timestampRaw:          s(["Timestamp", "timestamp_raw"]),
    title:                 s(["Title", "title"]),
    firstName:             s(["First Name (As Written on Passport)", "First Name", "first_name"]),
    lastName:              s(["Last Name (As written on Passport)", "Last Name", "last_name"]),
    countryName:           s(["Country Name", "country_name"]),
    passportCountry:       s(["Passport Country", "passport_country"]),
    region:                s(["Region", "region"]),
    participantMobile:     s(["Participant Mobile/Whatsapp number (With ISD Code)", "Participant Mobile", "participant_mobile"]),
    participantEmail:      s(["Participant Email", "participant_email"]),
    companyName:           s(["Company Name", "company_name"]),
    companyWebsite:        s(["Company Website", "company_website"]),
    designation:           s(["Designation of the Representative", "Designation", "designation"]),
    passportNumber:        s(["Passport Number", "passport_number"]),
    placeOfIssue:          s(["Place of Issue", "place_of_issue"]),
    dateOfExpiry:          s(["Date of Expiry", "date_of_expiry"]),
    passportFrontCopy:     s(["Passport Front Copy", "passport_front_copy"]),
    passportBackCopy:      s(["Passport Back Copy", "passport_back_copy"]),
    natureOfBusiness:      s(["Nature of Business", "nature_of_business"]),
    mainImportProduct1:    p1 || s(["Your Main Import Product - 1", "main_import_product_1"]),
    mainImportProduct2:    p2 || s(["Your Main Import Product - 2", "main_import_product_2"]),
    proofUpload:           s(["Upload one proof of your Import (Please enter valid document Eg: - Bill of Lading)", "proof_upload"]),
    productsServices:      s(["Which of the below describes your products/services", "products_services"]),
    businessCardUpload:    s(["Please upload your Business Card", "business_card_upload"]),
    poc:                   s(["POC", "poc"]),
    proofImport:           s(["Proof of Import", "proof_import"]),
    typeOfPoi:             s(["Type of POI", "type_of_poi"]),
    blSupplierCountry:     s(["B/L Supplier Country", "bl_supplier_country"]),
    blBuyerCountry:        s(["B/L Buyer Country", "bl_buyer_country"]),
    status:                s(["Status", "status"]),
    flightHotelCode:       s(["Flight & Hotel", "flight_hotel_code"]),
    remarks:               s(["Remarks", "remarks"]),
    blStatus:              s(["B/L Status", "bl_status"]),
    bbInvitationStatus:    s(["BB Invitation letter status", "bb_invitation_status"]),
    drivePassportFrontUrl: s(["drive_passport_front_url"]),
    drivePassportBackUrl:  s(["drive_passport_back_url"]),
    driveProofUrl:         s(["drive_proof_url"]),
    driveBusinessCardUrl:  s(["drive_business_card_url"]),
  };
}
