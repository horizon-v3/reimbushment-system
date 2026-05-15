import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelRecords, appSettings, registrations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/travel/fetch-passport
 * Body: { travelId: number }
 *
 * Fetches the passport URL for the delegate linked to the given travel record:
 *  1. Looks up travel_record → registration → drive_passport_front_url
 *  2. If drive URL exists in the DB, returns it immediately.
 *  3. Otherwise, calls GAS to read the passport URL from the Google Sheet
 *     (action: getPassportUrl), saves it back to the travel record, and returns it.
 *
 * Requires: authenticated session (any role can fetch passport URLs for existing records).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { travelId } = body as { travelId: number };

    if (!travelId) return NextResponse.json({ error: "travelId required" }, { status: 400 });

    // Fetch the travel record
    const [travel] = await db
      .select()
      .from(travelRecords)
      .where(eq(travelRecords.id, travelId))
      .limit(1);

    if (!travel) return NextResponse.json({ error: "Travel record not found" }, { status: 404 });

    // If passport URL already stored, return it
    if (travel.passportUrl) {
      return NextResponse.json({ ok: true, passportUrl: travel.passportUrl, source: "db" });
    }

    // Try to get from registration's drive_passport_front_url
    let passportUrl: string | null = null;
    if (travel.registrationId) {
      const [reg] = await db
        .select({ drivePassportFrontUrl: registrations.drivePassportFrontUrl })
        .from(registrations)
        .where(eq(registrations.id, travel.registrationId))
        .limit(1);

      if (reg?.drivePassportFrontUrl) {
        passportUrl = reg.drivePassportFrontUrl;
      }
    }

    // If still not found, try GAS
    if (!passportUrl) {
      const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);

      if (settings?.gasWebAppUrl) {
        try {
          const gasRes = await fetch(settings.gasWebAppUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "getPassportUrl",
              srNo: travel.responsesSrNo,
              sheetId: settings.registrationSheetId,
              sheetName: settings.registrationSheetName ?? "Form Responses 1",
            }),
          });
          const gasData = await gasRes.json();
          if (gasData.ok && gasData.passportUrl) {
            passportUrl = gasData.passportUrl;
          }
        } catch (gasErr) {
          console.error("[fetch-passport] GAS call failed:", gasErr);
          // Non-fatal — we'll return null if GAS is not configured
        }
      }
    }

    if (!passportUrl) {
      return NextResponse.json({
        ok: false,
        error: "No passport URL found in DB or GAS sheet. Upload passport via Travel Desk first.",
      }, { status: 404 });
    }

    // Save back to travel record
    await db
      .update(travelRecords)
      .set({ passportUrl, updatedAt: new Date() })
      .where(eq(travelRecords.id, travelId));

    return NextResponse.json({ ok: true, passportUrl, source: "gas" });
  } catch (err: unknown) {
    console.error("[POST /api/travel/fetch-passport]", err);
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
