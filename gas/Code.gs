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
    if (action === "uploadFile")  return jsonResponse(uploadFile(body));
    if (action === "updateCell")  return jsonResponse(updateCell(body));
    if (action === "syncBack")    return jsonResponse(syncDriveUrlsToSheet(body));
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

  if (!base64Data) return { ok: false, error: "No base64Data" };

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

  // Get or create folder
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
  var fileId  = file.getId();
  var fileUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";

  // Write URL back to sheet
  if (sheetId && sheetColumn && (rowIndex || srNo)) {
    try { writeUrlToSheet(sheetId, sheetName, sheetColumn, rowIndex, srNo, fileUrl); }
    catch(e) { Logger.log("writeUrlToSheet error: " + e); }
  }

  return { ok: true, url: fileUrl, fileId: fileId };
}

// ─── writeUrlToSheet ──────────────────────────────────────────────────────────
function writeUrlToSheet(sheetId, sheetName, sheetColumn, rowIndex, srNo, url) {
  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Find column index by header name
  var colIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === sheetColumn) { colIdx = i + 1; break; }
  }
  if (colIdx === -1) return;

  // Find row
  var targetRow = null;
  if (rowIndex) {
    targetRow = parseInt(rowIndex);
  } else if (srNo) {
    var srCol = -1;
    for (var j = 0; j < headers.length; j++) {
      if (String(headers[j]).trim() === "Sr No") { srCol = j + 1; break; }
    }
    if (srCol > 0) {
      var vals = sheet.getRange(2, srCol, sheet.getLastRow() - 1, 1).getValues();
      for (var k = 0; k < vals.length; k++) {
        if (String(vals[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
      }
    }
  }

  if (targetRow) sheet.getRange(targetRow, colIdx).setValue(url);
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

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx  = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === column) { colIdx = i + 1; break; }
  }
  if (colIdx === -1) return { ok: false, error: "Column not found: " + column };

  var srCol = -1;
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).trim() === "Sr No") { srCol = j + 1; break; }
  }
  if (srCol === -1) return { ok: false, error: "Sr No column not found" };

  var rows = sheet.getRange(2, srCol, sheet.getLastRow() - 1, 1).getValues();
  var targetRow = null;
  for (var k = 0; k < rows.length; k++) {
    if (String(rows[k][0]).trim() === String(srNo)) { targetRow = k + 2; break; }
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

// ─── Helper ───────────────────────────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
