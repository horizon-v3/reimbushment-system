import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── GET /api/settings ────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    return NextResponse.json({ settings: settings ?? null });
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// ─── POST /api/settings ───────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    const [upserted] = await db
      .insert(appSettings)
      .values({
        id: 1,
        registrationSheetId: body.registration_sheet_id ?? null,
        registrationSheetName: body.registration_sheet_name ?? "Form Responses 1",
        travelSheetName: body.travel_sheet_name ?? "Travel Desk Records",
        driveFolderId: body.drive_folder_id ?? null,
        gasWebAppUrl: body.gas_web_app_url ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          registrationSheetId: body.registration_sheet_id ?? null,
          registrationSheetName: body.registration_sheet_name ?? "Form Responses 1",
          travelSheetName: body.travel_sheet_name ?? "Travel Desk Records",
          driveFolderId: body.drive_folder_id ?? null,
          gasWebAppUrl: body.gas_web_app_url ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({ ok: true, settings: upserted });
  } catch (err: unknown) {
    console.error("[POST /api/settings]", err);
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
