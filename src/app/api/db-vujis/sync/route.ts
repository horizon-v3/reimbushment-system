import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { dbVujisRecords, appSettings, auditLog } from "@/db/schema";
import { inArray } from "drizzle-orm";

const HEADER_MAP: Record<string, string> = {
  sr_no: "srNo",
  company_name: "companyName",
  country_name: "countryName",
  region: "region",
  proof_of_import_as_per_reg_form_y: "proofOfImportY",
  proof_of_import_as_per_reg_form_n: "proofOfImportN",
  vujis: "vujis",
  import_value_in_usd: "importValueVujis",
  dollar_business: "dollarBusiness",
  import_value_in_usd_1: "importValueDollar",
  both: "bothDbVujis",
  importing_from_india: "importingFromIndia",
  importing_from_other_country: "importingFromOtherCountry",
  your_main_import_product_1: "mainImportProduct1",
  main_import_product_1: "mainImportProduct1",
  your_main_import_product_2: "mainImportProduct2",
  main_import_product_2: "mainImportProduct2",
  poc: "poc",
  reason: "reason",
  comment: "comment"
};

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role ?? "staff";
  if (role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const [settings] = await db.select().from(appSettings).limit(1);
    if (!settings?.gasWebAppUrl) return NextResponse.json({ error: "GAS Web App URL not configured" }, { status: 400 });
    if (!settings?.registrationSheetId) return NextResponse.json({ error: "Sheet ID not configured" }, { status: 400 });

    const gasUrl = new URL(settings.gasWebAppUrl);
    gasUrl.searchParams.set("action", "getRows");
    gasUrl.searchParams.set("sheetId", settings.registrationSheetId);
    gasUrl.searchParams.set("sheetName", settings.dbVujisSheetName || "DB & vujis");

    const gasRes = await fetch(gasUrl.toString(), {
      redirect: "follow",
      headers: { "Cache-Control": "no-cache" }
    });

    const data = await gasRes.json();
    if (!data.ok) throw new Error(data.error ?? "Unknown GAS error");

    const rawRows = data.rows as Record<string, unknown>[];
    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "No data found in sheet" });
    }

    const mappedRecords = [];
    for (const r of rawRows) {
      const mapped: Record<string, any> = {};
      for (const [rawKey, value] of Object.entries(r)) {
        const norm = normalizeHeader(rawKey);
        const mappedKey = HEADER_MAP[norm];
        if (mappedKey) {
          mapped[mappedKey] = value != null && String(value).trim() !== "" ? String(value).trim() : null;
        }
      }
      
      const srNo = Number(mapped.srNo);
      if (!isNaN(srNo) && srNo > 0) {
        mapped.srNo = srNo;
        mappedRecords.push(mapped);
      }
    }

    let totalUpserted = 0;
    const BATCH = 100;
    for (let i = 0; i < mappedRecords.length; i += BATCH) {
      const batch = mappedRecords.slice(i, i + BATCH);
      const srNos = batch.map(b => b.srNo);
      if (srNos.length > 0) {
        await db.delete(dbVujisRecords).where(inArray(dbVujisRecords.srNo, srNos));
        await db.insert(dbVujisRecords).values(batch);
        totalUpserted += batch.length;
      }
    }

    await db.insert(auditLog).values({
      userId: session.user?.id === "admin" ? 1 : parseInt(session.user?.id || "0"),
      action: "sync_db_vujis",
      entityType: "db_vujis",
      metadata: { count: totalUpserted },
    });

    return NextResponse.json({ ok: true, synced: totalUpserted });
  } catch (err: unknown) {
    console.error("[POST /api/db-vujis/sync]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
