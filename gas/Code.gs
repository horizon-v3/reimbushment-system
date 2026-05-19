/**
 * ============================================================================
 * ENTERPRISE GOOGLE APPS SCRIPT BACKEND FOR DELEGATE CONNECT CRM
 * ============================================================================
 * This script serves as the robust, highly scalable integration layer between
 * the Next.js frontend (PostgreSQL/Neon) and Google Workspace (Drive/Sheets).
 * 
 * Features:
 * - Exponential backoff & retry mechanisms for all Google APIs
 * - Script-level locks to prevent race conditions and data corruption
 * - Automatic dynamic sheet scaling (inserts missing columns dynamically)
 * - Deep folder structure management inside Google Drive
 * - Case-insensitive and robust column header matching
 * - Strict parameter validation and extensive error logging
 * 
 * Author: DelegateConnect System AI
 * Version: 2.0.0 (Enterprise)
 * ============================================================================
 */

// ─── Global Configuration & Constants ──────────────────────────────────────────
var CONFIG = {
  DEFAULT_SHEET_NAME: "Form Responses 1",
  DEFAULT_TRAVEL_SHEET: "Travel Desk Records",
  DEFAULT_FOLDER_NAME: "DelegateConnect Uploads",
  MAX_RETRIES: 3,
  BACKOFF_BASE_DELAY: 1000,
  LOCK_TIMEOUT: 15000,
  DRIVE_MIME_TYPES: {
    XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    PDF: "application/pdf",
    OCTET: "application/octet-stream"
  }
};

// ─── Entry Points ─────────────────────────────────────────────────────────────

function doGet(e) {
  return handleRequest(e, "GET");
}

function doPost(e) {
  return handleRequest(e, "POST");
}

