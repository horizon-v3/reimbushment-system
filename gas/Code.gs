/**
 * DelegateConnect - Google Apps Script Backend
 * Deploy as a Web App: Execute as "Me", Access: "Anyone"
 *
 * This script handles:
 * 1. File uploads to Google Drive
 * 2. Spreadsheet backup (registrations + travel records)
 * 3. Excel export trigger after each operation
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  REGISTRATION_SHEET_ID: "",   // Set your Google Sheet ID here
  TRAVEL_SHEET_ID: "",         // Can be same sheet, different tab
  DRIVE_FOLDER_ID: "",         // Root folder for all delegate docs
  REGISTRATION_SHEET_NAME: "Form Responses 1",
  TRAVEL_SHEET_NAME: "Travel Desk Records",
};

// ─── CORS Headers ─────────────────────────────────────────────────────────────
function setCorsHeaders(output) {
  return output
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── Entry Points ─────────────────────────────────────────────────────────────
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action || "";
  let result;
  try {
    switch (action) {
      case "getSettings":
        result = getSettings();
        break;
      case "ping":
        result = { ok: true, message: "DelegateConnect GAS Backend v1.0" };
        break;
      default:
        result = { ok: false, error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  const output = ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
  return setCorsHeaders(output);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch {
    const out = ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: "Invalid JSON body" })
    ).setMimeType(ContentService.MimeType.JSON);
    return setCorsHeaders(out);
  }

  const { action } = body;
  let result;

  try {
    switch (action) {
      case "uploadFile":
        result = uploadFileToDrive(body);
        break;
      case "backupRegistration":
        result = backupRegistrationToSheet(body);
        break;
      case "backupTravelRecord":
        result = backupTravelRecordToSheet(body);
        break;
      case "updateSettings":
        result = updateSettings(body);
        break;
      case "exportToExcel":
        result = exportSheetToExcel(body);
        break;
      case "appendToSheet":
        result = appendRowToSheet(body);
        break;
      case "updateSheetRow":
        result = updateSheetRow(body);
        break;
      default:
        result = { ok: false, error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  const output = ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
  return setCorsHeaders(output);
}

// ─── File Upload to Google Drive ──────────────────────────────────────────────
/**
 * body: {
 *   action: "uploadFile",
 *   fileName: string,
 *   mimeType: string,
 *   base64Data: string,        // base64-encoded file content
 *   subFolderName?: string,    // optional subfolder within root
 *   delegateName?: string,     // for naming
 * }
 */
function uploadFileToDrive(body) {
  const { fileName, mimeType, base64Data, subFolderName, delegateName } = body;

  if (!fileName || !base64Data) {
    return { ok: false, error: "fileName and base64Data are required" };
  }

  // Get or create root folder
  const folderId = CONFIG.DRIVE_FOLDER_ID;
  let rootFolder;
  if (folderId) {
    rootFolder = DriveApp.getFolderById(folderId);
  } else {
    // Default: store in root
    rootFolder = DriveApp.getRootFolder();
  }

  // Optional subfolder
  let targetFolder = rootFolder;
  if (subFolderName) {
    const existing = rootFolder.getFoldersByName(subFolderName);
    if (existing.hasNext()) {
      targetFolder = existing.next();
    } else {
      targetFolder = rootFolder.createFolder(subFolderName);
    }
  }

  // Decode and upload
  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, mimeType || "application/octet-stream", fileName);
  const file = targetFolder.createFile(blob);

  // Make publicly accessible (view only)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    webViewLink: "https://drive.google.com/file/d/" + file.getId() + "/view",
    downloadLink: "https://drive.google.com/uc?id=" + file.getId(),
  };
}

// ─── Backup Registration to Sheet ─────────────────────────────────────────────
/**
 * body: {
 *   action: "backupRegistration",
 *   registration: { ...fields },
 *   sheetId?: string,
 *   sheetName?: string,
 * }
 */
