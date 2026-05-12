import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings, auditLog } from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import { backupTravelRecordToSheet, exportSheetToExcel } from "@/lib/gas-client";
import { eq } from "drizzle-orm";

// ─── GET /api/travel ───────────────────────────────────────────────────────────
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

    return NextResponse.json({ rows, total: Number(count) });
  } catch (err) {
    console.error("[GET /api/travel]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── POST /api/travel ──────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        userId: parseInt(session.user?.id ?? "0"),
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
        userId: parseInt(session.user?.id ?? "0"),
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

// ─── PUT /api/travel ───────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      userId: parseInt(session.user?.id ?? "0"),
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

// ─── DELETE /api/travel ────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await db.delete(travelRecords).where(eq(travelRecords.id, id));

    await db.insert(auditLog).values({
      userId: parseInt(session.user?.id ?? "0"),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapTravelRecord(r: Record<string, unknown>) {
  return {
    registrationId: r.registration_id ? parseInt(String(r.registration_id)) : null,
    responsesSrNo: r.responses_sr_no as string | null,
    roomNo: r.room_no as string | null,
    hotelName: r.hotel_name as string | null,
    initial: r.initial as string | null,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    countryName: r.country_name as string | null,
    countryCode: r.country_code as string | null,
    participantMobile: r.participant_mobile as string | null,
    checkInDate: (r.check_in_date as string | null) || null,
    checkOutDate: (r.check_out_date as string | null) || null,
    roomUnits: r.room_units as string | null,
    arrivalDate: (r.arrival_date as string | null) || null,
    arrivalFlightNo: r.arrival_flight_no as string | null,
    arrivalTo: r.arrival_to as string | null,
    arrivalTime: (r.arrival_time as string | null) || null,
    departureDate: (r.departure_date as string | null) || null,
    departureFlightNo: r.departure_flight_no as string | null,
    departureFrom: r.departure_from as string | null,
    departureTime: (r.departure_time as string | null) || null,
    sector: r.sector as string | null,
    companyName: r.company_name as string | null,
    poc: r.poc as string | null,
    status: (r.status as string | null) ?? "Pending",
    reimbursement: (r.reimbursement as string | null) ?? "No",
    notes: r.notes as string | null,
    invoiceAmount: r.invoice_amount as string | null,
    invoiceAmountUsd: r.invoice_amount_usd as string | null,
    ticketReceived: (r.ticket_received as string | null) ?? "No",
    invoiceReceived: (r.invoice_received as string | null) ?? "No",
    visaReceived: (r.visa_received as string | null) ?? "No",
    passportCopyReceived: (r.passport_copy_received as string | null) ?? "No",
    voucherReceived: (r.voucher_received as string | null) ?? "No",
    ticketUrl: r.ticket_url as string | null,
    invoiceUrl: r.invoice_url as string | null,
    visaUrl: r.visa_url as string | null,
    passportUrl: r.passport_url as string | null,
    voucherUrl: r.voucher_url as string | null,
    ticketDriveId: r.ticket_drive_id as string | null,
    invoiceDriveId: r.invoice_drive_id as string | null,
    visaDriveId: r.visa_drive_id as string | null,
    passportDriveId: r.passport_drive_id as string | null,
    voucherDriveId: r.voucher_drive_id as string | null,
  };
}

async function triggerTravelGasBackup(
  data: Record<string, unknown>,
  settings: typeof appSettings.$inferSelect | undefined
) {
  if (!settings?.gasWebAppUrl) return;

  const payload = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [toSnake(k), v])
  );

  await backupTravelRecordToSheet(payload, {
    sheetId: settings.registrationSheetId ?? undefined,
    sheetName: settings.travelSheetName ?? undefined,
  });

  if (settings.registrationSheetId) {
    await exportSheetToExcel(settings.registrationSheetId, {
      fileName: "DelegateConnect_TravelDesk",
      folderId: settings.driveFolderId ?? undefined,
    });
  }
}

function toSnake(str: string): string {
  return str.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());
}