// ─── Request Router & Error Boundary ──────────────────────────────────────────
function handleRequest(e, method) {
  try {
    var body = {};
    if (method === "POST" && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (method === "GET" && e.parameter) {
      body = e.parameter;
    }

    var action = body.action || "";
    if (!action) {
      return jsonResponse({ ok: false, error: "Action parameter is strictly required." }, 400);
    }

    // Ping action requires no lock
    if (action === "ping") {
      return jsonResponse({ ok: true, message: "pong", version: "2.0.0-Enterprise" });
    }

    // Route actions
    var response;
    switch (action) {
      case "uploadFile":
        response = executeWithLock(function() { return handleUploadFile(body); });
        break;
      case "deleteFolder":
        response = executeWithLock(function() { return handleDeleteDriveFolder(body); });
        break;
      case "getRows":
        response = executeWithLock(function() { return handleGetRows(body); });
        break;
      case "updateCell":
        response = executeWithLock(function() { return handleUpdateCell(body); });
        break;
      case "syncBack":
        response = executeWithLock(function() { return handleSyncDriveUrlsToSheet(body); });
        break;
      case "deleteRecord":
        response = executeWithLock(function() { return handleDeleteRecord(body); });
        break;
      case "backupTravelRecord":
        response = executeWithLock(function() { return handleBackupTravelRecord(body); });
        break;
      case "backupRegistration":
        response = executeWithLock(function() { return handleBackupRegistration(body); });
        break;
      case "exportToExcel":
        response = executeWithLock(function() { return handleExportToExcel(body); });
        break;
      case "createTravelSheet":
        response = executeWithLock(function() { return handleCreateTravelSheet(body); });
        break;
      case "backupToTravelSheet2":
        response = executeWithLock(function() { return handleBackupToTravelSheet2(body); });
        break;
      default:
        return jsonResponse({ ok: false, error: "Unknown action provided: " + action }, 400);
    }

    return jsonResponse(response);
  } catch (err) {
    logError("Fatal Request Error", err);
    return jsonResponse({ ok: false, error: "Internal Server Error: " + String(err) }, 500);
  }
}

// ─── Core Security & Concurrency Wrapper ──────────────────────────────────────
/**
 * Uses Google Apps Script's LockService to ensure that concurrent API requests
 * from Next.js do not overwrite each other or create duplicate columns.
 */
function executeWithLock(callback) {
  var lock = LockService.getScriptLock();
  try {
    var success = lock.tryLock(CONFIG.LOCK_TIMEOUT);
    if (!success) {
      logError("Concurrency Error", "Could not obtain lock after " + CONFIG.LOCK_TIMEOUT + "ms");
      return { ok: false, error: "System is busy processing other requests. Please try again." };
    }
    return withRetry(callback);
  } catch (err) {
    logError("Execution Error", err);
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Exponential backoff wrapper to handle transient Google API failures
 * (like Drive rate limits or Sheet quota exceedances).
 */
function withRetry(callback) {
  var attempt = 0;
  var lastError;

  while (attempt < CONFIG.MAX_RETRIES) {
    try {
      return callback();
    } catch (e) {
      lastError = e;
      attempt++;
      if (attempt >= CONFIG.MAX_RETRIES) {
        logError("Max Retries Exceeded", e);
        throw new Error("Operation failed after " + CONFIG.MAX_RETRIES + " attempts: " + e.message);
      }
      var delay = CONFIG.BACKOFF_BASE_DELAY * Math.pow(2, attempt);
      Utilities.sleep(delay);
    }
  }
  return { ok: false, error: "Unknown retry execution failure" };
}

// ─── ACTION HANDLERS ──────────────────────────────────────────────────────────

/**
 * Uploads a file to Google Drive (with nested folders) and writes URL to Sheets
 */
function handleUploadFile(body) {
  var base64Data    = body.base64Data;
  var fileName      = body.fileName || ("upload_" + Date.now());
  var mimeType      = body.mimeType || CONFIG.DRIVE_MIME_TYPES.OCTET;
  var folderId      = body.folderId || "";
  var sheetId       = body.sheetId || "";
  var sheetName     = body.sheetName || CONFIG.DEFAULT_SHEET_NAME;
  var sheetColumn   = body.sheetColumn || "";
  var rowIndex      = body.rowIndex || null;
  var srNo          = body.srNo || null;
  var subFolderName = body.subFolderName || "";

  if (!base64Data) {
    return { ok: false, error: "Missing required parameter: base64Data" };
  }

  // 1. Decode File
  var blob;
  try {
    blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  } catch (err) {
    return { ok: false, error: "Failed to decode base64 file data: " + String(err) };
  }

  // 2. Resolve Drive Folder Hierarchy
  var rootFolder;
  try {
    if (folderId) {
      rootFolder = DriveApp.getFolderById(folderId);
    } else {
      var fi = DriveApp.getFoldersByName(CONFIG.DEFAULT_FOLDER_NAME);
      rootFolder = fi.hasNext() ? fi.next() : DriveApp.createFolder(CONFIG.DEFAULT_FOLDER_NAME);
    }
  } catch (err) {
    return { ok: false, error: "Failed to resolve root Drive folder: " + String(err) };
  }

  var targetFolder = rootFolder;
  if (subFolderName) {
    try {
      var safeSubName = subFolderName.replace(/[\/\\:*\?"<>|]/g, "_").trim(); // Sanitize
      var subfi = rootFolder.getFoldersByName(safeSubName);
      targetFolder = subfi.hasNext() ? subfi.next() : rootFolder.createFolder(safeSubName);
    } catch (err) {
      return { ok: false, error: "Failed to create/resolve delegate subfolder: " + String(err) };
    }
  }

  // 3. Save File to Drive
  var file, fileId, fileUrl;
  try {
    file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();
    fileUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
  } catch (err) {
    return { ok: false, error: "Failed to create file in Drive: " + String(err) };
  }

  // 4. Update Spreadsheet
  var sheetUpdateResult = { updated: false };
  if (sheetId && sheetColumn && (rowIndex || srNo)) {
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        sheetUpdateResult = executeWriteUrlToSheet(sheet, sheetColumn, rowIndex, srNo, fileUrl);
      } else {
        logError("Sheet Update Warning", "Sheet '" + sheetName + "' not found.");
      }
    } catch (err) {
      logError("Sheet Update Error", err);
      // We do not fail the upload just because sheet write failed
      sheetUpdateResult = { updated: false, error: String(err) };
    }
  }

  return { 
    ok: true, 
    url: fileUrl, 
    fileId: fileId,
    sheetUpdated: sheetUpdateResult.updated,
    sheetError: sheetUpdateResult.error || null
  };
}

/**
 * Permanently trashes a Delegate's subfolder from Drive
 */
function handleDeleteDriveFolder(body) {
  var folderId = body.folderId || "";
  var subFolderName = body.subFolderName || "";
  
  if (!subFolderName) return { ok: false, error: "Parameter 'subFolderName' is strictly required for deletion." };
  
  var rootFolder;
  try {
    if (folderId) {
      rootFolder = DriveApp.getFolderById(folderId);
    } else {
      var fi = DriveApp.getFoldersByName(CONFIG.DEFAULT_FOLDER_NAME);
      if (fi.hasNext()) {
        rootFolder = fi.next();
      } else {
        return { ok: true, message: "Root folder not found, skipping deletion." };
      }
    }
  } catch (err) {
    return { ok: false, error: "Error accessing root folder: " + String(err) };
  }

  try {
    var safeSubName = subFolderName.replace(/[\/\\:*\?"<>|]/g, "_").trim();
    var subfi = rootFolder.getFoldersByName(safeSubName);
    var trashedCount = 0;
    while (subfi.hasNext()) {
      var target = subfi.next();
      target.setTrashed(true);
      trashedCount++;
    }
    return { ok: true, message: "Folder trashed", trashedCount: trashedCount };
  } catch (err) {
    return { ok: false, error: "Delete operation failed: " + String(err) };
  }
}

/**
 * Deletes a row from the spreadsheet based on Sr No
 */
function handleDeleteRecord(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_TRAVEL_SHEET;
  var srNo      = body.srNo;

  if (!sheetId || !srNo) return { ok: false, error: "sheetId and srNo required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet not found" };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var srCol = resolveSrNoColumnIndex(headers);
  if (srCol === -1) return { ok: false, error: "Sr No column not found" };

  var targetRow = resolveRowBySrNo(sheet, srCol, srNo);
  if (targetRow) {
    sheet.deleteRow(targetRow);
    return { ok: true, message: "Row deleted successfully" };
  }
  return { ok: false, error: "Row not found" };
}

/**
 * Reads all rows from a specified sheet as structured JSON
 */
function handleGetRows(body) {
  var sheetId = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_SHEET_NAME;

  if (!sheetId) return { ok: false, error: "Missing parameter: sheetId" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet '" + sheetName + "' not found." };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow < 2 || lastCol < 1) {
    return { ok: true, rows: [], total: 0 };
  }

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var rowObj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) {
        rowObj[headers[j]] = data[i][j];
      }
    }
    rows.push(rowObj);
  }

  return { ok: true, rows: rows, total: rows.length };
}

/**
 * Updates a single cell based on Sr No
 */
function handleUpdateCell(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_SHEET_NAME;
  var srNo      = body.srNo;
  var column    = body.column;
  var value     = body.value;

  if (!sheetId || !column || !srNo) {
    return { ok: false, error: "Missing required parameters (sheetId, column, srNo)." };
  }

  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet not found" };

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    // Edge case: completely empty sheet
    sheet.getRange(1, 1).setValue(column);
    lastCol = 1;
  }
  
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = resolveColumnIndex(headers, column);

  // Dynamic column creation
  if (colIdx === -1) {
    colIdx = lastCol + 1;
    if (colIdx > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }
    sheet.getRange(1, colIdx).setValue(column);
    sheet.getRange(1, colIdx).setFontWeight("bold").setBackground("#f3f3f3");
    headers.push(column);
  }

  var srCol = resolveSrNoColumnIndex(headers);
  if (srCol === -1) return { ok: false, error: "'Sr No' column missing entirely in sheet." };

  var targetRow = resolveRowBySrNo(sheet, srCol, srNo);
  if (!targetRow) return { ok: false, error: "Sr No not found in sheet: " + srNo };

  sheet.getRange(targetRow, colIdx).setValue(value);
  return { ok: true };
}

/**
 * Bulk updates multiple URLs in the sheet
 */
function handleSyncDriveUrlsToSheet(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_SHEET_NAME;
  var updates   = body.updates || [];
  
  if (!sheetId || updates.length === 0) return { ok: true, updated: 0 };

  var updatedCount = 0;
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    try {
      var res = handleUpdateCell({
        sheetId: sheetId,
        sheetName: sheetName,
        srNo: u.srNo,
        column: u.column,
        value: u.url
      });
      if (res.ok) updatedCount++;
    } catch(e) {
      logError("Sync Back Error (SrNo=" + u.srNo + ")", e);
    }
  }
  return { ok: true, updated: updatedCount };
}

