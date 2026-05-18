/**
 * DelegateConnect — Google Apps Script Web App
 * ═══════════════════════════════════════════════════════════════
 * Deploy as:  Execute as: Me
 *             Who has access: Anyone
 * ═══════════════════════════════════════════════════════════════
 *
 * Supports two actions (called from Next.js API):
 *  GET  ?action=getRows&sheetId=…&sheetName=…  → returns all rows as JSON
 *  POST { action:"uploadFile", base64Data, … }  → uploads to Drive, writes URL to sheet
 */

// ─── Config ───────────────────────────────────────────────────────────────────
var DEFAULT_SHEET_NAME  = "Form Responses 1";
var DEFAULT_FOLDER_NAME = "DelegateConnect Uploads";

// ─── GET handler ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var action    = e.parameter.action    || "getRows";
    var sheetId   = e.parameter.sheetId   || "";
    var sheetName = e.parameter.sheetName || DEFAULT_SHEET_NAME;
    if (action === "getRows") return jsonResponse(getRows(sheetId, sheetName));
    return jsonResponse({ ok: false, error: "Unknown action: " + action });
  } catch(err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || "";
    if (action === "ping") return jsonResponse({ ok: true, message: "pong" });
    if (action === "uploadFile") return jsonResponse(uploadFile(body));
    if (action === "deleteFolder") return jsonResponse(deleteDriveFolder(body));
    if (action === "getRows") return jsonResponse(getRows(body.sheetId, body.sheetName));
    if (action === "updateCell")  return jsonResponse(updateCell(body));
    if (action === "syncBack")    return jsonResponse(syncDriveUrlsToSheet(body));
    if (action === "backupTravelRecord") return jsonResponse(backupTravelRecord(body));
    if (action === "backupRegistration") return jsonResponse(backupRegistration(body));
    if (action === "exportToExcel") return jsonResponse(exportToExcel(body));
    return jsonResponse({ ok: false, error: "Unknown action: " + action });
  } catch(err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ─── getRows — returns all sheet rows as JSON objects with raw header names ───
function getRows(sheetId, sheetName) {
  var ss = sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet '" + sheetName + "' not found" };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, rows: [] };

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row.some(function(c) { return c !== "" && c !== null; })) continue;
    var obj = { "_rowIndex": i + 1 };
    headers.forEach(function(h, j) {
      var c = row[j];
      obj[h] = (c instanceof Date) ? c.toISOString() : (c !== null && c !== undefined ? String(c) : "");
    });
    rows.push(obj);
  }

  return { ok: true, rows: rows, total: rows.length };
}

// ─── uploadFile — decode base64, upload to Drive, write URL back to sheet ─────
function uploadFile(body) {
  var base64Data  = body.base64Data  || "";
  var fileName    = body.fileName    || ("upload_" + Date.now());
  var mimeType    = body.mimeType    || "application/octet-stream";
  var folderId    = body.folderId    || "";
  var sheetId     = body.sheetId     || "";
  var sheetName   = body.sheetName   || DEFAULT_SHEET_NAME;
  var sheetColumn = body.sheetColumn || "";
  var rowIndex    = body.rowIndex    || null;
  var srNo        = body.srNo        || null;
  var subFolderName = body.subFolderName || "";

  if (!base64Data) return { ok: false, error: "No base64Data" };

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

  // Get or create root folder
  var rootFolder;
  if (folderId) {
    try { rootFolder = DriveApp.getFolderById(folderId); }
    catch(e) { rootFolder = DriveApp.getRootFolder(); }
  } else {
    var fi = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    rootFolder = fi.hasNext() ? fi.next() : DriveApp.createFolder(DEFAULT_FOLDER_NAME);
  }

  // Determine target folder (create subfolder if specified)
  var targetFolder = rootFolder;
  if (subFolderName) {
    try {
      var subfi = rootFolder.getFoldersByName(subFolderName);
      targetFolder = subfi.hasNext() ? subfi.next() : rootFolder.createFolder(subFolderName);
    } catch(e) {
      return { ok: false, error: "Folder creation failed: " + e };
    }
  }

  var file, fileId, fileUrl;
  try {
    file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId  = file.getId();
    fileUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
  } catch(e) {
    return { ok: false, error: "File creation failed: " + e };
  }

  // Write URL back to sheet
  if (sheetId && sheetColumn && (rowIndex || srNo)) {
    try { writeUrlToSheet(sheetId, sheetName, sheetColumn, rowIndex, srNo, fileUrl); }
    catch(e) { Logger.log("writeUrlToSheet error: " + e); }
  }

  return { ok: true, url: fileUrl, fileId: fileId };
}

