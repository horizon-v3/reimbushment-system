/**
 * Google Apps Script Web App Client
 * Calls the deployed GAS Web App URL for Drive/Sheets operations
 */

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || "";

export type GasResponse<T = unknown> = {
  ok: boolean;
  error?: string;
} & T;

async function getGasSettings(): Promise<{ url: string | null; folderId: string | null; sheetId: string | null }> {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    const settings = data.settings || {};
    return { 
      url: settings.gasWebAppUrl || GAS_URL || null, 
      folderId: settings.driveFolderId || null, 
      sheetId: settings.registrationSheetId || null 
    };
  } catch (err) {
    return { url: GAS_URL || null, folderId: null, sheetId: null };
  }
}

async function callGas<T = unknown>(body: Record<string, unknown>): Promise<GasResponse<T>> {
  const settings = await getGasSettings();
  if (!settings.url) {
    return { ok: false, error: "GAS_WEB_APP_URL not configured in Env or Settings" } as GasResponse<T>;
  }
  try {
    // Inject folderId into body if available and not explicitly provided
    if (settings.folderId && !body.folderId) {
      body.folderId = settings.folderId;
    }
    const res = await fetch(settings.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // GAS quirk
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data as GasResponse<T>;
  } catch (err) {
    return { ok: false, error: String(err) } as GasResponse<T>;
  }
}

async function callGasGet<T = unknown>(params: Record<string, string>): Promise<GasResponse<T>> {
  const settings = await getGasSettings();
  if (!settings.url) {
    return { ok: false, error: "GAS_WEB_APP_URL not configured in Env or Settings" } as GasResponse<T>;
  }
  try {
    const url = new URL(settings.url);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();
    return data as GasResponse<T>;
  } catch (err) {
    return { ok: false, error: String(err) } as GasResponse<T>;
  }
}

// ─── Upload file to Google Drive via GAS ──────────────────────────────────────
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
  
  // Map docType (e.g. "ticket") to Sheet Column (e.g. "Ticket File")
  let sheetColumn = "";
  if (options.docType) {
    const map: Record<string, string> = {
      "ticket": "Ticket File",
      "invoice": "Invoice File",
      "visa": "Visa File",
      "passport": "Passport File",
      "voucher": "Voucher File",
      "business_card": "Business Card File",
      "bl": "B/L File"
    };
    sheetColumn = map[options.docType.toLowerCase()] || `${options.docType} File`;
  }

  const settings = await getGasSettings();

  return callGas({
    action: "uploadFile",
    fileName: safeName,
    mimeType: file.type || "application/octet-stream",
    base64Data,
    subFolderName: options.subFolderName,
    delegateName: options.delegateName,
    sheetId: settings.sheetId,
    sheetColumn: sheetColumn,
    srNo: options.srNo
  });
}

// ─── Backup registration to Google Sheet ──────────────────────────────────────
export async function backupRegistrationToSheet(
  registration: Record<string, unknown>,
  options: { sheetId?: string; sheetName?: string } = {}
) {
  return callGas({
    action: "backupRegistration",
    registration,
    sheetId: options.sheetId,
    sheetName: options.sheetName,
  });
}

// ─── Backup travel record to Google Sheet ─────────────────────────────────────
export async function backupTravelRecordToSheet(
  travelRecord: Record<string, unknown>,
  options: { sheetId?: string; sheetName?: string } = {}
) {
  return callGas({
    action: "backupTravelRecord",
    travelRecord,
    sheetId: options.sheetId,
    sheetName: options.sheetName,
  });
}

// ─── Export sheet to Excel in Drive ───────────────────────────────────────────
export async function exportSheetToExcel(
  sheetId: string,
  options: { fileName?: string; folderId?: string } = {}
) {
  return callGas<{ fileId: string; downloadLink: string; webViewLink: string }>({
    action: "exportToExcel",
    sheetId,
    fileName: options.fileName,
    folderId: options.folderId,
  });
}

// ─── Delete folder from Google Drive ──────────────────────────────────────────
export async function deleteDriveFolder(subFolderName: string) {
  return callGas({
    action: "deleteFolder",
    subFolderName,
  });
}

// ─── Ping GAS ─────────────────────────────────────────────────────────────────
export async function pingGas() {
  return callGasGet<{ message: string }>({ action: "ping" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
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