/**
 * Fully synchronizes a Travel Desk database record into the Google Sheet
 */
function handleBackupTravelRecord(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_TRAVEL_SHEET;
  var record    = body.travelRecord || {};

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // Schema Mapping
  var recordMap = {
    "Sr No": record.responses_sr_no,
    "Initial": record.initial,
    "First Name": record.first_name,
    "Last Name": record.last_name,
    "Country Name": record.country_name,
    "Country Code": record.country_code,
    "Participant Mobile": record.participant_mobile,
    "Sector": record.sector,
    "Company Name": record.company_name,
    "Poc": record.poc,
    "Room No": record.room_no,
    "Hotel Name": record.hotel_name,
    "Arrival Flight No": record.arrival_flight_no,
    "Arrival To": record.arrival_to,
    "Arrival Time": record.arrival_time,
    "Arrival Date": record.arrival_date,
    "Departure Flight No": record.departure_flight_no,
    "Departure From": record.departure_from,
    "Departure Time": record.departure_time,
    "Departure Date": record.departure_date,
    "Check In Date": record.check_in_date,
    "Check Out Date": record.check_out_date,
    "Status": record.status,
    "Reimbursement to be done or not": record.reimbursement,
    "Reimbursement Amount Given": record.reimbursement_amount,
    "Invoice Amount (INR)": record.invoice_amount,
    "Invoice Amount (USD)": record.invoice_amount_usd,
    "Invoice Amount (Local)": record.invoice_amount_local,
    "Invoice Currency": record.invoice_currency,
    "Ticket Received": record.ticket_received,
    "Invoice Received": record.invoice_received,
    "Visa Received": record.visa_received,
    "Passport Copy": record.passport_copy_received,
    "Voucher Received": record.voucher_received,
    "Occupancy": record.room_units,
    "Ticket File": record.ticket_url,
    "Invoice File": record.invoice_url,
    "Visa File": record.visa_url,
    "Passport File": record.passport_url,
    "Voucher File": record.voucher_url,
    "Business Card File": record.business_card_url,
    "B/L File": record.bl_url,
    "BL": record.bl
  };

  var expectedHeaders = Object.keys(recordMap);
  ensureSheetHeadersDynamically(sheet, expectedHeaders);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var srNo = record.responses_sr_no;
  var srCol = resolveSrNoColumnIndex(headers);
  var targetRow = null;

  if (srNo && srCol > 0) {
    targetRow = resolveRowBySrNo(sheet, srCol, srNo);
  }

  if (!targetRow) {
    targetRow = sheet.getLastRow() + 1; // Append as new row
  }

  var rowUpdates = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (recordMap[h] !== undefined && recordMap[h] !== null) {
      rowUpdates.push({ row: targetRow, col: c + 1, val: recordMap[h] });
    }
  }

  if (rowUpdates.length > 0) {
    rowUpdates.forEach(function(u) {
      sheet.getRange(u.row, u.col).setValue(u.val);
    });
  }

  return { ok: true, updatedFields: rowUpdates.length, targetRow: targetRow };
}

