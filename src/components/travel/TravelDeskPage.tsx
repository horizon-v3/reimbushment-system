"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Download, Upload, Pencil, Trash2, RefreshCw, Copy, Lock, Link, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";
import {
  type RegistrationRow, type TravelRow,
  isYes, pivotCount, generateTicketReport,
  extractCountryCode, CSV_HEADER_MAP, parseCsv,
} from "@/lib/crm-utils";
import { uploadFileToDrive } from "@/lib/gas-client";

// --- Extracted components ---
const FLD = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="label">{label}</label>{children}</div>
);

const SEL = ({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) => (
  <FLD label={label}>
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  </FLD>
);

const fetcher = (u: string) => fetch(u).then(r => r.json());

const EMPTY_FORM = {
  registration_id: "", responses_sr_no: "", room_no: "", hotel_name: "",
  initial: "", first_name: "", last_name: "", country_name: "", country_code: "",
  participant_mobile: "", check_in_date: "", check_out_date: "", room_units: "1",
  arrival_date: "", arrival_flight_no: "", arrival_to: "Indira Gandhi International Airport(DEL)",
  arrival_time: "", departure_date: "", departure_flight_no: "",
  departure_from: "Indira Gandhi International Airport(DEL)", departure_time: "",
  sector: "", company_name: "", poc: "", status: "Pending", reimbursement: "No",
  notes: "", invoice_amount: "", invoice_amount_usd: "", invoice_amount_local: "", invoice_currency: "",
  ticket_received: "No", invoice_received: "No", visa_received: "No",
  passport_copy_received: "No", voucher_received: "No",
  reimbursement_amount: "", bl: "",
  passport_url: "", business_card_url: "",
};
type FormState = typeof EMPTY_FORM & { reimbursement_amount_verified?: boolean };
type FileMap = { ticket?: File; invoice?: File; visa?: File; passport?: File; voucher?: File; business_card?: File };

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "SEK", "NZD", "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "BGN", "BHD", "BRL", "BSD", "BWP", "BYN", "CLP", "COP", "CRC", "CZK", "DKK", "DOP", "DZD", "EGP", "FJD", "GEL", "GHS", "HKD", "HRK", "HUF", "IDR", "ILS", "INR", "IQD", "JOD", "KES", "KHR", "KRW", "KWD", "KZT", "LAK", "LBP", "LKR", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NOK", "NPR", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SGD", "THB", "TND", "TRY", "TWD", "TZS", "UAH", "UGX", "UYU", "UZS", "VND", "XAF", "XOF", "ZAR", "ZMW"].sort();

export default function TravelDeskPage({ isAdmin = false, isSupervisor = false }: { isAdmin?: boolean; isSupervisor?: boolean }) {
  const { data: regsData } = useSWR<{ rows: RegistrationRow[] }>("/api/registrations?limit=5000", fetcher);
  const { data: travData, mutate } = useSWR<{ rows: TravelRow[] }>("/api/travel?limit=5000", fetcher);
  const regs = useMemo(() => regsData?.rows ?? [], [regsData?.rows]);
  const records = useMemo(() => travData?.rows ?? [], [travData?.rows]);

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [travelSearch, setTravelSearch] = useState("");
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
      bl: r.bl_status ?? r.proof_upload ?? "",
      passport_url: r.drive_passport_front_url ?? r.passport_front_copy ?? "",
      business_card_url: r.drive_business_card_url ?? r.business_card_upload ?? "",
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
    
    let isVerified = form.reimbursement_amount_verified;
    if (form.reimbursement_amount && !isVerified) {
      const p = window.prompt(`Please type "ok" to confirm the reimbursement amount of ${form.reimbursement_amount}`);
      if (p?.trim().toLowerCase() === "ok") {
        isVerified = true;
      } else {
        return toast.error("Reimbursement amount not confirmed. Please type 'ok' to verify.");
      }
    }
    
    if (editId && isSupervisor && !isAdmin) {
      const p = window.prompt('You are about to overwrite data. Type "CONFIRM" to proceed:');
      if (p !== "CONFIRM") {
        return toast.error("Overwrite cancelled. You must type CONFIRM to save.");
      }
    }

    setSaving(true);
    try {
      const urlMap: Record<string, string> = {};
      const fileEntries: [keyof FileMap, string][] = [
        ["ticket", "ticket"], ["invoice", "invoice"], ["visa", "visa"],
        ["passport", "passport"], ["voucher", "voucher"], ["business_card", "business_card"],
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
      invoice_amount_local: r.invoice_amount_local ?? "",
      invoice_currency: r.invoice_currency ?? "",
      ticket_received: r.ticket_received ?? "No", invoice_received: r.invoice_received ?? "No",
      visa_received: r.visa_received ?? "No", passport_copy_received: r.passport_copy_received ?? "No",
      voucher_received: r.voucher_received ?? "No",
      reimbursement_amount: r.reimbursement_amount ?? "",
      bl: r.bl ?? "",
      passport_url: r.passport_url ?? "",
      business_card_url: r.business_card_url ?? "",
      reimbursement_amount_verified: false,
    });
    setFiles({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRecord = async (id: number) => {
    if (!isAdmin) return toast.error("Admin access required to delete");
    if (!confirm("Delete this travel record?")) return;
    const res = await fetch(`/api/travel?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    if (res.ok) { toast.success("Deleted"); mutate(); }
    else toast.error(d.error ?? "Delete failed");
  };

  const fetchPassportUrl = async (travelId: number) => {
    const tid = toast.loading("Fetching passport URL from sheet…");
    try {
      const res = await fetch("/api/travel/fetch-passport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Passport URL fetched & saved ✓", { id: tid });
      mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: tid });
    }
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

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-1.5 tracking-tight">Travel Desk</h1>
          <p className="text-[0.9rem] font-medium text-[var(--color-text-secondary)]">
            {records.length} records · {ticketRecords.length} tickets received
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin || isSupervisor ? (
            <>
              {isAdmin && <button className="btn-secondary py-2" onClick={() => setShowBulk(!showBulk)}><Upload size={14} /> Bulk CSV</button>}
              <button className="btn-primary py-2 shadow-sm" onClick={downloadXlsx}><Download size={14} /> Export XLSX</button>
            </>
          ) : (
            <span title="Admin or Supervisor access required" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium text-[var(--color-text-tertiary)] border border-[var(--color-border)] cursor-not-allowed bg-[var(--color-surface)]">
              <Lock size={14} /> Read Only
            </span>
          )}
          <button className="btn-secondary" onClick={() => mutate()}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Form */}
      <div className="glass-card p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[1.1rem] font-bold tracking-tight">{editId ? "Edit Travel Record" : "New Travel Record"}</h3>
          {editId && <button className="btn-secondary py-1 px-3 text-xs" onClick={reset}>Cancel Edit</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <DelegateSearch regs={regs} value={form.registration_id} onSelect={onSelectDelegate} />
          {(["responses_sr_no","initial","first_name","last_name","country_name","participant_mobile","country_code","company_name","sector","bl","poc","room_no","hotel_name","arrival_flight_no","arrival_to","departure_flight_no","departure_from","invoice_amount","invoice_amount_usd","invoice_amount_local"] as (keyof FormState)[]).map(k => (
            <FLD key={k} label={
              k === "invoice_amount" ? "Invoice Amount (INR)" : 
              k === "invoice_amount_usd" ? "Invoice Amount (USD)" :
              k === "invoice_amount_local" ? "Invoice Amount (Local)" :
              k.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase())
            }>
              <input className="input" value={form[k] as string}
                readOnly={["responses_sr_no","initial","first_name","last_name","country_name","participant_mobile","company_name","sector","bl","poc"].includes(k)}
                onChange={e => set(k, e.target.value as FormState[typeof k])} />
            </FLD>
          ))}
          <FLD label="Invoice Currency">
            <input className="input" list="currencies" value={form.invoice_currency as string} onChange={e => set("invoice_currency", e.target.value)} placeholder="Search or select..." />
            <datalist id="currencies">
              {CURRENCIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </FLD>
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
          <SEL label="Occupancy" value={form.room_units as string} onChange={v => set("room_units", v)} opts={["1","0.5"]} />
          <SEL label="Status" value={form.status as string} onChange={v => set("status", v)} opts={["Confirmed","Can't Verify","Pending","Cancelled"]} />
          <SEL label="Reimbursement to be done or not" value={form.reimbursement as string} onChange={v => set("reimbursement", v)} opts={["Yes","No"]} />
          <FLD label="Reimbursement Amount Given">
            <input className="input" value={form.reimbursement_amount as string} onChange={e => set("reimbursement_amount", e.target.value)} placeholder="Enter amount" />
            <div className="flex items-center gap-2 mt-2">
              <button 
                className="btn-secondary py-1 text-xs"
                onClick={() => {
                  if(!form.reimbursement_amount) return toast.error("Enter amount first");
                  const p = window.prompt(`Type "ok" to confirm amount: ${form.reimbursement_amount}`);
                  if(p?.trim().toLowerCase() === "ok") set("reimbursement_amount_verified", true);
                }}
              >
                Verify Amount (Pop-up)
              </button>
              {form.reimbursement_amount_verified && <span className="text-xs text-[var(--color-success)] font-bold flex items-center gap-1"><CheckCircle size={12}/> Verified</span>}
            </div>
          </FLD>
          <SEL label="Ticket Received" value={form.ticket_received as string} onChange={v => set("ticket_received", v)} opts={["Yes","No"]} />
          <SEL label="Invoice Received" value={form.invoice_received as string} onChange={v => set("invoice_received", v)} opts={["Yes","No"]} />
          <SEL label="Visa Received" value={form.visa_received as string} onChange={v => set("visa_received", v)} opts={["Yes","No"]} />
          <SEL label="Passport Copy" value={form.passport_copy_received as string} onChange={v => set("passport_copy_received", v)} opts={["Yes","No"]} />
          <SEL label="Voucher Received" value={form.voucher_received as string} onChange={v => set("voucher_received", v)} opts={["Yes","No"]} />
          {(["ticket","invoice","visa","passport","voucher","business_card"] as (keyof FileMap)[]).map(k => (
            <FLD key={k} label={`${k.replace("_"," ").replace(/\b\w/g,m=>m.toUpperCase())} File (Drive Upload)`}>
              <div className="flex flex-col gap-1">
                <input type="file" className="input" style={{ padding: "0.375rem" }} onChange={e => setFiles(f => ({ ...f, [k]: e.target.files?.[0] }))} />
                {(k === "passport" && form.passport_url) && <a href={form.passport_url as string} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent)] hover:underline mt-1 flex items-center gap-1"><Link size={12}/> View existing passport</a>}
                {(k === "business_card" && form.business_card_url) && <a href={form.business_card_url as string} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent)] hover:underline mt-1 flex items-center gap-1"><Link size={12}/> View existing business card</a>}
              </div>
            </FLD>
          ))}
          <div className="col-span-full">
            <label className="label">Remarks / Notes</label>
            <textarea className="input w-full p-3 bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:bg-[var(--color-surface)]" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} style={{ resize: "vertical" }} />
          </div>
        </div>
        {isAdmin || isSupervisor ? (
          <div className="mt-5">
            <button className="btn-primary py-2.5 px-6 shadow-sm font-semibold" onClick={save} disabled={saving}>
              {saving ? "Saving…" : (editId ? "Update Record" : "Save Travel Record")}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-[0.85rem] font-medium text-[var(--color-danger)] flex items-center gap-1.5 bg-[var(--color-danger-light)] w-fit px-3 py-1.5 rounded-lg">
            <Lock size={14} />
            Read-only — only admins and supervisors can add or edit travel records.
          </p>
        )}
      </div>

      {/* Bulk CSV upload */}
      {showBulk && isAdmin && <BulkCsvUpload regs={regs} onDone={() => { mutate(); setShowBulk(false); }} />}

      {/* Stats pills */}
      <div className="glass-card p-4 mb-6 flex gap-3 flex-wrap items-center">
        {[
          ["Total Records", records.length],
          ["Tickets Received", records.filter(r => isYes(r.ticket_received)).length],
          ["Invoices Received", records.filter(r => isYes(r.invoice_received)).length],
          ["Visa Received", records.filter(r => isYes(r.visa_received)).length],
        ].map(([l, v]) => (
          <span key={l as string} className="badge badge-neutral bg-[var(--color-border)]/50 text-xs px-3 py-1.5">
            {l}: <strong className="ml-1 text-[var(--color-text-primary)]">{v}</strong>
          </span>
        ))}
      </div>

      {/* Records table */}
      <div className="glass-card p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <h3 className="text-[1.1rem] font-bold tracking-tight">Travel Records</h3>
          <input
            type="search"
            className="input max-w-sm w-full py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:bg-[var(--color-surface)] shadow-sm"
            placeholder="Search name, country, company, Sr No, POC, flight, hotel…"
            value={travelSearch}
            onChange={e => setTravelSearch(e.target.value)}
          />
        </div>
        <div className="border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm bg-[var(--color-surface)]">
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
            <table className="data-table">
              <thead><tr>
                {["#","Sr","Name","Country","Company","Sector","B/L","POC","Status","Ticket","Invoice","Visa","Passport","Actions"].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(() => {
                  const q = travelSearch.trim().toLowerCase();
                  const filtered = q
                    ? records.filter(r =>
                        [
                          r.responses_sr_no, r.first_name, r.last_name, r.initial,
                          r.country_name, r.company_name, r.poc, r.sector, r.status,
                          r.hotel_name, r.room_no, r.participant_mobile,
                          r.arrival_flight_no, r.departure_flight_no,
                          r.arrival_to, r.departure_from,
                        ].some(v => v?.toLowerCase().includes(q))
                      )
                    : records;

                  if (filtered.length === 0) return (
                    <tr><td colSpan={14} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>
                      {records.length === 0 ? "No travel records yet." : `No results for "${travelSearch}"`}
                    </td></tr>
                  );

                  return filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: "var(--color-text-tertiary)" }}>{i + 1}</td>
                    <td>{r.responses_sr_no}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{[r.initial, r.first_name, r.last_name].filter(Boolean).join(" ")}</td>
                    <td>{r.country_name}</td>
                    <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company_name}</td>
                    <td>{r.sector}</td>
                    <td>{r.bl}</td>
                    <td>{r.poc}</td>
                    <td><span className={`badge ${r.status === "Confirmed" ? "badge-success" : r.status === "Cancelled" ? "badge-danger" : "badge-warning"}`}>{r.status}</span></td>
                    {[
                      { key: "ticket_received", urlKey: "ticket_url", name: "Ticket" },
                      { key: "invoice_received", urlKey: "invoice_url", name: "Invoice" },
                      { key: "visa_received", urlKey: "visa_url", name: "Visa" },
                      { key: "passport_copy_received", urlKey: "passport_url", name: "Passport" }
                    ].map(col => (
                      <td key={col.key}>
                          {Boolean(r[col.urlKey as keyof TravelRow]) ? (
                            <a href={r[col.urlKey as keyof TravelRow] as string} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", display: "inline-flex", gap: "0.25rem", alignItems: "center", textDecoration: "none" }}>
                              <Download size={12} /> Download
                            </a>
                          ) : (
                            <span className="badge badge-neutral">No</span>
                          )}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        {(isAdmin || isSupervisor) && <button className="btn-secondary" style={{ padding: "0.25rem" }} onClick={() => editRecord(r)}><Pencil size={13} /></button>}
                        {isAdmin && <button className="btn-secondary" style={{ padding: "0.25rem", color: "var(--color-danger)" }} onClick={() => deleteRecord(r.id)}><Trash2 size={13} /></button>}
                        {(!isAdmin && !isSupervisor) && <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>—</span>}
                      </div>
                    </td>
                  </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ticket Report */}
      <div className="glass-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[1.1rem] font-bold tracking-tight">Till Date Ticket Report</h3>
          <button className="btn-secondary py-1.5" onClick={async () => { await navigator.clipboard.writeText(ticketReport); toast.success("Copied"); }}>
            <Copy size={14} /> Copy
          </button>
        </div>
        <textarea readOnly value={ticketReport} rows={8} className="input mono w-full p-3 bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:bg-[var(--color-surface)] text-[0.8rem] leading-relaxed custom-scrollbar" />
      </div>

      {/* Pivot mini grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[
          { title: "Country-wise (Tickets)", rows: tCountry },
          { title: "Sector-wise (Tickets)", rows: tSector },
          { title: "POC-wise (Tickets)", rows: tPoc },
        ].map(({ title, rows: pr }) => (
          <div key={title} className="glass-card p-5 bg-[var(--color-surface)] border-[var(--color-border)] rounded-2xl shadow-sm">
            <h4 className="font-bold text-[0.95rem] mb-4 text-[var(--color-text-primary)] tracking-tight">{title}</h4>
            <div className="flex flex-col gap-2.5">
              {pr.slice(0, 10).map(({ label, count }) => (
                <div key={label} className="group">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[0.85rem] font-medium text-[var(--color-text-primary)] truncate max-w-[75%] transition-colors group-hover:text-[var(--color-accent)]">{label}</span>
                    <span className="text-[0.85rem] font-bold text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors shrink-0">{count}</span>
                  </div>
                </div>
              ))}
            </div>
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

// ─── Searchable Delegate Picker ───────────────────────────────────────────────
function DelegateSearch({
  regs,
  value,
  onSelect,
}: {
  regs: RegistrationRow[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Label shown when closed and a delegate is selected
  const selected = regs.find((r) => String(r.id) === value);
  const displayLabel = selected
    ? `${selected.sr_no ?? ""}. ${[selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.company_name || "—"} | ${selected.country_name ?? ""}`
    : "";

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return regs.slice(0, 100);
    return regs.filter((r) =>
      [String(r.sr_no ?? ""), r.first_name, r.last_name,
        r.company_name, r.country_name, r.poc, r.participant_mobile]
        .some((v) => v?.toLowerCase().includes(q))
    ).slice(0, 100);
  }, [regs, query]);

  // Calculate position for the fixed dropdown
  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
    setQuery("");
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideWrap = wrapRef.current?.contains(target);
      const isInsideDropdown = document.getElementById("delegate-dropdown")?.contains(target);
      if (!isInsideWrap && !isInsideDropdown) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (id: string) => {
    onSelect(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ gridColumn: "span 2" }}>
      <label className="label">Delegate (search by name / Sr No / company)</label>
      <input
        ref={inputRef}
        className="input"
        type="text"
        placeholder="Type name, Sr No, company or country…"
        value={open ? query : displayLabel}
        onFocus={openDropdown}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        style={{ width: "100%" }}
        autoComplete="off"
      />

      {/* Fixed-position dropdown — escapes grid/overflow clipping */}
      {open && typeof window !== "undefined" && (
        <div
          id="delegate-dropdown"
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            zIndex: 99999,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
              No delegates found
            </div>
          ) : (
            <>
              {matches.map((r) => {
                const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.company_name || "—";
                const isActive = String(r.id) === value;
                return (
                  <div
                    key={r.id}
                    onMouseDown={(e) => { e.preventDefault(); pick(String(r.id)); }}
                    style={{
                      padding: "0.5rem 0.875rem",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      background: isActive ? "var(--color-accent-light)" : "transparent",
                      borderBottom: "1px solid var(--color-border)",
                      display: "flex",
                      gap: "0.625rem",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--color-bg-primary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isActive ? "var(--color-accent-light)" : "transparent"; }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--color-accent)", minWidth: 32, flexShrink: 0, fontSize: "0.8125rem" }}>
                      {r.sr_no ?? "—"}
                    </span>
                    <span style={{ color: "var(--color-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0, fontSize: "0.75rem" }}>
                      {r.country_name ?? ""}
                    </span>
                  </div>
                );
              })}
              {regs.length > 100 && !query.trim() && (
                <div style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", color: "var(--color-text-tertiary)", textAlign: "center", borderTop: "1px solid var(--color-border)" }}>
                  Showing 100 of {regs.length} — type to search all
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

