import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings, auditLog } from "@/db/schema";
import { asc, sql, eq } from "drizzle-orm";
import {
  backupTravelRecordToSheet,
  backupToTravelSheet2,
  deleteSheetRecord,
  deleteDriveFolder,
} from "@/lib/gas-client";
import type { Session } from "next-auth";

// ─── Permission Helpers ────────────────────────────────────────────────────────
function isAllowedToEdit(session: Session | null): boolean {
  if (!session) return false;
  const role = (session.user as { role?: string }).role ?? "staff";
  return role === "admin" || role === "supervisor";
}

function getUserId(session: Session): number {
  const id = (session.user as { id?: string }).id;
  if (id === "admin") return 1;
  const parsed = parseInt(id ?? "0");
  return isNaN(parsed) ? 1 : parsed;
}

// ─── Camel → Snake Converter ──────────────────────────────────────────────────
// Converts Drizzle ORM camelCase keys → snake_case for GAS script
function toSnake(key: string): string {
  return key
    .replace(/([A-Z])/g, (m) => "_" + m.toLowerCase())
    .replace(/^_/, "");
}

function drizzleToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toSnake(k), v])
  );
}

// ─── GET /api/travel ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit  = parseInt(url.searchParams.get("limit")  ?? "5000");
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

    // Drizzle returns camelCase — frontend expects snake_case
    return NextResponse.json({
      rows: rows.map(drizzleToSnake),
      total: Number(count),
    });
  } catch (err) {
    console.error("[GET /api/travel]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── POST /api/travel ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowedToEdit(session))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { record, records } = body as {
      record?:  Record<string, unknown>;
      records?: Record<string, unknown>[];
    };

    // Load settings ONCE
    const [settings] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);

    if (record) {
      const [inserted] = await db
        .insert(travelRecords)
        .values(mapTravelRecord(record))
        .returning();

      // Fire & forget GAS backup — do not await so the API responds fast
      syncToSheet(inserted, settings).catch(console.error);

      await db.insert(auditLog).values({
        userId:     getUserId(session),
        action:     "create_travel_record",
        entityType: "travel_record",
        entityId:   inserted.id,
      });

      return NextResponse.json({ ok: true, record: drizzleToSnake(inserted) });
    }

    if (records && records.length > 0) {
      const mapped   = records.map(mapTravelRecord);
      const inserted = await db.insert(travelRecords).values(mapped).returning();

      inserted.forEach((r) => syncToSheet(r, settings).catch(console.error));

      await db.insert(auditLog).values({
        userId:     getUserId(session),
        action:     "bulk_import_travel_records",
        entityType: "travel_record",
        metadata:   { count: inserted.length },
      });

      return NextResponse.json({ ok: true, inserted: inserted.length });
    }

    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[POST /api/travel]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/travel ──────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowedToEdit(session))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { id, record } = body as { id: number; record: Record<string, unknown> };

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [updated] = await db
      .update(travelRecords)
      .set({ ...mapTravelRecord(record), updatedAt: new Date() })
      .where(eq(travelRecords.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    // Load settings and sync
    const [settings] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);

    syncToSheet(updated, settings).catch(console.error);

    await db.insert(auditLog).values({
      userId:     getUserId(session),
      action:     "update_travel_record",
      entityType: "travel_record",
      entityId:   id,
    });

    return NextResponse.json({ ok: true, record: drizzleToSnake(updated) });
  } catch (err: unknown) {
    console.error("[PUT /api/travel]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/travel ───────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin")
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const [existing] = await db
      .select()
      .from(travelRecords)
      .where(eq(travelRecords.id, id))
      .limit(1);

    // Load settings for GAS calls
    const [settings] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);

    const gasUrl  = settings?.gasWebAppUrl  || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || undefined;
    const sheetId = settings?.registrationSheetId || undefined;

    if (existing) {
      const srNo = existing.responsesSrNo ?? "";
      const folderName = `${srNo} ${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim() || "Delegates";

      // 1. Trash the Google Drive delegate folder
      if (gasUrl) {
        deleteDriveFolder(folderName, {
          folderId: settings?.driveFolderId ?? undefined,
          gasUrl,
        }).catch(console.error);
      }

      // 2. Remove the row from the Google Sheet
      if (gasUrl && sheetId && srNo) {
        deleteSheetRecord(srNo, {
          sheetId,
          sheetName: settings?.travelSheetName || "Travel Desk Records",
          gasUrl,
        }).catch(console.error);
      }
    }

    // 3. Delete from database
    await db.delete(travelRecords).where(eq(travelRecords.id, id));

    await db.insert(auditLog).values({
      userId:     getUserId(session),
      action:     "delete_travel_record",
      entityType: "travel_record",
      entityId:   id,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/travel]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── GAS Sync Helper ──────────────────────────────────────────────────────────
// Called after every create/update. Converts Drizzle camelCase → snake_case
// and pushes the full record to Google Sheets via Apps Script.
async function syncToSheet(
  record: typeof travelRecords.$inferSelect,
  settings: typeof appSettings.$inferSelect | undefined
) {
  const gasUrl  = settings?.gasWebAppUrl  || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
  const sheetId = settings?.registrationSheetId ?? undefined;

  if (!gasUrl) {
    console.warn("[syncToSheet] Skipped — no GAS URL set. Configure NEXT_PUBLIC_GAS_WEB_APP_URL or Admin Settings.");
    return;
  }

  // Convert the full Drizzle record to snake_case for GAS
  const payload = drizzleToSnake(record as unknown as Record<string, unknown>);

  console.log("[syncToSheet] Sending to GAS →", {
    gasUrl:  gasUrl ? "✓" : "✗",
    sheetId: sheetId ?? "✗ not set",
    srNo:    payload.responses_sr_no,
    hotel:   payload.hotel_name,
    room:    payload.room_no,
  });

  const res = await backupTravelRecordToSheet(payload, {
    sheetId,
    sheetName: settings?.travelSheetName || "Travel Desk Records",
    gasUrl,
  });

  if (!res.ok) {
    console.error("[syncToSheet] GAS returned error:", res.error);
  } else {
    console.log("[syncToSheet] ✅ Sheet 1 updated. Fields written:", (res as Record<string, unknown>).updatedFields);
  }

  // Also sync to Sheet 2 (formatted print view)
  const res2 = await backupToTravelSheet2(payload, {
    sheetId,
    sheetName: "Travel Desk Sheet 2",
    gasUrl,
  });

  if (!res2.ok) {
    console.error("[syncToSheet] Sheet 2 error:", (res2 as Record<string, unknown>).error);
  } else {
    console.log("[syncToSheet] ✅ Sheet 2 updated.");
  }
}

// ─── Field Mapper (snake_case body → Drizzle camelCase schema) ────────────────
function mapTravelRecord(r: Record<string, unknown>) {
  const s = (k: string): string | null => {
    const v = r[k];
    if (v == null || v === "") return null;
    return String(v);
  };

  return {
    registrationId:      r.registration_id ? parseInt(String(r.registration_id)) : null,
    responsesSrNo:       s("responses_sr_no"),
    initial:             s("initial"),
    firstName:           s("first_name"),
    lastName:            s("last_name"),
    countryName:         s("country_name"),
    countryCode:         s("country_code"),
    participantMobile:   s("participant_mobile"),
    companyName:         s("company_name"),
    sector:              s("sector"),
    poc:                 s("poc"),
    hotelName:           s("hotel_name"),
    roomNo:              s("room_no"),
    checkInDate:         s("check_in_date"),
    checkOutDate:        s("check_out_date"),
    roomUnits:           s("room_units"),
    arrivalDate:         s("arrival_date"),
    arrivalFlightNo:     s("arrival_flight_no"),
    arrivalTo:           s("arrival_to"),
    arrivalTime:         s("arrival_time"),
    departureDate:       s("departure_date"),
    departureFlightNo:   s("departure_flight_no"),
    departureFrom:       s("departure_from"),
    departureTime:       s("departure_time"),
    status:              s("status")              ?? "Pending",
    reimbursement:       s("reimbursement")       ?? "No",
    reimbursementAmount: s("reimbursement_amount"),
    invoiceAmount:       s("invoice_amount"),
    invoiceAmountUsd:    s("invoice_amount_usd"),
    invoiceAmountLocal:  s("invoice_amount_local"),
    invoiceCurrency:     s("invoice_currency"),
    notes:               s("notes"),
    ticketReceived:      s("ticket_received")       ?? "No",
    invoiceReceived:     s("invoice_received")      ?? "No",
    visaReceived:        s("visa_received")         ?? "No",
    passportCopyReceived:s("passport_copy_received") ?? "No",
    voucherReceived:     s("voucher_received")      ?? "No",
    bl:                  s("bl"),
    blUrl:               s("bl_url"),
    ticketUrl:           s("ticket_url"),
    invoiceUrl:          s("invoice_url"),
    visaUrl:             s("visa_url"),
    passportUrl:         s("passport_url"),
    voucherUrl:          s("voucher_url"),
    businessCardUrl:     s("business_card_url"),
    ticketDriveId:       s("ticket_drive_id"),
    invoiceDriveId:      s("invoice_drive_id"),
    visaDriveId:         s("visa_drive_id"),
    passportDriveId:     s("passport_drive_id"),
    voucherDriveId:      s("voucher_drive_id"),
    businessCardDriveId: s("business_card_drive_id"),
    blDriveId:           s("bl_drive_id"),
  };
}