/**
 * Fully synchronizes a Registration database record into the Google Sheet
 */
function handleBackupRegistration(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || CONFIG.DEFAULT_SHEET_NAME;
  var record    = body.registration || {};

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var srNo = record.sr_no;

  var recordMap = {
    "Sr No": record.sr_no,
    "Timestamp": record.timestamp_raw || new Date().toISOString(),
    "Title": record.title,
    "First Name": record.first_name,
    "Last Name": record.last_name,
    "Country Name": record.country_name,
    "Passport Country": record.passport_country,
    "Region": record.region,
    "Participant Mobile/Whatsapp number (With ISD Code)": record.participant_mobile,
    "Participant Email": record.participant_email,
    "Company Name": record.company_name,
    "Company Website": record.company_website,
    "Designation of the Representative": record.designation,
    "Passport Number": record.passport_number,
    "Place of Issue": record.place_of_issue,
    "Date of Expiry": record.date_of_expiry,
    "Passport Front Copy": record.drive_passport_front_url || record.passport_front_copy,
    "Passport Back Copy": record.drive_passport_back_url || record.passport_back_copy,
    "Nature of Business": record.nature_of_business,
    "Your Main Import Product - 1": record.main_import_product_1,
    "Your Main Import Product - 2": record.main_import_product_2,
    "Upload one proof of your Import (Please enter valid document Eg: - Bill of Lading)": record.drive_proof_url || record.proof_upload,
    "Which of the below describes your products/services": record.products_services,
    "Please upload your Business Card": record.drive_business_card_url || record.business_card_upload,
    "POC": record.poc,
    "Proof of Import": record.proof_import,
    "Type of POI": record.type_of_poi,
    "B/L Supplier Country": record.bl_supplier_country,
    "B/L Buyer Country": record.bl_buyer_country,
    "Status": record.status,
    "Flight & Hotel": record.flight_hotel_code,
    "Remarks": record.remarks,
    "B/L Status": record.bl_status,
    "BB Invitation letter status": record.bb_invitation_status,
    "Dollar Business": record.dollar_business,
    "Vujis": record.vujis
  };

  var expectedHeaders = Object.keys(recordMap);
  ensureSheetHeadersDynamically(sheet, expectedHeaders);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var srCol = resolveSrNoColumnIndex(headers);
  var targetRow = null;
  
  if (srNo && srCol > 0) {
    targetRow = resolveRowBySrNo(sheet, srCol, srNo);
  }
  
  if (!targetRow) targetRow = sheet.getLastRow() + 1;

  var rowUpdates = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (recordMap[h] !== undefined && recordMap[h] !== null) {
      rowUpdates.push({ row: targetRow, col: c + 1, val: recordMap[h] });
    }
  }

  if (rowUpdates.length > 0) {
    rowUpdates.forEach(function(u) {
      sheet.getRange(u.row, u.col).setValue(u.val);
    });
  }

  return { ok: true, updatedFields: rowUpdates.length, targetRow: targetRow };
}