// ─── deleteDriveFolder ────────────────────────────────────────────────────────
function deleteDriveFolder(body) {
  var folderId = body.folderId || "";
  var subFolderName = body.subFolderName || "";
  
  if (!subFolderName) return { ok: false, error: "subFolderName required" };
  
  var rootFolder;
  if (folderId) {
    try { rootFolder = DriveApp.getFolderById(folderId); }
    catch(e) { rootFolder = DriveApp.getRootFolder(); }
  } else {
    var fi = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    if (fi.hasNext()) rootFolder = fi.next();
    else return { ok: true, message: "Root folder not found" };
  }

  try {
    var subfi = rootFolder.getFoldersByName(subFolderName);
    if (subfi.hasNext()) {
      var target = subfi.next();
      target.setTrashed(true);
      return { ok: true, message: "Folder deleted" };
    }
  } catch(e) {
    return { ok: false, error: "Delete failed: " + e };
  }
  return { ok: true, message: "Subfolder not found" };
}

// ─── writeUrlToSheet ──────────────────────────────────────────────────────────
function writeUrlToSheet(sheetId, sheetName, sheetColumn, rowIndex, srNo, url) {
  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return; // completely empty sheet
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Find column index by header name
  var colIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === sheetColumn) { colIdx = i + 1; break; }
  }
  
  // Create column if it doesn't exist
  if (colIdx === -1) {
    colIdx = lastCol + 1;
    if (colIdx > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }
    sheet.getRange(1, colIdx).setValue(sheetColumn);
    sheet.getRange(1, colIdx).setFontWeight("bold").setBackground("#f3f3f3");
  }

  // Find row
  var targetRow = null;
  if (rowIndex) {
    targetRow = parseInt(rowIndex);
  } else if (srNo) {
    var srCol = -1;
    for (var j = 0; j < headers.length; j++) {
      var h = String(headers[j]).trim().toLowerCase();
      if (h === "sr no" || h === "sr_no" || h === "sr. no") { srCol = j + 1; break; }
    }
    if (srCol > 0) {
      var numRows = sheet.getLastRow() - 1;
      if (numRows > 0) {
        var vals = sheet.getRange(2, srCol, numRows, 1).getValues();
        for (var k = 0; k < vals.length; k++) {
          if (String(vals[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
        }
      }
    }
  }

  if (targetRow) {
    sheet.getRange(targetRow, colIdx).setValue(url);
  }
}

// ─── updateCell ───────────────────────────────────────────────────────────────
function updateCell(body) {
  var sheetId   = body.sheetId   || "";
  var sheetName = body.sheetName || DEFAULT_SHEET_NAME;
  var srNo      = body.srNo;
  var column    = body.column;
  var value     = body.value;

  if (!sheetId || !column) return { ok: false, error: "sheetId and column required" };

  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: "Sheet not found" };

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { ok: false, error: "Sheet is empty" };
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx  = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === column) { colIdx = i + 1; break; }
  }
  
  if (colIdx === -1) {
    colIdx = lastCol + 1;
    if (colIdx > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }
    sheet.getRange(1, colIdx).setValue(column);
    sheet.getRange(1, colIdx).setFontWeight("bold").setBackground("#f3f3f3");
  }

  var srCol = -1;
  for (var j = 0; j < headers.length; j++) {
    var h = String(headers[j]).trim().toLowerCase();
    if (h === "sr no" || h === "sr_no" || h === "sr. no") { srCol = j + 1; break; }
  }
  if (srCol === -1) return { ok: false, error: "Sr No column not found" };

  var numRows = sheet.getLastRow() - 1;
  var targetRow = null;
  if (numRows > 0) {
    var rows = sheet.getRange(2, srCol, numRows, 1).getValues();
    for (var k = 0; k < rows.length; k++) {
      if (String(rows[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
    }
  }
  
  if (!targetRow) return { ok: false, error: "Sr No not found: " + srNo };

  sheet.getRange(targetRow, colIdx).setValue(value);
  return { ok: true };
}

// ─── syncDriveUrlsToSheet — bulk write URLs back ──────────────────────────────
function syncDriveUrlsToSheet(body) {
  var sheetId   = body.sheetId   || "";
  var sheetName = body.sheetName || DEFAULT_SHEET_NAME;
  var updates   = body.updates   || [];
  if (!sheetId || updates.length === 0) return { ok: true, updated: 0 };

  var updated = 0;
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    try {
      var res = updateCell({ sheetId: sheetId, sheetName: sheetName, srNo: u.srNo, column: u.column, value: u.url });
      if (res.ok) updated++;
    } catch(e) { Logger.log("syncBack error srNo=" + u.srNo + ": " + e); }
  }
  return { ok: true, updated: updated };
}

// ─── ensureHeaders ──────────────────────────────────────────────────────────────
function ensureHeaders(sheet, requiredHeaders) {
  var lastCol = sheet.getLastColumn();
  var existingHeaders = [];
  if (lastCol > 0) {
    existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
      return String(h).trim();
    });
  }

  var missingHeaders = [];
  requiredHeaders.forEach(function(h) {
    if (existingHeaders.indexOf(h) === -1) {
      missingHeaders.push(h);
    }
  });

  if (missingHeaders.length > 0) {
    var startCol = lastCol + 1;
    var requiredCols = startCol + missingHeaders.length - 1;
    if (requiredCols > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
    }
    sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
    sheet.getRange(1, 1, 1, requiredCols).setFontWeight("bold").setBackground("#f3f3f3");
  }
}

