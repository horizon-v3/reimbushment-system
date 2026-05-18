import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { callGasDirect } from "@/lib/gas-client";

/**
 * POST /api/travel/sync-sheet2
 * Fetches ALL travel records from DB and pushes each one to Sheet 2.
 * Also auto-creates Sheet 2 headers if the sheet doesn't exist.
 * Used from the Settings page "Sync All → Sheet 2" button.
 */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const [settings] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);

  const gasUrl  = settings?.gasWebAppUrl  || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
  const sheetId = settings?.registrationSheetId ?? undefined;

  if (!gasUrl)  return NextResponse.json({ ok: false, error: "GAS URL not configured in Settings" }, { status: 400 });
  if (!sheetId) return NextResponse.json({ ok: false, error: "Sheet ID not configured in Settings" }, { status: 400 });

  // Step 1: Ensure Sheet 2 exists with correct headers
  const createRes = await callGasDirect(
    { action: "createTravelSheet", sheetId, sheetName: "Travel Desk Sheet 2" },
    gasUrl
  ) as { ok: boolean; error?: string; message?: string };

  if (!createRes.ok) {
    return NextResponse.json({
      ok: false,
      error: "Failed to create Sheet 2: " + (createRes.error ?? "unknown error")
    }, { status: 500 });
  }

  // Step 2: Fetch all travel records
  const records = await db
    .select()
    .from(travelRecords)
    .orderBy(asc(travelRecords.createdAt));

  if (records.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No records to sync" });
  }

  // Step 3: Convert camelCase → snake_case
  function toSnake(key: string): string {
    return key.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase()).replace(/^_/, "");
  }

  function drizzleToSnake(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toSnake(k), v])
    );
  }

  // Step 4: Push each record to Sheet 2
  let synced = 0;
  const errors: string[] = [];

  for (const record of records) {
    const payload = drizzleToSnake(record as unknown as Record<string, unknown>);

    const res = await callGasDirect(
      {
        action:       "backupToTravelSheet2",
        travelRecord: payload,
        sheetId,
        sheetName:    "Travel Desk Sheet 2",
      },
      gasUrl
    ) as { ok: boolean; error?: string };

    if (res.ok) {
      synced++;
    } else {
      errors.push(`Sr ${payload.responses_sr_no}: ${res.error}`);
    }
  }

  return NextResponse.json({
    ok:     errors.length === 0,
    synced,
    total:  records.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    message: `Synced ${synced}/${records.length} records to Sheet 2`,
  });
}