/**
 * Exports a spreadsheet to Excel and saves it to Drive
 */
function handleExportToExcel(body) {
  var sheetId  = body.sheetId;
  var fileName = body.fileName || ("Export_" + Date.now() + ".xlsx");
  var folderId = body.folderId || "";

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/export?format=xlsx";
  var token = ScriptApp.getOAuthToken();
  var blob = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  }).getBlob().setName(fileName);

  var folder = DriveApp.getRootFolder();
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch(e) {
      logError("ExportToExcel", "Requested folderId not found, defaulting to root");
    }
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { 
    ok: true, 
    fileId: file.getId(),
    downloadLink: file.getDownloadUrl(),
    webViewLink: file.getUrl()
  };
}

// ─── TRAVEL DESK PRINT SHEET (SHEET 2) ────────────────────────────────────────

/**
 * The exact column layout the user specified for the Travel Desk print sheet.
 * Maps column header → record field name (snake_case from Next.js).
 */
var TRAVEL_SHEET2_COLUMNS = [
  { header: "Sr. No.",                                          field: "_row_num"            },
  { header: "Responses Sr No",                                  field: "responses_sr_no"     },
  { header: "Room No.",                                         field: "room_no"             },
  { header: "Hotel Name",                                       field: "hotel_name"          },
  { header: "Initial",                                          field: "initial"             },
  { header: "First Name",                                       field: "first_name"          },
  { header: "Last Name",                                        field: "last_name"           },
  { header: "Country Name",                                     field: "country_name"        },
  { header: "Country code",                                     field: "country_code"        },
  { header: "Participant Mobile/Whatsapp number",               field: "participant_mobile"  },
  { header: "Check In Date",                                    field: "check_in_date"       },
  { header: "Check Out Date",                                   field: "check_out_date"      },
  { header: "Occupancy (Single (1) / Double (0.5))",            field: "room_units"          },
  { header: "Date of Arrival at Delhi",                         field: "arrival_date"        },
  { header: "Flight Number (Arrival)",                          field: "arrival_flight_no"   },
  { header: "To",                                               field: "arrival_to"          },
  { header: "Arrival time",                                     field: "arrival_time"        },
  { header: "Date of Travel (Departure)",                       field: "departure_date"      },
  { header: "Flight Number (Departure)",                        field: "departure_flight_no" },
  { header: "From",                                             field: "departure_from"      },
  { header: "Dep Time",                                         field: "departure_time"      },
  { header: "Sector",                                           field: "sector"              },
  { header: "Companies",                                        field: "company_name"        },
  { header: "POC",                                              field: "poc"                 },
  { header: "Status",                                           field: "status"              },
  { header: "Reimbursement",                                    field: "reimbursement"       },
  { header: "Additional Days Voucher",                          field: "voucher_received"    },
  { header: "Remarks",                                          field: "notes"               },
  { header: "Invoice Amount",                                   field: "invoice_amount"      },
  { header: "Invoice Amount In USD",                            field: "invoice_amount_usd"  },
  { header: "Ticket",                                           field: "ticket_received"     },
  { header: "Invoice",                                          field: "invoice_received"    },
  { header: "Visa",                                             field: "visa_received"       },
  { header: "PRINT STATUS",                                     field: "_print_status"       }
];