// ─── backupTravelRecord ───────────────────────────────────────────────────────
function backupTravelRecord(body) {
  var sheetId   = body.sheetId || "";
  var sheetName = body.sheetName || DEFAULT_SHEET_NAME;
  var record    = body.travelRecord || {};

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

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

  // Ensure all keys from recordMap exist as headers
  var expectedHeaders = Object.keys(recordMap);
  ensureHeaders(sheet, expectedHeaders);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var srNo = record.responses_sr_no;
  if (!srNo) return { ok: false, error: "Record missing responses_sr_no" };

  var srCol = -1;
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).trim() === "Sr No") { srCol = j + 1; break; }
  }

  if (srCol === -1) return { ok: false, error: "Sr No column not found" };

  var targetRow = null;
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, srCol, sheet.getLastRow() - 1, 1).getValues();
    for (var k = 0; k < rows.length; k++) {
      if (String(rows[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
    }
  }

  if (!targetRow) targetRow = sheet.getLastRow() + 1;

  var rowUpdates = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (recordMap[h] !== undefined && recordMap[h] !== null) {
      rowUpdates.push({ row: targetRow, col: c + 1, val: recordMap[h] });
    }
  }

  rowUpdates.forEach(function(u) {
    sheet.getRange(u.row, u.col).setValue(u.val);
  });

  return { ok: true, updatedFields: rowUpdates.length, targetRow: targetRow };
}

