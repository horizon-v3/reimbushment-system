"use client";
import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Download, Upload, Pencil, Trash2, RefreshCw, Copy } from "lucide-react";
import * as XLSX from "xlsx";
import {
  type RegistrationRow, type TravelRow,
  isYes, pivotCount, generateTicketReport,
  extractCountryCode, CSV_HEADER_MAP, parseCsv,
} from "@/lib/crm-utils";
import { uploadFileToDrive } from "@/lib/gas-client";

const fetcher = (u: string) => fetch(u).then(r => r.json());

const EMPTY_FORM = {
  registration_id: "", responses_sr_no: "", room_no: "", hotel_name: "",
  initial: "", first_name: "", last_name: "", country_name: "", country_code: "",
  participant_mobile: "", check_in_date: "", check_out_date: "", room_units: "1",
  arrival_date: "", arrival_flight_no: "", arrival_to: "Indira Gandhi International Airport(DEL)",
  arrival_time: "", departure_date: "", departure_flight_no: "",
  departure_from: "Indira Gandhi International Airport(DEL)", departure_time: "",
  sector: "", company_name: "", poc: "", status: "Pending", reimbursement: "No",
  notes: "", invoice_amount: "", invoice_amount_usd: "",
  ticket_received: "No", invoice_received: "No", visa_received: "No",
  passport_copy_received: "No", voucher_received: "No",
};
type FormState = typeof EMPTY_FORM;
type FileMap = { ticket?: File; invoice?: File; visa?: File; passport?: File; voucher?: File };