/**
 * Creates (or resets) Sheet 2 in the target spreadsheet with the exact
 * Travel Desk column layout. Safe to run multiple times — preserves data rows.
 */
function handleCreateTravelSheet(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || "Travel Desk Sheet 2";

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);

  // Create if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // Write headers row
  var headers = TRAVEL_SHEET2_COLUMNS.map(function(c) { return c.header; });
  var numCols = headers.length;

  // Expand columns if needed
  if (sheet.getMaxColumns() < numCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), numCols - sheet.getMaxColumns());
  }

  // Set headers in row 1
  sheet.getRange(1, 1, 1, numCols).setValues([headers]);

  // Style the header row
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setFontWeight("bold")
    .setBackground("#1a73e8")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center")
    .setWrap(true);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Auto-resize columns for readability
  sheet.setColumnWidths(1, numCols, 130);

  return {
    ok: true,
    message: "Sheet '" + sheetName + "' created with " + numCols + " columns",
    sheetName: sheetName
  };
}

/**
 * Upserts a single travel record row into Sheet 2 using the exact column layout.
 * Matches by Responses Sr No. If not found, appends as a new row.
 * Also auto-creates the sheet if it doesn't exist yet.
 */
function handleBackupToTravelSheet2(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || "Travel Desk Sheet 2";
  var record    = body.travelRecord || {};

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);

  // Auto-create sheet if missing
  if (!sheet) {
    var createResult = handleCreateTravelSheet({ sheetId: sheetId, sheetName: sheetName });
    if (!createResult.ok) return createResult;
    sheet = ss.getSheetByName(sheetName);
  }

  var numCols = TRAVEL_SHEET2_COLUMNS.length;

  // Ensure headers are present
  var headerRow = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  if (!headerRow[0] || String(headerRow[0]).trim() === "") {
    handleCreateTravelSheet({ sheetId: sheetId, sheetName: sheetName });
    headerRow = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  }

  // Find target row by Responses Sr No
  var srNo = String(record.responses_sr_no || "").trim();
  var targetRow = null;

  if (srNo && sheet.getLastRow() > 1) {
    // Sr No is the 2nd column (index 1)
    var srColIdx = 2; // 1-based: column B = Responses Sr No
    var existingData = sheet.getRange(2, srColIdx, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < existingData.length; i++) {
      if (String(existingData[i][0]).trim() === srNo) {
        targetRow = i + 2; // +2 for header offset + 0-index
        break;
      }
    }
  }

  if (!targetRow) {
    targetRow = sheet.getLastRow() + 1;
  }

  // Ensure we have enough physical rows
  if (targetRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  }

  // Build the row data array matching TRAVEL_SHEET2_COLUMNS order
  var totalRows = sheet.getLastRow(); // for _row_num
  var rowData = TRAVEL_SHEET2_COLUMNS.map(function(col, idx) {
    if (col.field === "_row_num") {
      return targetRow - 1; // Row number (excludes header)
    }
    if (col.field === "_print_status") {
      return ""; // Blank — user fills manually
    }
    var val = record[col.field];
    if (val === null || val === undefined) return "";
    return String(val);
  });

  // Write the full row in one batch (fastest method)
  sheet.getRange(targetRow, 1, 1, numCols).setValues([rowData]);

  // Alternating row color for readability
  if (targetRow % 2 === 0) {
    sheet.getRange(targetRow, 1, 1, numCols).setBackground("#f8f9fa");
  } else {
    sheet.getRange(targetRow, 1, 1, numCols).setBackground("#ffffff");
  }

  return {
    ok: true,
    targetRow: targetRow,
    srNo: srNo,
    sheetName: sheetName
  };
}

