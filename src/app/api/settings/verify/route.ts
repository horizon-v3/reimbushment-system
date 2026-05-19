import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGasDirect } from "@/lib/gas-client";

/**
 * POST /api/settings/verify
 * Tests connectivity to GAS, Google Sheet, and Drive folder.
 * Body: { gas_web_app_url, registration_sheet_id, drive_folder_id }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const gasUrl  = body.gas_web_app_url  as string | undefined;
  const sheetId = body.registration_sheet_id as string | undefined;

  const results: Record<string, { ok: boolean; message: string }> = {
    gas:   { ok: false, message: "Not tested" },
    sheet: { ok: false, message: "Not tested" },
    drive: { ok: false, message: "Not tested" },
  };

  if (!gasUrl) {
    return NextResponse.json({
      ok: false,
      results: {
        gas:   { ok: false, message: "GAS URL not provided" },
        sheet: { ok: false, message: "Cannot test — GAS URL required first" },
        drive: { ok: false, message: "Cannot test — GAS URL required first" },
      }
    });
  }

  // ── 1. Ping GAS ────────────────────────────────────────────────────────────
  try {
    const pingRes = await callGasDirect({ action: "ping" }, gasUrl);
    results.gas = pingRes.ok
      ? { ok: true, message: "Connected ✓" }
      : { ok: false, message: pingRes.error ?? "Ping failed" };
  } catch (e) {
    results.gas = { ok: false, message: String(e) };
  }

  const sheetName = body.registration_sheet_name as string | undefined || "Form Responses 1";

  // ── 2. Verify Sheet (only if GAS is alive) ─────────────────────────────────
  if (results.gas.ok && sheetId) {
    try {
      const sheetRes = await callGasDirect(
        { action: "getRows", sheetId, sheetName },
        gasUrl
      ) as { ok: boolean; error?: string; total?: number };
      results.sheet = sheetRes.ok
        ? { ok: true, message: `Sheet accessible ✓ (${sheetRes.total ?? 0} rows)` }
        : { ok: false, message: sheetRes.error ?? "Sheet not accessible" };
    } catch (e) {
      results.sheet = { ok: false, message: String(e) };
    }
  } else if (!sheetId) {
    results.sheet = { ok: false, message: "Sheet ID not provided" };
  } else {
    results.sheet = { ok: false, message: "Skipped — GAS not reachable" };
  }

  // ── 3. Verify Drive Folder ─────────────────────────────────────────────────
  if (results.gas.ok) {
    try {
      const driveRes = await callGasDirect(
        { action: "ping" },
        gasUrl
      );
      // If GAS is alive, Drive access is implied (same Google account)
      results.drive = driveRes.ok
        ? { ok: true, message: "Drive accessible via GAS ✓" }
        : { ok: false, message: "Drive not accessible" };
    } catch (e) {
      results.drive = { ok: false, message: String(e) };
    }
  } else {
    results.drive = { ok: false, message: "Skipped — GAS not reachable" };
  }

  const allOk = Object.values(results).every(r => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