function backupRegistrationToSheet(body) {
  const { registration, sheetId, sheetName } = body;
  if (!registration) return { ok: false, error: "registration data required" };

  const sid = sheetId || CONFIG.REGISTRATION_SHEET_ID;
  const sName = sheetName || CONFIG.REGISTRATION_SHEET_NAME;

  let ss;
  if (sid) {
    ss = SpreadsheetApp.openById(sid);
  } else {
    // Create a new spreadsheet if none configured
    ss = SpreadsheetApp.create("DelegateConnect - Registrations");
    CONFIG.REGISTRATION_SHEET_ID = ss.getId();
  }

  let sheet = ss.getSheetByName(sName);
  if (!sheet) {
    sheet = ss.insertSheet(sName);
    // Write headers
    const headers = [
      "ID", "Sr No", "Timestamp", "Title", "First Name", "Last Name",
      "Country", "Passport Country", "Region", "Mobile", "Email",
      "Company", "Website", "Designation", "Passport No", "Place of Issue",
      "Date of Expiry", "Nature of Business", "Product 1", "Product 2",
      "Products/Services", "POC", "Proof Import", "Type of POI",
      "BL Supplier Country", "BL Buyer Country", "Status", "Flight/Hotel Code",
      "Remarks", "BL Status", "BB Invitation Status", "Dollar Business",
      "Drive Passport Front URL", "Drive Proof URL",
      "Created At", "Updated At"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  const r = registration;
  const row = [
    r.id, r.sr_no, r.timestamp_raw, r.title, r.first_name, r.last_name,
    r.country_name, r.passport_country, r.region, r.participant_mobile, r.participant_email,
    r.company_name, r.company_website, r.designation, r.passport_number, r.place_of_issue,
    r.date_of_expiry, r.nature_of_business, r.main_import_product_1, r.main_import_product_2,
    r.products_services, r.poc, r.proof_import, r.type_of_poi,
    r.bl_supplier_country, r.bl_buyer_country, r.status, r.flight_hotel_code,
    r.remarks, r.bl_status, r.bb_invitation_status, r.dollar_business,
    r.drive_passport_front_url, r.drive_proof_url,
    r.created_at, r.updated_at
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Registration backed up to sheet",
    spreadsheetId: ss.getId(),
    sheetUrl: ss.getUrl(),
  };
}

// ─── Backup Travel Record to Sheet ────────────────────────────────────────────
function backupTravelRecordToSheet(body) {
  const { travelRecord, sheetId, sheetName } = body;
  if (!travelRecord) return { ok: false, error: "travelRecord data required" };

  const sid = sheetId || CONFIG.REGISTRATION_SHEET_ID;
  const sName = sheetName || CONFIG.TRAVEL_SHEET_NAME;

  let ss;
  if (sid) {
    ss = SpreadsheetApp.openById(sid);
  } else {
    ss = SpreadsheetApp.create("DelegateConnect - Travel Records");
  }

  let sheet = ss.getSheetByName(sName);
  if (!sheet) {
    sheet = ss.insertSheet(sName);
    const headers = [
      "ID", "Registration ID", "Responses Sr No", "Room No", "Hotel Name",
      "Initial", "First Name", "Last Name", "Country Name", "Country Code",
      "Mobile/WhatsApp", "Check In Date", "Check Out Date", "Occupancy",
      "Arrival Date", "Arrival Flight No", "Arrival To", "Arrival Time",
      "Departure Date", "Departure Flight No", "Departure From", "Departure Time",
      "Sector", "Company Name", "POC", "Status", "Reimbursement", "Notes",
      "Invoice Amount", "Invoice Amount USD",
      "Ticket Received", "Invoice Received", "Visa Received",
      "Passport Copy Received", "Voucher Received",
      "Ticket URL", "Invoice URL", "Visa URL", "Passport URL", "Voucher URL",
      "Created At", "Updated At"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  const r = travelRecord;
  const row = [
    r.id, r.registration_id, r.responses_sr_no, r.room_no, r.hotel_name,
    r.initial, r.first_name, r.last_name, r.country_name, r.country_code,
    r.participant_mobile, r.check_in_date, r.check_out_date, r.room_units,
    r.arrival_date, r.arrival_flight_no, r.arrival_to, r.arrival_time,
    r.departure_date, r.departure_flight_no, r.departure_from, r.departure_time,
    r.sector, r.company_name, r.poc, r.status, r.reimbursement, r.notes,
    r.invoice_amount, r.invoice_amount_usd,
    r.ticket_received, r.invoice_received, r.visa_received,
    r.passport_copy_received, r.voucher_received,
    r.ticket_url, r.invoice_url, r.visa_url, r.passport_url, r.voucher_url,
    r.created_at, r.updated_at
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "Travel record backed up to sheet",
    spreadsheetId: ss.getId(),
    sheetUrl: ss.getUrl(),
  };
}

// ─── Generic Append Row ────────────────────────────────────────────────────────
function appendRowToSheet(body) {
  const { sheetId, sheetName, row, headers } = body;
  if (!sheetId || !sheetName || !row) {
    return { ok: false, error: "sheetId, sheetName, and row are required" };
  }

  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }

  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { ok: true, message: "Row appended" };
}

// ─── Update Row in Sheet ───────────────────────────────────────────────────────
function updateSheetRow(body) {
  const { sheetId, sheetName, idColumnIndex, idValue, row } = body;
  if (!sheetId || !sheetName || idValue === undefined || !row) {
    return { ok: false, error: "Missing required parameters" };
  }

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet not found: " + sheetName };

  const data = sheet.getDataRange().getValues();
  const colIdx = idColumnIndex || 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(idValue)) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();
      return { ok: true, message: "Row updated at index " + (i + 1) };
    }
  }

  // Not found → append
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { ok: true, message: "Row not found, appended instead" };
}