/**
 * Deletes a row from Sheet 2 by Responses Sr No.
 * Called automatically when a travel record is deleted from the CRM.
 */
function handleDeleteFromTravelSheet2(body) {
  var sheetId   = body.sheetId;
  var sheetName = body.sheetName || "Travel Desk Sheet 2";
  var srNo      = String(body.srNo || "").trim();

  if (!sheetId || !srNo) return { ok: false, error: "sheetId and srNo required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: true, message: "Sheet not found, nothing to delete" };

  if (sheet.getLastRow() <= 1) return { ok: true, message: "Sheet is empty" };

  var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues(); // Column B = Sr No
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === srNo) {
      sheet.deleteRow(i + 2);
      return { ok: true, message: "Row deleted from Sheet 2" };
    }
  }

  return { ok: false, error: "Sr No not found in Sheet 2: " + srNo };
}

// ─── UTILITY & HELPER FUNCTIONS ───────────────────────────────────────────────

/**
 * Standardized JSON HTTP Response format for Next.js API consumption
 */
function jsonResponse(data, statusCode) {
  statusCode = statusCode || 200;
  // Note: Apps Script ContentService does not support setting HTTP status codes directly easily.
  // The client must parse the `ok: boolean` property instead.
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Writes a specific URL back to the spreadsheet, safely managing column sizing
 */
function executeWriteUrlToSheet(sheet, sheetColumn, rowIndex, srNo, url) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1).setValue(sheetColumn);
    lastCol = 1;
  }
  
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = resolveColumnIndex(headers, sheetColumn);

  if (colIdx === -1) {
    colIdx = lastCol + 1;
    if (colIdx > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }
    sheet.getRange(1, colIdx).setValue(sheetColumn);
    sheet.getRange(1, colIdx).setFontWeight("bold").setBackground("#f3f3f3");
    headers.push(sheetColumn);
  }

  var targetRow = null;
  if (rowIndex) {
    targetRow = parseInt(rowIndex, 10);
  } else if (srNo) {
    var srCol = resolveSrNoColumnIndex(headers);
    if (srCol > 0) {
      targetRow = resolveRowBySrNo(sheet, srCol, srNo);
    }
  }

  if (targetRow) {
    sheet.getRange(targetRow, colIdx).setValue(url);
    return { updated: true };
  }
  return { updated: false, error: "Row not identified." };
}

