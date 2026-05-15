import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings, registrations } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── POST /api/upload ─────────────────────────────────────────────────────────
// Accepts: multipart/form-data with fields:
//   file       - the binary file
//   srNo       - delegate Sr No to update
//   docType    - "passport_front" | "passport_back" | "proof" | "business_card"
//   rowIndex   - (optional) 1-based sheet row index for writing URL back to sheet
//
// Flow:
//   1. Receive file from browser
//   2. Forward to GAS as base64 → GAS uploads to Google Drive → returns Drive URL
//   3. GAS writes URL back to the sheet cell
//   4. Next.js saves URL to Neon DB for the matching srNo
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_COLUMNS: Record<string, { dbField: string; sheetColumn: string }> = {
  passport_front: { dbField: "drivePassportFrontUrl", sheetColumn: "Passport Front Copy" },
  passport_back:  { dbField: "drivePassportBackUrl",  sheetColumn: "Passport Back Copy" },
  proof:          { dbField: "driveProofUrl",          sheetColumn: "Upload one proof of your Import (Please enter valid document Eg: - Bill of Lading)" },
  business_card:  { dbField: "driveBusinessCardUrl",   sheetColumn: "Please upload your Business Card" },
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load GAS settings
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!settings?.gasWebAppUrl) {
    return NextResponse.json({ error: "GAS Web App URL not configured" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file     = formData.get("file") as File | null;
  const srNoRaw  = formData.get("srNo") as string | null;
  const docType  = (formData.get("docType") as string | null) ?? "proof";
  const rowIndex = formData.get("rowIndex") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!srNoRaw) return NextResponse.json({ error: "srNo required" }, { status: 400 });

  const srNo = parseInt(srNoRaw);
  if (isNaN(srNo)) return NextResponse.json({ error: "Invalid srNo" }, { status: 400 });

  const colConfig = DOC_TYPE_COLUMNS[docType];
  if (!colConfig) return NextResponse.json({ error: `Unknown docType: ${docType}` }, { status: 400 });

  try {
    // ── 1. Convert file to base64 ─────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // ── 2. Send to GAS for Drive upload ───────────────────────────────────────
    const gasPayload = {
      action:      "uploadFile",
      fileName:    file.name,
      mimeType:    file.type || "application/octet-stream",
      base64Data:  base64,
      folderId:    settings.driveFolderId ?? "",
      // Write URL back to sheet
      sheetId:     settings.registrationSheetId ?? "",
      sheetName:   settings.registrationSheetName ?? "Form Responses 1",
      sheetColumn: colConfig.sheetColumn,
      rowIndex:    rowIndex ? parseInt(rowIndex) : null,
      srNo,
    };

    const gasRes = await fetch(settings.gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gasPayload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!gasRes.ok) {
      throw new Error(`GAS upload failed: ${gasRes.status} ${await gasRes.text()}`);
    }

    const gasData = await gasRes.json() as { ok: boolean; url?: string; fileId?: string; error?: string };
    if (!gasData.ok) throw new Error(gasData.error ?? "GAS returned ok:false");

    const driveUrl = gasData.url ?? "";

    // ── 3. Save Drive URL to Neon ─────────────────────────────────────────────
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    // Map docType to Drizzle column
    if (docType === "passport_front") updateValues.drivePassportFrontUrl = driveUrl;
    else if (docType === "passport_back") updateValues.drivePassportBackUrl = driveUrl;
    else if (docType === "proof") updateValues.driveProofUrl = driveUrl;
    else if (docType === "business_card") updateValues.driveBusinessCardUrl = driveUrl;

    await db.update(registrations)
      .set(updateValues as Partial<typeof registrations.$inferInsert>)
      .where(eq(registrations.srNo, srNo));

    console.log(`[POST /api/upload] srNo=${srNo} docType=${docType} url=${driveUrl}`);
    return NextResponse.json({ ok: true, url: driveUrl, fileId: gasData.fileId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[POST /api/upload]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