// ─── Export Sheet to Excel (via Drive) ────────────────────────────────────────
function exportSheetToExcel(body) {
  const { sheetId, fileName, folderId } = body;
  if (!sheetId) return { ok: false, error: "sheetId is required" };

  const ss = SpreadsheetApp.openById(sheetId);
  const ssFile = DriveApp.getFileById(sheetId);
  const exportUrl = "https://docs.google.com/spreadsheets/d/" + sheetId +
    "/export?format=xlsx&exportFormat=xlsx";

  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: "Bearer " + token },
  });

  const blob = response.getBlob().setName((fileName || ss.getName()) + ".xlsx");

  let folder = folderId
    ? DriveApp.getFolderById(folderId)
    : DriveApp.getRootFolder();

  const existingFiles = folder.getFilesByName(blob.getName());
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }

  const excelFile = folder.createFile(blob);
  excelFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: excelFile.getId(),
    fileName: excelFile.getName(),
    downloadLink: "https://drive.google.com/uc?id=" + excelFile.getId(),
    webViewLink: "https://drive.google.com/file/d/" + excelFile.getId() + "/view",
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function getSettings() {
  return {
    ok: true,
    settings: {
      registration_sheet_id: CONFIG.REGISTRATION_SHEET_ID,
      registration_sheet_name: CONFIG.REGISTRATION_SHEET_NAME,
      travel_sheet_name: CONFIG.TRAVEL_SHEET_NAME,
      drive_folder_id: CONFIG.DRIVE_FOLDER_ID,
    },
  };
}

function updateSettings(body) {
  const { settings } = body;
  if (!settings) return { ok: false, error: "settings object required" };
  if (settings.registration_sheet_id) CONFIG.REGISTRATION_SHEET_ID = settings.registration_sheet_id;
  if (settings.registration_sheet_name) CONFIG.REGISTRATION_SHEET_NAME = settings.registration_sheet_name;
  if (settings.travel_sheet_name) CONFIG.TRAVEL_SHEET_NAME = settings.travel_sheet_name;
  if (settings.drive_folder_id) CONFIG.DRIVE_FOLDER_ID = settings.drive_folder_id;
  return { ok: true, message: "Settings updated in memory (restart script to persist)" };
}