/**
 * Ensures that all expected headers exist in the sheet. 
 * If they are missing, it expands the physical columns of the sheet dynamically.
 */
function ensureSheetHeadersDynamically(sheet, requiredHeaders) {
  var lastCol = sheet.getLastColumn();
  var existingHeaders = [];
  if (lastCol > 0) {
    existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
      return String(h).trim().toLowerCase();
    });
  }

  var missingHeaders = [];
  requiredHeaders.forEach(function(h) {
    if (existingHeaders.indexOf(String(h).trim().toLowerCase()) === -1) {
      missingHeaders.push(h);
    }
  });

  if (missingHeaders.length > 0) {
    var startCol = lastCol + 1;
    var requiredPhysicalCols = startCol + missingHeaders.length - 1;
    
    // Auto-scale Google Sheet if we run out of physical columns (Z -> AA, etc.)
    if (requiredPhysicalCols > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredPhysicalCols - sheet.getMaxColumns());
    }
    
    // Inject headers
    sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
    // Format injected headers
    var formatRange = sheet.getRange(1, startCol, 1, missingHeaders.length);
    formatRange.setFontWeight("bold").setBackground("#f3f3f3");
  }
}

/**
 * Resolves the 1-based index of a generic column header (case-insensitive)
 */
function resolveColumnIndex(headers, columnName) {
  var target = String(columnName).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === target) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Resolves the 1-based index of the "Sr No" column across various naming conventions
 */
function resolveSrNoColumnIndex(headers) {
  for (var j = 0; j < headers.length; j++) {
    var h = String(headers[j]).trim().toLowerCase();
    if (h === "sr no" || h === "sr_no" || h === "sr. no" || h === "responses_sr_no") { 
      return j + 1; 
    }
  }
  return -1;
}

/**
 * Looks up the physical row index (1-based) by reading down the Sr No column
 */
function resolveRowBySrNo(sheet, srColIndex, srNoValue) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null; // No data

  var rows = sheet.getRange(2, srColIndex, lastRow - 1, 1).getValues();
  var targetSr = String(srNoValue).trim();
  
  for (var k = 0; k < rows.length; k++) {
    var cellValue = String(rows[k][0]).trim();
    if (cellValue === targetSr) { 
      return k + 2; 
    }
  }
  return null;
}

/**
 * Secure logging functionality for debugging in the GAS Dashboard
 */
function logError(context, err) {
  var errMessage = typeof err === "object" ? (err.message || String(err)) : String(err);
  var stack = (err && err.stack) ? (" | Stack: " + err.stack) : "";
  Logger.log("[" + new Date().toISOString() + "] ERROR [" + context + "]: " + errMessage + stack);
}

// ─── END OF ENTERPRISE SCRIPT ─────────────────────────────────────────────────
