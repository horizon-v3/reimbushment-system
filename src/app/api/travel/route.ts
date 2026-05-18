import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings, auditLog } from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import { backupTravelRecordToSheet, exportSheetToExcel, deleteDriveFolder } from "@/lib/gas-client";
import { eq } from "drizzle-orm";
import type { Session } from "next-auth";

function isAllowedToEdit(session: Session | null): boolean {
  if (!session) return false;
  const role = (session.user as { role?: string }).role ?? "staff";
  return role === "admin" || role === "supervisor";
}


// GET /api/travel — any authenticated user may read
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "5000");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  try {
    const rows = await db
      .select()
      .from(travelRecords)
      .orderBy(asc(travelRecords.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(travelRecords);

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
    console.error("[GET /api/travel]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// POST /api/travel — admin-only
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowedToEdit(session)) return NextResponse.json({ error: "Forbidden: admin or supervisor access required" }, { status: 403 });

  try {
    const body = await request.json();
    const { record, records } = body as {
      record?: Record<string, unknown>;
      records?: Record<string, unknown>[];
    };

    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);

    if (record) {
      const [inserted] = await db
        .insert(travelRecords)
        .values(mapTravelRecord(record))
        .returning();

      triggerTravelGasBackup(inserted, settings).catch(console.error);

      await db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "create_travel_record",
        entityType: "travel_record",
        entityId: inserted.id,
      });

      return NextResponse.json({ ok: true, record: inserted });
    }

    if (records && records.length > 0) {
      const mapped = records.map(mapTravelRecord);
      const inserted = await db.insert(travelRecords).values(mapped).returning();

      inserted.forEach((r) => triggerTravelGasBackup(r, settings).catch(console.error));

      await db.insert(auditLog).values({
        userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
        action: "bulk_import_travel_records",
        entityType: "travel_record",
        metadata: { count: inserted.length },
      });

      return NextResponse.json({ ok: true, inserted: inserted.length });
    }

    return NextResponse.json({ error: "No data" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[POST /api/travel]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT /api/travel — admin-only
export async function PUT(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowedToEdit(session)) return NextResponse.json({ error: "Forbidden: admin or supervisor access required" }, { status: 403 });

  try {
    const body = await request.json();
    const { id, record } = body as { id: number; record: Record<string, unknown> };

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [updated] = await db
      .update(travelRecords)
      .set({ ...mapTravelRecord(record), updatedAt: new Date() })
      .where(eq(travelRecords.id, id))
      .returning();

    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    triggerTravelGasBackup(updated, settings).catch(console.error);

    await db.insert(auditLog).values({
      userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
      action: "update_travel_record",
      entityType: "travel_record",
      entityId: id,
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err: unknown) {
    console.error("[PUT /api/travel]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/travel — admin-only
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden: admin access required to delete" }, { status: 403 });

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const [existing] = await db.select().from(travelRecords).where(eq(travelRecords.id, id)).limit(1);
    
    if (existing) {
      const delegateName = `${existing.responsesSrNo ?? ""} ${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim();
      const subFolderName = delegateName || "Delegates";
      
      // Delete drive folder silently
      deleteDriveFolder(subFolderName).catch(console.error);
    }

    await db.delete(travelRecords).where(eq(travelRecords.id, id));

    await db.insert(auditLog).values({
      userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
      action: "delete_travel_record",
      entityType: "travel_record",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/travel]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// Helpers
function mapTravelRecord(r: Record<string, unknown>) {
  const s = (k: string): string | null => {
    const v = r[k];
    if (v == null || v === "") return null;
    return String(v);
  };
  return {
    registrationId: r.registration_id ? parseInt(String(r.registration_id)) : null,
    responsesSrNo: s("responses_sr_no"),
    roomNo: s("room_no"),
    hotelName: s("hotel_name"),
    initial: s("initial"),
    firstName: s("first_name"),
    lastName: s("last_name"),
    countryName: s("country_name"),
    countryCode: s("country_code"),
    participantMobile: s("participant_mobile"),
    checkInDate: s("check_in_date"),
    checkOutDate: s("check_out_date"),
    roomUnits: s("room_units"),
    arrivalDate: s("arrival_date"),
    arrivalFlightNo: s("arrival_flight_no"),
    arrivalTo: s("arrival_to"),
    arrivalTime: s("arrival_time"),
    departureDate: s("departure_date"),
    departureFlightNo: s("departure_flight_no"),
    departureFrom: s("departure_from"),
    departureTime: s("departure_time"),
    sector: s("sector"),
    companyName: s("company_name"),
    poc: s("poc"),
    status: s("status") ?? "Pending",
    reimbursement: s("reimbursement") ?? "No",
    reimbursementAmount: s("reimbursement_amount"),
    bl: s("bl"),
    blUrl: s("bl_url"),
    notes: s("notes"),
    invoiceAmount: s("invoice_amount"),
    invoiceAmountUsd: s("invoice_amount_usd"),
    invoiceAmountLocal: s("invoice_amount_local"),
    invoiceCurrency: s("invoice_currency"),
    ticketReceived: s("ticket_received") ?? "No",
    invoiceReceived: s("invoice_received") ?? "No",
    visaReceived: s("visa_received") ?? "No",
    passportCopyReceived: s("passport_copy_received") ?? "No",
    voucherReceived: s("voucher_received") ?? "No",
    ticketUrl: s("ticket_url"),
    invoiceUrl: s("invoice_url"),
    visaUrl: s("visa_url"),
    passportUrl: s("passport_url"),
    voucherUrl: s("voucher_url"),
    businessCardUrl: s("business_card_url"),
    ticketDriveId: s("ticket_drive_id"),
    invoiceDriveId: s("invoice_drive_id"),
    visaDriveId: s("visa_drive_id"),
    passportDriveId: s("passport_drive_id"),
    voucherDriveId: s("voucher_drive_id"),
    businessCardDriveId: s("business_card_drive_id"),
  };
}

async function triggerTravelGasBackup(
  data: Record<string, unknown>,
  settings: typeof appSettings.$inferSelect | undefined
) {
  const gasUrl = settings?.gasWebAppUrl || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
  if (!gasUrl) return;

  const payload = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [toSnake(k), v])
  );

  await backupTravelRecordToSheet(payload, {
    sheetId: settings?.registrationSheetId ?? undefined,
    sheetName: settings?.travelSheetName ?? undefined,
  });

  if (settings?.registrationSheetId) {
    await exportSheetToExcel(settings.registrationSheetId, {
      fileName: "DelegateConnect_TravelDesk",
      folderId: settings?.driveFolderId ?? undefined,
    });
  }
}

function toSnake(str: string): string {
  return str.replace(/([A-Z]|\d+)/g, (m) => "_" + m.toLowerCase());
}
