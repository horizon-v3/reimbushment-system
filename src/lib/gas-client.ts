/**
 * Google Apps Script Web App Client
 * Calls the deployed GAS Web App URL for Drive/Sheets operations
 */

const GAS_URL = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || "";

export type GasResponse<T = unknown> = {
  ok: boolean;
  error?: string;
} & T;

async function callGas<T = unknown>(body: Record<string, unknown>): Promise<GasResponse<T>> {
  if (!GAS_URL) {
    return { ok: false, error: "GAS_WEB_APP_URL not configured" } as GasResponse<T>;
  }
  try {
    const res = await fetch(GAS_URL, {
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
  if (!GAS_URL) {
    return { ok: false, error: "GAS_WEB_APP_URL not configured" } as GasResponse<T>;
  }
  try {
    const url = new URL(GAS_URL);
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
  } = {}
): Promise<GasResponse<{ fileId: string; fileName: string; webViewLink: string; downloadLink: string }>> {
  const base64Data = await fileToBase64(file);
  const safeName = sanitizeFileName(
    `${options.subFolderName || ""} ${options.delegateName || ""} ${options.docType || ""} - ${file.name}`
  );
  return callGas({
    action: "uploadFile",
    fileName: safeName,
    mimeType: file.type || "application/octet-stream",
    base64Data,
    subFolderName: options.subFolderName,
    delegateName: options.delegateName,
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