export default function TravelDeskPage() {
  const { data: regsData } = useSWR<{ rows: RegistrationRow[] }>("/api/registrations?limit=5000", fetcher);
  const { data: travData, mutate } = useSWR<{ rows: TravelRow[] }>("/api/travel?limit=5000", fetcher);
  const regs = regsData?.rows ?? [];
  const records = travData?.rows ?? [];

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [files, setFiles] = useState<FileMap>({});
  const [saving, setSaving] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const reset = () => { setForm(EMPTY_FORM); setFiles({}); setEditId(null); };

  const onSelectDelegate = useCallback((id: string) => {
    const r = regs.find(x => String(x.id) === id);
    if (!r) return;
    setForm(f => ({
      ...f, registration_id: id,
      responses_sr_no: String(r.sr_no ?? ""),
      initial: r.title ?? "", first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      country_name: r.country_name ?? r.passport_country ?? "",
      participant_mobile: r.participant_mobile ?? "",
      country_code: extractCountryCode(r.participant_mobile),
      sector: r.main_import_product_1 ?? "",
      company_name: r.company_name ?? "", poc: r.poc ?? "",
    }));
  }, [regs]);

  const uploadFile = async (file: File, docType: string) => {
    const delegateName = `${form.responses_sr_no} ${form.first_name} ${form.last_name}`;
    const res = await uploadFileToDrive(file, {
      delegateName, subFolderName: delegateName.trim() || "Delegates", docType,
    });
    return res.ok ? { url: res.webViewLink, driveId: res.fileId } : null;
  };

  const save = async () => {
    if (!form.first_name?.trim()) return toast.error("Select a delegate first");
    setSaving(true);
    try {
      const urlMap: Record<string, string> = {};
      const fileEntries: [keyof FileMap, string][] = [
        ["ticket", "ticket"], ["invoice", "invoice"], ["visa", "visa"],
        ["passport", "passport"], ["voucher", "voucher"],
      ];
      for (const [key, docType] of fileEntries) {
        if (files[key]) {
          const r = await uploadFile(files[key]!, docType);
          if (r) { urlMap[`${docType}_url`] = r.url; urlMap[`${docType}_drive_id`] = r.driveId ?? ""; }
        }
      }
      const payload = { ...form, registration_id: form.registration_id || null, ...urlMap };
      const res = await fetch("/api/travel", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, record: payload } : { record: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editId ? "Travel record updated ✓" : "Travel record saved ✓");
      reset(); mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const editRecord = (r: TravelRow) => {
    setEditId(r.id);
    setForm({
      registration_id: String(r.registration_id ?? ""),
      responses_sr_no: r.responses_sr_no ?? "", room_no: r.room_no ?? "",
      hotel_name: r.hotel_name ?? "", initial: r.initial ?? "",
      first_name: r.first_name ?? "", last_name: r.last_name ?? "",
      country_name: r.country_name ?? "", country_code: r.country_code ?? "",
      participant_mobile: r.participant_mobile ?? "",
      check_in_date: r.check_in_date ?? "", check_out_date: r.check_out_date ?? "",
      room_units: r.room_units ?? "1", arrival_date: r.arrival_date ?? "",
      arrival_flight_no: r.arrival_flight_no ?? "",
      arrival_to: r.arrival_to ?? "Indira Gandhi International Airport(DEL)",
      arrival_time: r.arrival_time ?? "", departure_date: r.departure_date ?? "",
      departure_flight_no: r.departure_flight_no ?? "",
      departure_from: r.departure_from ?? "Indira Gandhi International Airport(DEL)",
      departure_time: r.departure_time ?? "", sector: r.sector ?? "",
      company_name: r.company_name ?? "", poc: r.poc ?? "",
      status: r.status ?? "Pending", reimbursement: r.reimbursement ?? "No",
      notes: r.notes ?? "", invoice_amount: r.invoice_amount ?? "",
      invoice_amount_usd: r.invoice_amount_usd ?? "",
      ticket_received: r.ticket_received ?? "No", invoice_received: r.invoice_received ?? "No",
      visa_received: r.visa_received ?? "No", passport_copy_received: r.passport_copy_received ?? "No",
      voucher_received: r.voucher_received ?? "No",
    });
    setFiles({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRecord = async (id: number) => {
    if (!confirm("Delete this travel record?")) return;
    const res = await fetch(`/api/travel?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); mutate(); }
    else toast.error("Delete failed");
  };

  const downloadXlsx = () => {
    const aoa: unknown[][] = [[
      "Sr No","Resp Sr","Room No","Hotel","Initial","First Name","Last Name",
      "Country","Code","Mobile","Check In","Check Out","Occupancy",
      "Arrival Date","Arr Flight","Arr To","Arr Time",
      "Dep Date","Dep Flight","Dep From","Dep Time",
      "Sector","Company","POC","Status","Reimb","Notes","Inv Amt","Inv USD",
      "Ticket","Invoice","Visa","Passport","Voucher",
      "Ticket URL","Invoice URL","Visa URL","Passport URL","Voucher URL","ID","Updated",
    ]];
    records.forEach((r, i) => aoa.push([
      i+1, r.responses_sr_no, r.room_no, r.hotel_name, r.initial, r.first_name, r.last_name,
      r.country_name, r.country_code, r.participant_mobile, r.check_in_date, r.check_out_date, r.room_units,
      r.arrival_date, r.arrival_flight_no, r.arrival_to, r.arrival_time,
      r.departure_date, r.departure_flight_no, r.departure_from, r.departure_time,
      r.sector, r.company_name, r.poc, r.status, r.reimbursement, r.notes, r.invoice_amount, r.invoice_amount_usd,
      r.ticket_received, r.invoice_received, r.visa_received, r.passport_copy_received, r.voucher_received,
      r.ticket_url, r.invoice_url, r.visa_url, r.passport_url, r.voucher_url, r.id, r.updated_at,
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Travel Desk Records");
    XLSX.writeFile(wb, "Travel_Desk_BB_Format.xlsx");
    toast.success("Excel exported");
  };

  const ticketReport = useMemo(() => generateTicketReport(records), [records]);
  const ticketRecords = records.filter(r => isYes(r.ticket_received));
  const tCountry = pivotCount(ticketRecords, r => r.country_name);
  const tSector = pivotCount(ticketRecords, r => r.sector);
  const tPoc = pivotCount(ticketRecords, r => r.poc);

  const FLD = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className="label">{label}</label>{children}</div>
  );
  const SEL = ({ label, k, opts }: { label: string; k: keyof FormState; opts: string[] }) => (
    <FLD label={label}>
      <select className="input" value={form[k] as string} onChange={e => set(k, e.target.value)}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </FLD>
  );

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.625rem", fontWeight: 700 }}>Travel Desk</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            {records.length} records · {ticketRecords.length} tickets received
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-secondary" onClick={() => setShowBulk(!showBulk)}><Upload size={14} /> Bulk CSV</button>
          <button className="btn-primary" onClick={downloadXlsx}><Download size={14} /> Export XLSX</button>
          <button className="btn-secondary" onClick={() => mutate()}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Form */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>{editId ? "Edit Travel Record" : "New Travel Record"}</h3>
          {editId && <button className="btn-secondary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8125rem" }} onClick={reset}>Cancel Edit</button>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
          <FLD label="Delegate">
            <select className="input" value={form.registration_id} onChange={e => onSelectDelegate(e.target.value)}>
              <option value="">Select a delegate…</option>
              {regs.map(r => <option key={r.id} value={String(r.id)}>{r.sr_no}. {r.first_name} {r.last_name} | {r.country_name ?? ""}</option>)}
            </select>
          </FLD>
          {(["responses_sr_no","initial","first_name","last_name","country_name","participant_mobile","country_code","company_name","sector","poc","room_no","hotel_name","arrival_flight_no","arrival_to","departure_flight_no","departure_from","invoice_amount","invoice_amount_usd"] as (keyof FormState)[]).map(k => (
            <FLD key={k} label={k.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase())}>
              <input className="input" value={form[k] as string}
                readOnly={["responses_sr_no","initial","first_name","last_name","country_name","participant_mobile","company_name","sector","poc"].includes(k)}
                onChange={e => set(k, e.target.value)} />
            </FLD>
          ))}
          {(["check_in_date","check_out_date","arrival_date","departure_date"] as (keyof FormState)[]).map(k => (
            <FLD key={k} label={k.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase())}>
              <input type="date" className="input" value={form[k] as string} onChange={e => set(k, e.target.value)} />
            </FLD>
          ))}
          {(["arrival_time","departure_time"] as (keyof FormState)[]).map(k => (
            <FLD key={k} label={k.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase())}>
              <input type="time" className="input" value={form[k] as string} onChange={e => set(k, e.target.value)} />
            </FLD>
          ))}
          <SEL label="Occupancy" k="room_units" opts={["1","0.5"]} />
          <SEL label="Status" k="status" opts={["Confirmed","Can't Verify","Pending","Cancelled"]} />
          <SEL label="Reimbursement" k="reimbursement" opts={["Yes","No"]} />
          <SEL label="Ticket Received" k="ticket_received" opts={["Yes","No"]} />
          <SEL label="Invoice Received" k="invoice_received" opts={["Yes","No"]} />
          <SEL label="Visa Received" k="visa_received" opts={["Yes","No"]} />
          <SEL label="Passport Copy" k="passport_copy_received" opts={["Yes","No"]} />
          <SEL label="Voucher Received" k="voucher_received" opts={["Yes","No"]} />
          {(["ticket","invoice","visa","passport","voucher"] as (keyof FileMap)[]).map(k => (
            <FLD key={k} label={`${k.charAt(0).toUpperCase()+k.slice(1)} File (Drive Upload)`}>
              <input type="file" className="input" style={{ padding: "0.375rem" }} onChange={e => setFiles(f => ({ ...f, [k]: e.target.files?.[0] }))} />
            </FLD>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="label">Remarks / Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} style={{ resize: "vertical" }} />
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : (editId ? "Update Record" : "Save Travel Record")}
          </button>
        </div>
      </div>

      {/* Bulk CSV upload */}
      {showBulk && <BulkCsvUpload regs={regs} onDone={() => { mutate(); setShowBulk(false); }} />}

      {/* Stats pills */}
      <div className="glass-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {[
          ["Total Records", records.length],
          ["Tickets Received", records.filter(r => isYes(r.ticket_received)).length],
          ["Invoices Received", records.filter(r => isYes(r.invoice_received)).length],
          ["Visa Received", records.filter(r => isYes(r.visa_received)).length],
        ].map(([l, v]) => (
          <span key={l as string} className="badge badge-neutral" style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}>
            {l}: <strong style={{ marginLeft: 4 }}>{v}</strong>
          </span>
        ))}
      </div>

      {/* Records table */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
        <h3 style={{ fontWeight: 600, marginBottom: "0.875rem" }}>Travel Records</h3>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            <table className="data-table">
              <thead><tr>
                {["#","Sr","Name","Country","Company","Sector","POC","Status","Ticket","Invoice","Visa","Passport","Actions"].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {records.length === 0 && <tr><td colSpan={13} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>No travel records yet.</td></tr>}
                {records.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: "var(--color-text-tertiary)" }}>{i + 1}</td>
                    <td>{r.responses_sr_no}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{[r.initial, r.first_name, r.last_name].filter(Boolean).join(" ")}</td>
                    <td>{r.country_name}</td>
                    <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company_name}</td>
                    <td>{r.sector}</td>
                    <td>{r.poc}</td>
                    <td><span className={`badge ${r.status === "Confirmed" ? "badge-success" : r.status === "Cancelled" ? "badge-danger" : "badge-warning"}`}>{r.status}</span></td>
                    {(["ticket_received","invoice_received","visa_received","passport_copy_received"] as (keyof TravelRow)[]).map(k => (
                      <td key={k}><span className={`badge ${isYes(r[k] as string) ? "badge-success" : "badge-neutral"}`}>{isYes(r[k] as string) ? "Yes" : "No"}</span></td>
                    ))}
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button className="btn-secondary" style={{ padding: "0.25rem" }} onClick={() => editRecord(r)}><Pencil size={13} /></button>
                        <button className="btn-secondary" style={{ padding: "0.25rem", color: "var(--color-danger)" }} onClick={() => deleteRecord(r.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ticket Report */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ fontWeight: 600 }}>Till Date Ticket Report</h3>
          <button className="btn-secondary" style={{ fontSize: "0.8125rem" }} onClick={async () => { await navigator.clipboard.writeText(ticketReport); toast.success("Copied"); }}>
            <Copy size={13} /> Copy
          </button>
        </div>
        <textarea readOnly value={ticketReport} rows={10} className="input mono" style={{ fontSize: "0.8125rem", lineHeight: 1.6 }} />
      </div>

      {/* Pivot mini grids */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        {[
          { title: "Country-wise (Tickets)", rows: tCountry },
          { title: "Sector-wise (Tickets)", rows: tSector },
          { title: "POC-wise (Tickets)", rows: tPoc },
        ].map(({ title, rows: pr }) => (
          <div key={title} className="glass-card" style={{ padding: "1rem" }}>
            <h4 style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.75rem" }}>{title}</h4>
            {pr.slice(0, 10).map(({ label, count }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid var(--color-border)", fontSize: "0.8125rem" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--color-accent)", flexShrink: 0, marginLeft: 8 }}>{count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bulk CSV Upload ──────────────────────────────────────────────────────────
function BulkCsvUpload({ regs, onDone }: { regs: RegistrationRow[]; onDone: () => void }) {
  const [preview, setPreview] = useState<{ rows: Record<string,unknown>[]; errors: {row:number;reason:string}[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const normalizeYesNo = (v: string) => ["yes","y","true","1"].includes(v.toLowerCase()) ? "Yes" : "No";
  const normalizeDate = (v: string): string | null => {
    const s = v.trim(); if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { let y = m[3]; if (y.length===2) y="20"+y; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
    const dt = new Date(s); return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0,10);
  };
  const DATE_COLS = new Set(["check_in_date","check_out_date","arrival_date","departure_date"]);
  const YESNO_COLS = new Set(["ticket_received","invoice_received","visa_received","passport_copy_received","voucher_received","reimbursement"]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name);
    const { headers, rows } = parseCsv(await file.text());
    if (!headers.length) return toast.error("CSV is empty");
    const regBySr = new Map(regs.filter(r => r.sr_no != null).map(r => [String(r.sr_no), r]));
    const errors: {row:number;reason:string}[] = [];
    const out: Record<string,unknown>[] = [];
    rows.forEach((raw, idx) => {
      const mapped: Record<string,unknown> = {};
      for (const [src, val] of Object.entries(raw)) {
        const dest = CSV_HEADER_MAP[src]; if (!dest) continue;
        let v: unknown = val;
        if (DATE_COLS.has(dest)) v = normalizeDate(val);
        else if (YESNO_COLS.has(dest)) v = normalizeYesNo(val);
        else if (dest === "room_units") v = val ? Number(val) : null;
        else v = val.trim() || null;
        mapped[dest] = v;
      }
      const sr = String(mapped.responses_sr_no ?? "").trim();
      const reg = sr ? regBySr.get(sr) : undefined;
      if (reg) { mapped.registration_id = String(reg.id); if (!mapped.first_name) mapped.first_name = reg.first_name; if (!mapped.last_name) mapped.last_name = reg.last_name; }
      if (!mapped.first_name && !mapped.last_name) { errors.push({ row: idx+2, reason: "Missing name" }); return; }
      out.push(mapped);
    });
    setPreview({ rows: out, errors });
  };

  const commit = async () => {
    if (!preview?.rows.length) return;
    setBusy(true);
    const res = await fetch("/api/travel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: preview.rows }) });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    toast.success(`Imported ${data.inserted} records`);
    setPreview(null); setFileName(""); onDone();
  };

  return (
    <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>Bulk Import Travel Records (CSV)</h3>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Headers auto-mapped. Rows matched by Sr No or Name + Company.</p>
        </div>
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
          <span className="btn-secondary"><Upload size={14} /> Choose CSV</span>
        </label>
      </div>
      {preview && (
        <div>
          <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            <strong>{fileName}</strong> — {preview.rows.length} valid rows
            {preview.errors.length > 0 && <span style={{ color: "var(--color-danger)" }}>, {preview.errors.length} skipped</span>}
          </p>
          {preview.errors.length > 0 && (
            <div style={{ background: "var(--color-danger-light)", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "0.5rem", fontSize: "0.75rem", maxHeight: 100, overflowY: "auto" }}>
              {preview.errors.map((e, i) => <div key={i}>Row {e.row}: {e.reason}</div>)}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-primary" onClick={commit} disabled={busy || !preview.rows.length}>
              {busy ? "Importing…" : `Import ${preview.rows.length} Records`}
            </button>
            <button className="btn-secondary" onClick={() => { setPreview(null); setFileName(""); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
