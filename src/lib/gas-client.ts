/**
 * ============================================================================
 * ENTERPRISE GOOGLE APPS SCRIPT CLIENT
 * ============================================================================
 * This module is the single source of truth for all communication between the
 * Next.js server/client and the Google Apps Script Web App.
 *
 * KEY DESIGN DECISIONS:
 * - All server-side calls (from route.ts) use the GAS_URL directly from env.
 * - Client-side calls (from browser) can fetch settings dynamically.
 * - All field mappings are centralized here, preventing drift.
 * ============================================================================
 */

// Environment variable — works on both server and client
const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ?? "";

export type GasResponse<T = Record<string, unknown>> = {
  ok: boolean;
  error?: string;
} & T;

// ─── Core GAS caller (server-safe, uses absolute GAS_URL directly) ─────────
export async function callGasDirect<T = Record<string, unknown>>(
  body: Record<string, unknown>,
  gasUrl?: string
): Promise<GasResponse<T>> {
  const url = gasUrl || GAS_URL;
  if (!url) {
    console.error("[GAS-CLIENT] No GAS URL configured. Set NEXT_PUBLIC_GAS_WEB_APP_URL.");
    return { ok: false, error: "GAS_WEB_APP_URL not configured." } as GasResponse<T>;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      // GAS Web Apps require Content-Type: text/plain to avoid CORS preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[GAS-CLIENT] HTTP Error:", res.status, text.slice(0, 300));
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` } as GasResponse<T>;
    }

    const data = await res.json();
    return data as GasResponse<T>;
  } catch (err) {
    console.error("[GAS-CLIENT] Fetch failed:", err);
    return { ok: false, error: String(err) } as GasResponse<T>;
  }
}

// ─── Client-side only: fetch GAS URL from settings endpoint ────────────────
async function getGasSettingsFromApi(): Promise<{
  url: string | null;
  folderId: string | null;
  sheetId: string | null;
}> {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("Settings fetch failed");
    const data = await res.json();
    const settings = data.settings || {};
    return {
      url: settings.gasWebAppUrl || GAS_URL || null,
      folderId: settings.driveFolderId || null,
      sheetId: settings.registrationSheetId || null,
    };
  } catch {
    return { url: GAS_URL || null, folderId: null, sheetId: null };
  }
}

// ─── Client-side GAS call (used from browser components only) ──────────────
async function callGasClient<T = Record<string, unknown>>(
  body: Record<string, unknown>
): Promise<GasResponse<T>> {
  const settings = await getGasSettingsFromApi();
  if (!settings.url) {
    return { ok: false, error: "GAS_WEB_APP_URL not configured." } as GasResponse<T>;
  }
  // Inject folderId if available and not already set
  if (settings.folderId && !body.folderId) {
    body.folderId = settings.folderId;
  }
  return callGasDirect<T>(body, settings.url);
}

// ─── Upload file to Google Drive (CLIENT-SIDE only) ────────────────────────
export async function uploadFileToDrive(
  file: File,
  options: {
    delegateName?: string;
    subFolderName?: string;
    docType?: string;
    srNo?: string | number;
  } = {}
): Promise<GasResponse<{ fileId: string; fileName: string; webViewLink?: string; url?: string; downloadLink?: string }>> {
  const base64Data = await fileToBase64(file);
  const safeName = sanitizeFileName(
    `${options.subFolderName || ""} ${options.delegateName || ""} ${options.docType || ""} - ${file.name}`
  );

  const docTypeToColumn: Record<string, string> = {
    ticket:        "Ticket File",
    invoice:       "Invoice File",
    visa:          "Visa File",
    passport:      "Passport File",
    voucher:       "Voucher File",
    business_card: "Business Card File",
    bl:            "B/L File",
  };

  const sheetColumn = options.docType
    ? (docTypeToColumn[options.docType.toLowerCase()] ?? `${options.docType} File`)
    : "";

  const settings = await getGasSettingsFromApi();

  return callGasClient({
    action:         "uploadFile",
    fileName:       safeName,
    mimeType:       file.type || "application/octet-stream",
    base64Data,
    subFolderName:  options.subFolderName,
    delegateName:   options.delegateName,
    sheetId:        settings.sheetId,
    sheetColumn,
    srNo:           options.srNo,
  });
}

// ─── Backup registration to Google Sheet (CLIENT-SIDE) ─────────────────────
export async function backupRegistrationToSheet(
  registration: Record<string, unknown>,
  options: { sheetId?: string; sheetName?: string } = {}
) {
  return callGasClient({
    action:      "backupRegistration",
    registration,
    sheetId:     options.sheetId,
    sheetName:   options.sheetName,
  });
}

// ─── SERVER-SIDE: Backup travel record directly to GAS ────────────────────
// Called from route.ts after every CREATE / UPDATE operation.
// Sends the full flattened record to GAS with the correct sheetId.
export async function backupTravelRecordToSheet(
  travelRecord: Record<string, unknown>,
  options: { sheetId?: string; sheetName?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;

  console.log("[GAS-CLIENT] backupTravelRecordToSheet →", {
    gasUrl: gasUrl ? "✓ set" : "✗ MISSING",
    sheetId: options.sheetId ? "✓ set" : "✗ MISSING",
    srNo: travelRecord.responses_sr_no,
  });

  return callGasDirect(
    {
      action:       "backupTravelRecord",
      travelRecord: travelRecord,
      sheetId:      options.sheetId,
      sheetName:    options.sheetName || "Travel Desk Records",
    },
    gasUrl
  );
}

// ─── Export sheet to Excel in Drive (SERVER-SIDE) ─────────────────────────
export async function exportSheetToExcel(
  sheetId: string,
  options: { fileName?: string; folderId?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;
  return callGasDirect<{ fileId: string; downloadLink: string; webViewLink: string }>(
    {
      action:   "exportToExcel",
      sheetId,
      fileName: options.fileName,
      folderId: options.folderId,
    },
    gasUrl
  );
}

// ─── Delete a Drive subfolder (SERVER-SIDE) ────────────────────────────────
export async function deleteDriveFolder(
  subFolderName: string,
  options: { folderId?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;
  return callGasDirect(
    {
      action: "deleteFolder",
      subFolderName,
      folderId: options.folderId,
    },
    gasUrl
  );
}

// ─── Delete a row from the sheet (SERVER-SIDE) ────────────────────────────
export async function deleteSheetRecord(
  srNo: string,
  options: { sheetId?: string; sheetName?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;
  return callGasDirect(
    {
      action:    "deleteRecord",
      srNo,
      sheetId:   options.sheetId,
      sheetName: options.sheetName || "Travel Desk Records",
    },
    gasUrl
  );
}

// ─── Create the Travel Desk Print Sheet (Sheet 2) ─────────────────────────
export async function createTravelSheet(
  options: { sheetId?: string; sheetName?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;
  return callGasDirect(
    {
      action:    "createTravelSheet",
      sheetId:   options.sheetId,
      sheetName: options.sheetName || "Travel Desk Sheet 2",
    },
    gasUrl
  );
}

// ─── Backup travel record to Sheet 2 (SERVER-SIDE) ────────────────────────
export async function backupToTravelSheet2(
  travelRecord: Record<string, unknown>,
  options: { sheetId?: string; sheetName?: string; gasUrl?: string } = {}
) {
  const gasUrl = options.gasUrl || GAS_URL;
  return callGasDirect(
    {
      action:       "backupToTravelSheet2",
      travelRecord: travelRecord,
      sheetId:      options.sheetId,
      sheetName:    options.sheetName || "Travel Desk Sheet 2",
    },
    gasUrl
  );
}

// ─── Ping GAS (CLIENT-SIDE) ───────────────────────────────────────────────
export async function pingGas() {
  return callGasClient<{ message: string }>({ action: "ping" });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200);
}
