import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { callGasDirect } from "@/lib/gas-client";

// ─── POST /api/backup ─────────────────────────────────────────────────────────
// Triggers a full backup of registrations to both backup sheets configured in settings.
// Admin-only. Runs in background — returns immediately with progress token.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const { type = "registration", sr_no } = body as { type?: string; sr_no?: string | number };

    // Load settings
    const result = await db.execute(sql`
      SELECT
        gas_web_app_url,
        registration_sheet_id,
        registration_sheet_name,
        travel_sheet_name,
        backup_gas_web_app_url,
        backup_sheet_id,
        backup_folder_id,
        backup_sheet_id_2,
        backup_folder_id_2
      FROM app_settings WHERE id = 1 LIMIT 1
    `);
    const settings = Array.from(result)[0] as Record<string, string | null> | undefined;

    if (!settings) {
      return NextResponse.json({ error: "Settings not configured" }, { status: 400 });
    }

    const gasUrl       = settings.gas_web_app_url ?? "";
    const sheetId      = settings.registration_sheet_id ?? "";
    const sheetName    = settings.registration_sheet_name ?? "Form Responses 1";
    const backupGasUrl = settings.backup_gas_web_app_url ?? "";
    const backupSheet1 = settings.backup_sheet_id ?? "";
    const backupSheet2 = settings.backup_sheet_id_2 ?? "";
    const backupFolder1 = settings.backup_folder_id ?? "";
    const backupFolder2 = settings.backup_folder_id_2 ?? "";

    if (!gasUrl || !sheetId) {
      return NextResponse.json({ error: "Primary GAS URL or Sheet ID not configured" }, { status: 400 });
    }

    // ── Fetch registration records from DB ─────────────────────────────────
    let rows: Record<string, unknown>[];
    if (type === "registration") {
      const query = sr_no
        ? sql`SELECT * FROM registrations WHERE sr_no = ${sr_no} LIMIT 1`
        : sql`SELECT * FROM registrations ORDER BY sr_no ASC LIMIT 5000`;
      rows = Array.from(await db.execute(query)) as Record<string, unknown>[];
    } else {
      const query = sr_no
        ? sql`SELECT * FROM travel_records WHERE responses_sr_no = ${String(sr_no)} LIMIT 1`
        : sql`SELECT * FROM travel_records ORDER BY id ASC LIMIT 5000`;
      rows = Array.from(await db.execute(query)) as Record<string, unknown>[];
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, backed_up: 0, message: "No records to backup" });
    }

    // ── Fire backup calls (non-blocking for secondary destinations) ─────────
    let backed_up = 0;
    const errors: string[] = [];
    const action = type === "registration" ? "backupRegistration" : "backupTravelRecord";
    const recordKey = type === "registration" ? "registration" : "travelRecord";

    for (const row of rows) {
      // Primary GAS (fire-and-forget to not block)
      callGasDirect(
        { action, [recordKey]: row, sheetId, sheetName },
        gasUrl
      ).catch(e => console.error("[BACKUP] primary failed for row:", e));

      // Backup GAS Sheet 1
      if (backupGasUrl && backupSheet1) {
        callGasDirect(
          { action, [recordKey]: { ...row, folderId: backupFolder1 }, sheetId: backupSheet1, sheetName },
          backupGasUrl
        ).catch(e => errors.push(`Backup-1: ${String(e).slice(0, 100)}`));
      }

      // Backup GAS Sheet 2
      if (backupGasUrl && backupSheet2) {
        callGasDirect(
          { action, [recordKey]: { ...row, folderId: backupFolder2 }, sheetId: backupSheet2, sheetName },
          backupGasUrl
        ).catch(e => errors.push(`Backup-2: ${String(e).slice(0, 100)}`));
      }

      backed_up++;
    }

    return NextResponse.json({
      ok: true,
      backed_up,
      type,
      errors: errors.slice(0, 10),
      message: `Backup triggered for ${backed_up} ${type} records`,
    });
  } catch (err: unknown) {
    console.error("[POST /api/backup]", err);
    const msg = err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
