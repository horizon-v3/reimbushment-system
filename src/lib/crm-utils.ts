// ─── Registration Types ────────────────────────────────────────────────────────
export type RegistrationRow = {
  id: number;
  sr_no: number | null;
  timestamp_raw: string | null;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  country_name: string | null;
  passport_country: string | null;
  region: string | null;
  participant_mobile: string | null;
  participant_email: string | null;
  company_name: string | null;
  company_website: string | null;
  designation: string | null;
  passport_number: string | null;
  place_of_issue: string | null;
  date_of_expiry: string | null;
  passport_front_copy: string | null;
  passport_back_copy: string | null;
  nature_of_business: string | null;
  main_import_product_1: string | null;
  main_import_product_2: string | null;
  proof_upload: string | null;
  products_services: string | null;
  business_card_upload: string | null;
  poc: string | null;
  proof_import: string | null;
  type_of_poi: string | null;
  bl_supplier_country: string | null;
  bl_buyer_country: string | null;
  status: string | null;
  flight_hotel_code: string | null;
  remarks: string | null;
  bl_status: string | null;
  bb_invitation_status: string | null;
  dollar_business: string | null;   // GAS: dollarBusiness alias
  vujis: string | null;             // GAS: vujis alias
  drive_passport_front_url: string | null;
  drive_passport_back_url: string | null;
  drive_proof_url: string | null;
  drive_business_card_url: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
};


export type TravelRow = {
  id: number;
  registration_id: number | null;
  responses_sr_no: string | null;
  room_no: string | null;
  hotel_name: string | null;
  initial: string | null;
  first_name: string | null;
  last_name: string | null;
  country_name: string | null;
  country_code: string | null;
  participant_mobile: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_units: string | null;
  arrival_date: string | null;
  arrival_flight_no: string | null;
  arrival_to: string | null;
  arrival_time: string | null;
  departure_date: string | null;
  departure_flight_no: string | null;
  departure_from: string | null;
  departure_time: string | null;
  sector: string | null;
  company_name: string | null;
  poc: string | null;
  status: string | null;
  reimbursement: string | null;
  notes: string | null;
  invoice_amount: string | null;
  invoice_amount_usd: string | null;
  invoice_amount_local: string | null;
  invoice_currency: string | null;
  ticket_received: string | null;
  invoice_received: string | null;
  visa_received: string | null;
  passport_copy_received: string | null;
  voucher_received: string | null;
  reimbursement_amount: string | null;
  bl: string | null;
  bl_url: string | null;
  ticket_url: string | null;
  invoice_url: string | null;
  visa_url: string | null;
  passport_url: string | null;
  voucher_url: string | null;
  business_card_url: string | null;
  ticket_drive_id: string | null;
  invoice_drive_id: string | null;
  visa_drive_id: string | null;
  passport_drive_id: string | null;
  voucher_drive_id: string | null;
  business_card_drive_id: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
};

export type AppSettingsRow = {
  id: number;
  registration_sheet_id: string | null;
  registration_sheet_name: string | null;
  travel_sheet_name: string | null;
  drive_folder_id: string | null;
  gas_web_app_url: string | null;
  updated_at: string;
};

// ─── Pure utility helpers — mirroring GAS frontend logic exactly ─────────────

/**
 * Exact port of GAS textOf(): lowercase, strip non-alphanumeric to spaces, trim.
 * Used for all comparison/normalization throughout.
 */
function textOf(...args: (string | null | undefined)[]): string {
  return args.filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Exact port of GAS companyKey():
 *   textOf(name)
 *   → remove stopwords as whole words
 *   → collapse all spaces
 *   → remove trailing suffix (post-space-collapse)
 */
export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  let s = textOf(name);
  // Remove stopwords with word boundaries (matches GAS \b...\b regex)
  s = s.replace(/\b(the|ltd|limited|llc|inc|corp|corporation|co|company|pvt|private|fzc|fze|llp)\b/g, " ");
  // Collapse whitespace
  s = s.replace(/\s+/g, "");
  // Remove trailing suffix without boundary (catches post-collapse leftovers)
  s = s.replace(/(ltd|limited|llc|inc|corp|corporation|co|company|pvt|private|fzc|fze|llp)$/, "");
  return s.trim();
}

