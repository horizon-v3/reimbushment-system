import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { callGasDirect } from "@/lib/gas-client";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/travel/sync-sheet2
 * Pushes ALL travel records to Sheet 2 in a single batch call — orders of magnitude
 * faster than the previous one-record-at-a-time approach.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role     = (session.user as { role?: string }).role ?? "staff";
  const userId   = parseInt((session.user as { id?: string }).id ?? "0");
  const userName = session.user?.name ?? session.user?.email ?? "unknown";
  const ip       =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ?? "unknown";

  if (role !== "admin") {
    await writeAuditLog({ userId, userName, userRole: role,
      action: "sync_sheet2_blocked", status: "blocked", ipAddress: ip,
      metadata: { reason: "Admin only" } });
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const gasUrl  = settings?.gasWebAppUrl  || process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
  const sheetId = settings?.registrationSheetId ?? undefined;

  if (!gasUrl)  return NextResponse.json({ ok: false, error: "GAS URL not configured in Settings" }, { status: 400 });
  if (!sheetId) return NextResponse.json({ ok: false, error: "Sheet ID not configured in Settings" }, { status: 400 });

  // ── Step 1: Ensure Sheet 2 exists (headers) ───────────────────────────────
  const createRes = await callGasDirect(
    { action: "createTravelSheet", sheetId, sheetName: "Travel Desk Sheet 2" },
    gasUrl
  ) as { ok: boolean; error?: string };

  if (!createRes.ok) {
    return NextResponse.json({
      ok: false,
      error: "Failed to create Sheet 2: " + (createRes.error ?? "unknown error")
    }, { status: 500 });
  }

  // ── Step 2: Fetch all travel records ─────────────────────────────────────
  const records = await db.select().from(travelRecords).orderBy(asc(travelRecords.createdAt));

  if (records.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No records to sync" });
  }

  // ── Step 3: Convert camelCase → snake_case ────────────────────────────────
  function toSnake(key: string): string {
    return key.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase()).replace(/^_/, "");
  }
  function drizzleToSnake(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));
  }

  const payloads = records.map(r => drizzleToSnake(r as unknown as Record<string, unknown>));

  // ── Step 4: BATCH push — single GAS call for all records ──────────────────
  // Try batch first; if GAS doesn't support batchBackupTravelSheet2, fall back
  // to concurrent chunks of 20 (much faster than sequential one-by-one).
  let synced = 0;
  const errors: string[] = [];

  const CHUNK = 20;
  const chunks: (typeof payloads)[] = [];
  for (let i = 0; i < payloads.length; i += CHUNK) chunks.push(payloads.slice(i, i + CHUNK));

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await callGasDirect(
          {
            action:        "batchBackupTravelSheet2",
            travelRecords: chunk,
            sheetId,
            sheetName:     "Travel Desk Sheet 2",
          },
          gasUrl!
        ) as { ok: boolean; synced?: number; error?: string };

        if (res.ok) {
          synced += res.synced ?? chunk.length;
        } else {
          // Fall back: push individually within this chunk
          for (const payload of chunk) {
            try {
              const r2 = await callGasDirect(
                { action: "backupToTravelSheet2", travelRecord: payload, sheetId, sheetName: "Travel Desk Sheet 2" },
                gasUrl!
              ) as { ok: boolean; error?: string };
              if (r2.ok) synced++;
              else errors.push(`Sr ${payload.responses_sr_no}: ${r2.error}`);
            } catch (e) {
              errors.push(`Sr ${payload.responses_sr_no}: ${String(e)}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Chunk error: ${String(e)}`);
      }
    })
  );

  await writeAuditLog({
    userId, userName, userRole: "admin",
    action: "sync_sheet2", entityType: "travel_records",
    status: errors.length === 0 ? "success" : "failed",
    ipAddress: ip,
    metadata: { synced, total: records.length, errors: errors.slice(0, 5) },
  });

  return NextResponse.json({
    ok:      errors.length === 0,
    synced,
    total:   records.length,
    errors:  errors.length > 0 ? errors.slice(0, 10) : undefined,
    message: `Synced ${synced}/${records.length} records to Sheet 2`,
  });
}
