import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGasDirect } from "@/lib/gas-client";

/**
 * POST /api/settings/create-sheet
 * Creates (or resets) the Travel Desk Sheet 2 in the target spreadsheet.
 * Body: { gas_web_app_url, registration_sheet_id, sheet_name? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const gasUrl   = body.gas_web_app_url    as string | undefined;
    const sheetId  = body.registration_sheet_id as string | undefined;
    const sheetName = body.sheet_name as string | undefined ?? "Travel Desk Sheet 2";

    if (!gasUrl)  return NextResponse.json({ ok: false, error: "gas_web_app_url is required" }, { status: 400 });
    if (!sheetId) return NextResponse.json({ ok: false, error: "registration_sheet_id is required" }, { status: 400 });

    const result = await callGasDirect(
      { action: "createTravelSheet", sheetId, sheetName },
      gasUrl
    ) as { ok: boolean; message?: string; error?: string; sheetName?: string };

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "GAS returned an error" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: result.message ?? `Sheet "${sheetName}" created successfully`,
      sheetName: result.sheetName ?? sheetName,
    });
  } catch (err: unknown) {
    console.error("[POST /api/settings/create-sheet]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