export function isYes(v: string | null | undefined): boolean {
  if (!v) return false;
  return ["yes", "y", "true", "1"].includes(String(v).trim().toLowerCase());
}

/**
 * Exact port of GAS verified():
 *   1. If blStatus contains "not verified" → false
 *   2. If blStatus contains "verified"     → true
 *   3. If proofImport contains "yes"       → true
 *   4. Otherwise                           → false
 */
export function isVerified(r: RegistrationRow): boolean {
  const b = textOf(r.bl_status);
  if (b.includes("not verified")) return false;
  if (b.includes("verified")) return true;
  return textOf(r.proof_import).includes("yes");
}

/**
 * Exact port of GAS supportLabel():
 *   Strips all whitespace from the code then matches:
 *   fh | f/h | hf → "FH"  (Hotel + Flight)
 *   h  | hotel    → "H"   (Only Hotel)
 *   else          → "NONE" (Nothing / No Support)
 */
export type FHCategory = "FH" | "H" | "F" | "NONE";
export function fhCategory(code: string | null | undefined): FHCategory {
  const s = textOf(code).replace(/\s+/g, "");
  if (["fh", "f/h", "hf", "h/f"].includes(s)) return "FH";
  if (s === "h" || s === "hotel") return "H";
  if (s === "f" || s === "flight") return "F";
  return "NONE";
}

/**
 * Excluded countries — uses textOf normalization to match GAS:
 *   ["sri lanka", "nepal", "bangladesh"].indexOf(textOf(countryForCount)) !== -1
 */
const EXCLUDED_COUNTRIES = ["sri lanka", "nepal", "bangladesh"];
export function isExcludedCountry(c: string | null | undefined): boolean {
  if (!c) return false;
  return EXCLUDED_COUNTRIES.includes(textOf(c));
}

/**
 * Exact port of GAS isCeramic:
 *   category === "Ceramic Tiles" fires when textOf(products) includes "ceramic"
 *   OR textOf(product1, product2) directly includes "ceramic"
 *
 * IMPORTANT: GAS classifyCategory separates "Ceramic Tiles" and "Sanitaryware"
 * as different categories. isCeramic only checks for "ceramic" — NOT "sanitary".
 * The KPI label is "Ceramic & Sanitaryware" (renamed by user) but the COUNT
 * mirrors GAS exactly: only rows containing the word "ceramic" in their products.
 * Expected result: 399 (matches GAS group message: "Total Ceramic :- 399")
 */
export function hasCeramic(r: RegistrationRow): boolean {
  const t = textOf(r.main_import_product_1, r.main_import_product_2, r.products_services);
  return t.includes("ceramic");
}

/**
 * computeKpis — mirrors GAS renderKpis() exactly:
 *
 *   total           = registrations.length                  (all rows)
 *   uniqueCompanies = Set(companyKey).size                  (deduped)
 *   verified        = rows.filter(verified).length          (ALL rows, NOT unique)
 *   notVerified     = total - verified                      (ALL rows)
 *   fh              = rows where support === "Hotel + Flight" (ALL rows)
 *   onlyHotel       = rows where support === "Only Hotel"    (ALL rows)
 *   nothing         = rows where support === "Nothing"       (ALL rows)
 *   nonComplimentary= fh + onlyHotel                        (Hotel + Flight ∪ Only Hotel)
 *   ceramic         = rows where isCeramic ("ceramic" in products)  (ALL rows)
 *   nonCeramic      = total - ceramic                               (ALL rows)
 *   totalNoExcl     = rows excl SL/NP/BD
 *   uniqueNoExcl    = unique companies excl SL/NP/BD
 *   willNotAttend   = rows where status includes "not attend" or "cancel"
 */
