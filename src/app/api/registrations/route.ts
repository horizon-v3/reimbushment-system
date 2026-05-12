import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { registrations, appSettings, auditLog } from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { backupRegistrationToSheet, exportSheetToExcel } from "@/lib/gas-client";

// ─── GET /api/registrations ────────────────────────────────────────────────────
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

    return NextResponse.json({ rows, total: Number(count) });
  } catch (err) {
    console.error("[GET /api/registrations]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── POST /api/registrations ───────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { records, single } = body as {
      records?: Record<string, unknown>[];
      single?: Record<string, unknown>;
    };

    // Get settings for GAS backup
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);

    if (single) {
      // Insert single record
      const [inserted] = await db
        .insert(registrations)
        .values(mapRegistration(single))
        .returning();

      // Async backup to GAS (don't await to avoid timeout)
      triggerGasBackup("registration", inserted, settings).catch(console.error);

      // Audit log
      await db.insert(auditLog).values({
        userId: parseInt(session.user?.id ?? "0"),
        action: "create_registration",
        entityType: "registration",
        entityId: inserted.id,
      });

      return NextResponse.json({ ok: true, record: inserted });
    }

    if (records && records.length > 0) {
      // Bulk insert
      const mapped = records.map(mapRegistration);
      const inserted = await db
        .insert(registrations)
        .values(mapped)
        .returning();

      // Trigger GAS backup for each
      inserted.forEach((r) => triggerGasBackup("registration", r, settings).catch(console.error));

      await db.insert(auditLog).values({
        userId: parseInt(session.user?.id ?? "0"),
        action: "bulk_import_registrations",
        entityType: "registration",
        metadata: { count: inserted.length },
      });

      return NextResponse.json({ ok: true, inserted: inserted.length });
    }

    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[POST /api/registrations]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapRegistration(r: Record<string, unknown>) {
  return {
    srNo: r.sr_no as number | null,
    timestampRaw: r.timestamp_raw as string | null,
    title: r.title as string | null,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    countryName: r.country_name as string | null,
    passportCountry: r.passport_country as string | null,
    region: r.region as string | null,
    participantMobile: r.participant_mobile as string | null,
    participantEmail: r.participant_email as string | null,
    companyName: r.company_name as string | null,
    companyWebsite: r.company_website as string | null,
    designation: r.designation as string | null,
    passportNumber: r.passport_number as string | null,
    placeOfIssue: r.place_of_issue as string | null,
    dateOfExpiry: r.date_of_expiry as string | null,
    natureOfBusiness: r.nature_of_business as string | null,
    mainImportProduct1: r.main_import_product_1 as string | null,
    mainImportProduct2: r.main_import_product_2 as string | null,
    productsServices: r.products_services as string | null,
    poc: r.poc as string | null,
    proofImport: r.proof_import as string | null,
    typeOfPoi: r.type_of_poi as string | null,
    blSupplierCountry: r.bl_supplier_country as string | null,
    blBuyerCountry: r.bl_buyer_country as string | null,
    status: r.status as string | null,
    flightHotelCode: r.flight_hotel_code as string | null,
    remarks: r.remarks as string | null,
    blStatus: r.bl_status as string | null,
    bbInvitationStatus: r.bb_invitation_status as string | null,
    dollarBusiness: r.dollar_business as string | null,
    vujis: r.vujis as string | null,
    drivePassportFrontUrl: r.drive_passport_front_url as string | null,
    drivePassportBackUrl: r.drive_passport_back_url as string | null,
    driveProofUrl: r.drive_proof_url as string | null,
    driveBusinessCardUrl: r.drive_business_card_url as string | null,
  };
}

async function triggerGasBackup(
  type: "registration",
  data: Record<string, unknown>,
  settings: typeof appSettings.$inferSelect | undefined
) {
  if (!settings?.gasWebAppUrl) return;

  // Normalize keys to snake_case for GAS
  const payload = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [toSnake(k), v])
  );

  await backupRegistrationToSheet(payload, {
    sheetId: settings.registrationSheetId ?? undefined,
    sheetName: settings.registrationSheetName ?? undefined,
  });

  // Export to Excel after backup
  if (settings.registrationSheetId) {
    await exportSheetToExcel(settings.registrationSheetId, {
      fileName: "DelegateConnect_Registrations",
      folderId: settings.driveFolderId ?? undefined,
    });
  }
}

function toSnake(str: string): string {
  return str.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());
}