// ─── backupRegistration ───────────────────────────────────────────────────────
function backupRegistration(body) {
  var sheetId   = body.sheetId || "";
  var sheetName = body.sheetName || DEFAULT_SHEET_NAME;
  var record    = body.registration || {};

  if (!sheetId) return { ok: false, error: "sheetId required" };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var srNo = record.sr_no;
  if (!srNo) return { ok: false, error: "Record missing sr_no" };

  var recordMap = {
    "Sr No": record.sr_no,
    "Timestamp": record.timestamp_raw,
    "Title": record.title,
    "First Name": record.first_name,
    "Last Name": record.last_name,
    "Country Name": record.country_name,
    "Passport Country": record.passport_country,
    "Region": record.region,
    "Participant Mobile": record.participant_mobile,
    "Participant Email": record.participant_email,
    "Company Name": record.company_name,
    "Company Website": record.company_website,
    "Designation": record.designation,
    "Passport Number": record.passport_number,
    "Place of Issue": record.place_of_issue,
    "Date of Expiry": record.date_of_expiry,
    "Passport Front Copy": record.passport_front_copy,
    "Passport Back Copy": record.passport_back_copy,
    "Nature of Business": record.nature_of_business,
    "Main Import Product 1": record.main_import_product_1,
    "Main Import Product 2": record.main_import_product_2,
    "Proof Upload": record.proof_upload,
    "Products/Services": record.products_services,
    "Business Card Upload": record.business_card_upload,
    "POC": record.poc,
    "Proof Import": record.proof_import,
    "Type of POI": record.type_of_poi,
    "B/L Supplier Country": record.bl_supplier_country,
    "B/L Buyer Country": record.bl_buyer_country,
    "Status": record.status,
    "Flight & Hotel": record.flight_hotel_code,
    "Remarks": record.remarks,
    "B/L Status": record.bl_status,
    "BB Invitation letter status": record.bb_invitation_status,
    "Drive Passport Front URL": record.drive_passport_front_url,
    "Drive Passport Back URL": record.drive_passport_back_url,
    "Drive Proof URL": record.drive_proof_url,
    "Drive Business Card URL": record.drive_business_card_url
  };

  var expectedHeaders = Object.keys(recordMap);
  ensureHeaders(sheet, expectedHeaders);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var srCol = -1;
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).trim() === "Sr No") { srCol = j + 1; break; }
  }

  if (srCol === -1) return { ok: false, error: "Sr No column not found" };

  var targetRow = null;
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, srCol, sheet.getLastRow() - 1, 1).getValues();
    for (var k = 0; k < rows.length; k++) {
      if (String(rows[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
    }
  }

  if (!targetRow) targetRow = sheet.getLastRow() + 1;

  var rowUpdates = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (recordMap[h] !== undefined && recordMap[h] !== null) {
      rowUpdates.push({ row: targetRow, col: c + 1, val: recordMap[h] });
    }
  }

  rowUpdates.forEach(function(u) {
    sheet.getRange(u.row, u.col).setValue(u.val);
  });

  return { ok: true, updatedFields: rowUpdates.length };
}

// ─── exportToExcel ─────────────────────────────────────────────────────────────
function exportToExcel(body) {
  var sheetId  = body.sheetId;
  var fileName = body.fileName || "Export";
  var folderId = body.folderId || "";

  if (!sheetId) return { ok: false, error: "sheetId required" };

  try {
    var url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/export?format=xlsx";
    var params = {
      method: "get",
      headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    };
    var blob = UrlFetchApp.fetch(url, params).getBlob().setName(fileName + ".xlsx");
    
    var folder;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); }
      catch(e) { folder = DriveApp.getRootFolder(); }
    } else {
      var fi = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
      folder = fi.hasNext() ? fi.next() : DriveApp.createFolder(DEFAULT_FOLDER_NAME);
    }
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { 
      ok: true, 
      fileId: file.getId(),
      downloadLink: file.getDownloadUrl(),
      webViewLink: file.getUrl()
    };
  } catch(err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