export function computeKpis(rows: RegistrationRow[]) {
  const total = rows.length;

  // Unique companies — companyKey dedup (matching GAS Set(companyKey))
  const uniqueCompanies = new Set(
    rows.map((r) => normalizeCompany(r.company_name)).filter(Boolean)
  ).size;

  // Verified / Not Verified — PER ROW (matching GAS: registrations.filter(r => r.verified).length)
  const verified    = rows.filter(isVerified).length;
  const notVerified = total - verified;

  // Flight+Hotel support — PER ROW
  const fh        = rows.filter((r) => fhCategory(r.flight_hotel_code) === "FH").length;
  const onlyHotel = rows.filter((r) => fhCategory(r.flight_hotel_code) === "H").length;
  const nothing   = rows.filter((r) => fhCategory(r.flight_hotel_code) === "NONE").length;
  // Non-Complimentary Services = Total Delegates - (Hotel + Flight + Only Hotel)
  const nonComplimentary = total - (fh + onlyHotel);

  // Excl SL/NP/BD
  const filteredRows  = rows.filter((r) => !isExcludedCountry(r.country_name ?? r.passport_country));
  const totalNoExcl   = filteredRows.length;
  const uniqueNoExcl  = new Set(
    filteredRows.map((r) => normalizeCompany(r.company_name)).filter(Boolean)
  ).size;

  // Will Not Attend — textOf normalization matching GAS
  const willNotAttend = rows.filter((r) => {
    const s = textOf(r.status);
    return s.includes("not attend") || s.includes("cancel");
  }).length;

  // Ceramic & Sanitaryware — PER ROW (matching GAS: registrations.filter(r => r.isCeramic).length)
  const ceramicAndSanitaryware = rows.filter(hasCeramic).length;
  const ceramic    = ceramicAndSanitaryware; // alias
  const nonCeramic = total - ceramicAndSanitaryware;

  // Without BL / Dollar biz / Vujis
  // GAS message line: "With out BL / Dollar biz / Vujis : - 129"
  // = rows where proof_import is blank/no AND dollar_business is blank AND vujis is blank
  const withoutBlDollarVujis = rows.filter((r) => {
    const noProof  = !textOf(r.proof_import) || textOf(r.proof_import) === "no";
    const noDollar = !textOf(r.dollar_business);
    const noVujis  = !textOf(r.vujis);
    return noProof && noDollar && noVujis;
  }).length;

  return {
    total, uniqueCompanies, verified, notVerified,
    fh, onlyHotel, nothing, nonComplimentary,
    totalNoExcl, uniqueNoExcl, willNotAttend,
    ceramic, ceramicAndSanitaryware, nonCeramic,
    withoutBlDollarVujis,
  };
}


export function pivotCount<T>(rows: T[], keyFn: (r: T) => string | null | undefined): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = keyFn(r);
    if (raw == null) continue;
    // Strip ALL whitespace variants including \r\n from TSV parsing
    const k = String(raw).replace(/[\r\n\t]+/g, " ").trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function fmtDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function fmtDateSlash(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function extractCountryCode(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const m = mobile.match(/\+?(\d{1,4})/);
  return m ? "+" + m[1] : "";
}

export function parseAnyDate(dStr: string | null | undefined): Date | null {
  if (!dStr) return null;
  const d = new Date(dStr);
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY
  const parts = dStr.split(/[\/\-\s:]+/);
  if (parts.length >= 3) {
    // If first part is > 12, it's definitely DD/MM/YYYY
    // Just blindly try DD/MM/YYYY as fallback
    const [dd, mm, yyyy] = parts.map(Number);
    const d2 = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

export function generateGroupMessage(rows: RegistrationRow[], date: Date): string {
  // Today's registrations (by timestamp)
  const today = rows.filter((r) => {
    const t = parseAnyDate(r.timestamp_raw ?? r.created_at);
    if (!t) return false;
    return sameYMD(t, date);
  });
  const k = computeKpis(rows);
  const byCountry = pivotCount(today, (r) => r.country_name ?? r.passport_country);
  const dateStr = fmtDateDDMMYYYY(date);
  const countryLine = byCountry.map((c) => `${c.label} :- ${c.count}`).join(" , ") || "No registrations today.";

  // Exactly mirrors the GAS group message format:
  return [
    `*${dateStr} Today's Reg - ${String(today.length).padStart(2, "0")}*`,
    "",
    countryLine,
    "",
    `> *Overall count of delegates Total :- ${k.total}*`,
    "",
    `Total count of delegates Without Sri-Lanka, Nepal & Bangladesh :-${k.totalNoExcl}`,
    `Unique number companies : - ${k.uniqueCompanies}`,
    `Will Not Attend :-  ${k.willNotAttend}`,
    `Unique number companies Without Sri-Lanka, Nepal & Bangladesh :- ${k.uniqueNoExcl}`,
    `With out BL / Dollar biz / Vujis : - ${k.withoutBlDollarVujis}`,
    `Total Ceramic : - ${k.ceramic}`,
    `Total Non Ceramic : - ${k.nonCeramic}`,
  ].join("\n");
}

export function generateTicketReport(records: TravelRow[]): string {
  const tickets = records.filter((r) => isYes(r.ticket_received));
  const total = tickets.length;
  const byPoc = pivotCount(tickets, (r) => r.poc);
  const byCountry = pivotCount(tickets, (r) => r.country_name);
  const date = fmtDateSlash(new Date());
  const pocLines = byPoc.map((p) => `${p.label} - ${p.count}`).join("\n");
  const countryLines = byCountry.map((c) => `${c.label} - ${c.count}`).join("\n");
  return `Total Ticket's Received Till Date\nDate:- ${date}\n\nTicket's Received Till Date :- ${total}\n\n${pocLines}\n\n${countryLines}\n\nTotal Tickets :- ${total}\n`;
}

export function generateCountryGroupMessages(
  rows: RegistrationRow[],
  date: Date,
): { country: string; count: number; message: string }[] {
  const today = rows.filter((r) => {
    const t = parseAnyDate(r.timestamp_raw ?? r.created_at);
    if (!t) return false;
    return sameYMD(t, date);
  });
  const byCountry = new Map<string, RegistrationRow[]>();
  for (const r of today) {
    const key = (r.country_name ?? r.passport_country ?? "(Unknown)").trim() || "(Unknown)";
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key)!.push(r);
  }
  const dateStr = fmtDateDDMMYYYY(date);
  return Array.from(byCountry.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([country, list]) => {
      const lines = list.map((r, i) => {
        const name = [r.title, r.first_name, r.last_name].filter(Boolean).join(" ");
        const company = r.company_name ?? "";
        const sector = r.main_import_product_1 ?? "";
        return `${i + 1}. ${name}${company ? " — " + company : ""}${sector ? " (" + sector + ")" : ""}`;
      }).join("\n");
      const message = `*${country} — ${dateStr}*\nNew Registrations: ${list.length}\n\n${lines}`;
      return { country, count: list.length, message };
    });
}

import Papa from "papaparse";

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  if (!parsed.data.length) return { headers: [], rows: [] };
  const rawHeaders = parsed.data[0];
  const headers = rawHeaders.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "_"));
  const rows = parsed.data.slice(1).map((cells) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}

export function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

// CSV column header map for TravelDesk bulk import
export const CSV_HEADER_MAP: Record<string, string> = {
  responses_sr_no: "responses_sr_no", sr_no: "responses_sr_no",
  room_no: "room_no", room_number: "room_no",
  hotel_name: "hotel_name", hotel: "hotel_name",
  initial: "initial", title: "initial",
  first_name: "first_name", last_name: "last_name",
  country_name: "country_name", country: "country_name",
  country_code: "country_code",
  participant_mobile: "participant_mobile", mobile: "participant_mobile",
  whatsapp: "participant_mobile", whatsapp_number: "participant_mobile",
  check_in_date: "check_in_date", check_in: "check_in_date",
  check_out_date: "check_out_date", check_out: "check_out_date",
  occupancy: "room_units", room_units: "room_units",
  arrival_date: "arrival_date", date_of_arrival_at_delhi: "arrival_date",
  arrival_flight_no: "arrival_flight_no", arrival_flight: "arrival_flight_no",
  arrival_to: "arrival_to", arrival_time: "arrival_time",
  departure_date: "departure_date", date_of_travel: "departure_date",
  departure_flight_no: "departure_flight_no", departure_flight: "departure_flight_no",
  departure_from: "departure_from", departure_time: "departure_time", dep_time: "departure_time",
  sector: "sector",
  company_name: "company_name", companies: "company_name", company: "company_name",
  poc: "poc", status: "status", reimbursement: "reimbursement",
  remarks: "notes", notes: "notes",
  invoice_amount: "invoice_amount",
  invoice_amount_in_usd: "invoice_amount_usd", invoice_amount_usd: "invoice_amount_usd",
  ticket: "ticket_received", ticket_received: "ticket_received",
  invoice: "invoice_received", invoice_received: "invoice_received",
  visa: "visa_received", visa_received: "visa_received",
  passport_copy: "passport_copy_received", passport_copy_received: "passport_copy_received",
  hotel_voucher: "voucher_received", voucher_received: "voucher_received",
};
