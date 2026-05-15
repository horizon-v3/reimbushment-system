"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  Users, Building2, CheckCircle, XCircle, Hotel, Globe, Copy,
  Upload, Download, FileText, RefreshCw, Lock, Trash2, CloudDownload,
} from "lucide-react";
import { computeKpis, pivotCount, generateGroupMessage, generateCountryGroupMessages, isVerified, type RegistrationRow } from "@/lib/crm-utils";
import * as XLSX from "xlsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useRegistrations() {
  const { data, error, mutate, isLoading } = useSWR<{ rows: RegistrationRow[]; total: number }>(
    "/api/registrations?limit=5000",
    fetcher,
    { revalidateOnFocus: false }
  );
  return { rows: data?.rows ?? [], total: data?.total ?? 0, isLoading, error, mutate };
}

interface DashboardPageProps {
  isAdmin: boolean;
}

export default function DashboardPage({ isAdmin }: DashboardPageProps) {
  const { rows, isLoading, mutate } = useRegistrations();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"table" | "groups">("table");

  const k = useMemo(() => computeKpis(rows), [rows]);
  const byCountry         = useMemo(() => pivotCount(rows, (r) => r.country_name ?? r.passport_country), [rows]);
  const byPrimarySector   = useMemo(() => pivotCount(rows, (r) => r.main_import_product_1), [rows]);
  const bySecondarySector = useMemo(() => pivotCount(rows, (r) => r.main_import_product_2), [rows]);
  // "All Sectors" card uses nature_of_business as requested
  const byCombinedSector  = useMemo(() => pivotCount(rows, (r) => r.nature_of_business), [rows]);

  const byPoc    = useMemo(() => pivotCount(rows, (r) => r.poc), [rows]);
  const byRegion = useMemo(() => pivotCount(rows, (r) => r.region), [rows]);


  // Sync live data from Google Sheet via GAS → upsert Neon
  const syncFromSheet = async () => {
    const tid = toast.loading("Syncing from Google Sheet via GAS…");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast.success(`✅ Synced ${data.upserted} rows from Sheet`, { id: tid });
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed", { id: tid });
    }
  };

  const generate = useCallback(() => {
    const [y, m, d] = date.split("-").map(Number);
    setMsg(generateGroupMessage(rows, new Date(y, m - 1, d)));
  }, [rows, date]);

  const copy = async () => {
    const text = msg || generateGroupMessage(rows, new Date(date));
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // CSV / TSV Import (admin-only — also blocked server-side)
  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      toast.error("Only admins can import data");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();

    Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      complete: async (results) => {
        const lines = results.data;
        if (lines.length < 2) return toast.error("File is empty or has no data rows");

        const headers = lines[0];
        const records = lines.slice(1).map((cells) => {
          const obj: Record<string, string | null> = {};
          headers.forEach((h, i) => { obj[h] = cells[i] ?? null; });
          return obj;
        });

    const total = records.length;
    // ── Chunk into 250-row batches to stay under Next.js body limit ──
    // 250 rows × ~500 bytes/row = ~125 KB per chunk (well under 4 MB limit)
    const CHUNK = 250;
    const chunks = Math.ceil(total / CHUNK);
    let totalInserted = 0;

    const toastId = toast.loading(`Importing ${total} records… (0/${chunks} batches)`);
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const batch = records.slice(i, i + CHUNK);
        const batchNum = Math.floor(i / CHUNK) + 1;
        toast.loading(`Importing ${total} records… (${batchNum}/${chunks} batches)`, { id: toastId });

        const res = await fetch("/api/registrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: batch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Batch ${batchNum} failed`);
        totalInserted += data.inserted ?? 0;
      }
        toast.success(`✅ Imported ${totalInserted} of ${total} rows`, { id: toastId });
        mutate();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Import failed", { id: toastId });
      } finally {
        e.target.value = "";
      }
    }
  });
  };

  const downloadXlsx = () => {

    if (!isAdmin) {
      toast.error("Only admins can export data");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        "Sr No": r.sr_no,
        "Name": [r.title, r.first_name, r.last_name].filter(Boolean).join(" "),
        "Country": r.country_name ?? r.passport_country,
        "Company": r.company_name,
        "Sector": r.main_import_product_1,
        "POC": r.poc,
        "Flight/Hotel": r.flight_hotel_code,
        "Status": r.status,
        "BL Status": r.bl_status,
        "Mobile": r.participant_mobile,
        "Email": r.participant_email,
        "Region": r.region,
        "Passport No": r.passport_number,
        "Passport Country": r.passport_country,
        "Place of Issue": r.place_of_issue,
        "Date of Expiry": r.date_of_expiry,
        "BL Status Full": r.bl_status,
        "BB Invitation": r.bb_invitation_status,
        "Drive Passport Front": r.drive_passport_front_url,
        "Drive Passport Back": r.drive_passport_back_url,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registrations");
    XLSX.writeFile(wb, `DelegateConnect_Registrations_${date}.xlsx`);
    toast.success("Excel exported");
  };

  // Clear ALL registrations (admin-only, double-confirmed)
  const clearAllData = async () => {
    const first = confirm(
      `⚠️ DANGER ZONE\n\nThis will permanently delete ALL ${k.total} registration records from the database.\n\nAre you absolutely sure?`
    );
    if (!first) return;
    const typed = prompt('Type  DELETE  (all caps) to confirm permanent wipe:');
    if (typed?.trim() !== "DELETE") {
      toast.error("Cancelled — you must type DELETE exactly");
      return;
    }
    const tid = toast.loading("Clearing all data…");
    try {
      const res = await fetch("/api/registrations?all=true", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("✅ All registration data cleared", { id: tid });
      mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Clear failed", { id: tid });
    }
  };

  const kpiData = [
    { label: "Total Registrations", value: k.total, icon: <Users size={20} />, tone: "neutral" },
    { label: "Unique Companies", value: k.uniqueCompanies, icon: <Building2 size={20} />, tone: "neutral" },
    { label: "Verified", value: k.verified, icon: <CheckCircle size={20} />, tone: "good" },
    { label: "Not Verified", value: k.notVerified, icon: <XCircle size={20} />, tone: "bad" },
    { label: "Hotel + Flight", value: k.fh, icon: <Hotel size={20} />, tone: "warn" },
    { label: "Only Hotel", value: k.onlyHotel, icon: <Hotel size={20} />, tone: "warn" },
    { label: "Nothing", value: k.nothing, icon: <Globe size={20} />, tone: "neutral" },
    { label: "Excl SL/NP/BD", value: k.totalNoExcl, icon: <Globe size={20} />, tone: "neutral" },
    { label: "Unique Excl", value: k.uniqueNoExcl, icon: <Building2 size={20} />, tone: "neutral" },
    { label: "Will Not Attend", value: k.willNotAttend, icon: <XCircle size={20} />, tone: "bad" },
    { label: "Ceramic", value: k.ceramic, icon: <Globe size={20} />, tone: "neutral" },
    { label: "Non-Ceramic", value: k.nonCeramic, icon: <Globe size={20} />, tone: "neutral" },
  ];

  const groups = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return generateCountryGroupMessages(rows, new Date(y, (m || 1) - 1, d || 1));
  }, [rows, date]);

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-1.5 tracking-tight">
            CRM Home
          </h1>
          <p className="text-[0.9rem] font-medium text-[var(--color-text-secondary)]">
            {isLoading ? "Loading…" : `${k.total.toLocaleString()} delegates · ${k.uniqueCompanies.toLocaleString()} companies`}
            {!isAdmin && (
              <span className="ml-3 text-[0.75rem] text-[var(--color-danger)] font-bold inline-flex items-center bg-[var(--color-danger-light)] px-2 py-0.5 rounded-full">
                <Lock size={12} className="mr-1" />
                Read-only
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin ? (
            <>
              <label style={{ cursor: "pointer" }}>
                <input type="file" accept=".csv,.tsv" onChange={handleCsv} className="sr-only" style={{ display: "none" }} />
                <span className="btn-secondary">
                  <Upload size={14} /> Import CSV
                </span>
              </label>

              <button
                onClick={syncFromSheet}
                title="Fetch live data from Google Sheet via GAS and upsert into Neon DB"
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.375rem 0.75rem", borderRadius: 8,
                  fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer",
                  background: "var(--color-success-light, #dcfce7)",
                  color: "var(--color-success, #16a34a)",
                  border: "1px solid var(--color-success, #16a34a)",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <CloudDownload size={14} /> Sync from Sheet
              </button>
              <button className="btn-secondary" onClick={downloadXlsx}>
                <Download size={14} /> Export XLSX
              </button>

              <button
                onClick={clearAllData}
                title="Permanently delete all registration records"
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.375rem 0.75rem", borderRadius: 8,
                  fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer",
                  background: "var(--color-danger-light, #fee2e2)",
                  color: "var(--color-danger, #dc2626)",
                  border: "1px solid var(--color-danger, #dc2626)",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <Trash2 size={14} /> Clear All Data
              </button>
            </>
          ) : (
            <span title="Admin access required" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium text-[var(--color-text-tertiary)] border border-[var(--color-border)] cursor-not-allowed bg-[var(--color-surface)]">
              <Lock size={14} /> Admin Only
            </span>
          )}
          <button className="btn-secondary" onClick={() => mutate()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        {kpiData.map(({ label, value, icon, tone }) => (
          <KpiCard key={label} label={label} value={value} icon={icon} tone={tone as "good" | "bad" | "warn" | "neutral"} />
        ))}
      </div>

      {/* Pivots */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        <PivotTable title="Country-wise"                  rows={byCountry} />
        <PivotTable title="Your Main Import Product - 1"  rows={byPrimarySector} />
        <PivotTable title="Your Main Import Product - 2"  rows={bySecondarySector} />
        <PivotTable title="Nature of Business"            rows={byCombinedSector} />
        <PivotTable title="POC-wise"                      rows={byPoc} />
        <PivotTable title="Region-wise"                   rows={byRegion} />
      </div>

      {/* Group Message Generator */}
      <div className="glass-card p-5 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-[1.05rem] font-bold tracking-tight">Group Message Generator</h3>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-40 font-medium" />
            <button className="btn-primary py-2 shadow-sm" onClick={generate}>Generate</button>
            <button className="btn-secondary py-2" onClick={copy}><Copy size={15} /> Copy</button>
          </div>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={6}
          className="input mono w-full p-3 bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:bg-[var(--color-surface)]"
          style={{ resize: "vertical", fontSize: "0.8125rem", lineHeight: 1.6 }}
          placeholder="Click Generate to create today's WhatsApp message…"
        />
      </div>

      {/* Tab: Table | Country Groups */}
      <div className="glass-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-4">
          <h3 className="text-[1.05rem] font-bold tracking-tight">
            {tab === "table" ? `Registered Delegates (${rows.length})` : `Country Groups (${groups.length})`}
          </h3>
          <div className="flex items-center gap-2">
            <div className="tab-strip p-1 bg-[var(--color-border)]/50 rounded-xl">
              <button className={`tab-item rounded-lg px-4 py-1.5 transition-all ${tab === "table" ? "active bg-[var(--color-surface)] shadow-sm font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`} onClick={() => setTab("table")}>
                Table
              </button>
              <button className={`tab-item rounded-lg px-4 py-1.5 transition-all ${tab === "groups" ? "active bg-[var(--color-surface)] shadow-sm font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`} onClick={() => setTab("groups")}>
                Country Groups
              </button>
            </div>
          </div>
        </div>

        {tab === "table" ? (
          <RegistrationsTable rows={rows} isLoading={isLoading} isAdmin={isAdmin} onMutate={mutate} />
        ) : (
          <CountryGroups groups={groups} date={date} />
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "good" | "bad" | "warn" | "neutral" }) {
  const colors = {
    good: { bg: "var(--color-success-light)", fg: "var(--color-success)" },
    bad: { bg: "var(--color-danger-light)", fg: "var(--color-danger)" },
    warn: { bg: "var(--color-warning-light)", fg: "var(--color-warning)" },
    neutral: { bg: "var(--color-accent-light)", fg: "var(--color-accent)" },
  };
  const { bg, fg } = colors[tone];

  return (
    <div className="kpi-card p-4 flex flex-col justify-between h-full bg-[var(--color-surface)] border-[var(--color-border)] transition-all hover:-translate-y-1 hover:shadow-md rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: bg, color: fg }}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight leading-none mb-1.5">
          {value.toLocaleString()}
        </div>
        <div className="text-[0.8rem] font-medium text-[var(--color-text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Pivot Table ───────────────────────────────────────────────────────────────
function PivotTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? rows.filter((r) => r.label.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  const maxVal = filtered[0]?.count ?? rows[0]?.count ?? 1;
  // Auto-expand when filtering so all matches are visible
  const shown = (expanded || filter.trim()) ? filtered : filtered.slice(0, 8);

  return (
    <div className="kpi-card p-5 bg-[var(--color-surface)] border-[var(--color-border)] rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[0.9rem] font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h4>
        <span className="badge badge-neutral bg-[var(--color-border)]/50 text-xs px-2.5 py-0.5">{filter.trim() ? `${filtered.length}/${rows.length}` : rows.length}</span>
      </div>

      {/* Filter input */}
      {rows.length > 0 && (
        <div style={{ marginBottom: "0.625rem", position: "relative" }}>
          <input
            type="search"
            placeholder={`Filter ${title.split("-")[0].toLowerCase()}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[0.8rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)] transition-all"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[0.85rem] font-medium text-[var(--color-text-tertiary)] py-2">No data</p>
      ) : filtered.length === 0 ? (
        <p className="text-[0.85rem] font-medium text-[var(--color-text-tertiary)] py-2">No matches for &ldquo;{filter}&rdquo;</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map(({ label, count }) => (
            <div key={label} className="group">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[0.85rem] font-medium text-[var(--color-text-primary)] truncate max-w-[75%] transition-colors group-hover:text-[var(--color-accent)]">{label}</span>
                <span className="text-[0.85rem] font-bold text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors shrink-0">{count}</span>
              </div>
              <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(count / maxVal) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {!filter.trim() && filtered.length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[0.8rem] font-semibold text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors bg-none border-none cursor-pointer text-left pt-2 mt-1"
            >
              {expanded ? "Show less" : `+${filtered.length - 8} more`}
            </button>
          )}
        </div>
      )}
    </div>

  );
}

// ─── Registrations Table ───────────────────────────────────────────────────────
function RegistrationsTable({
  rows, isLoading, isAdmin, onMutate,
}: {
  rows: RegistrationRow[];
  isLoading: boolean;
  isAdmin: boolean;
  onMutate: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.country_name, r.company_name, r.poc, r.main_import_product_1]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete registration for ${name}?`)) return;
    const res = await fetch(`/api/registrations?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      toast.success("Deleted");
      onMutate();
    } else {
      toast.error(data.error ?? "Delete failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          type="search"
          className="input max-w-sm w-full py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:bg-[var(--color-surface)] shadow-sm"
          placeholder="Search by name, country, company, POC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm bg-[var(--color-surface)]">
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="data-table">
            <thead>
              <tr>
                {["Sr No", "Name", "Country", "Company", "Primary Sector", "Secondary Sector", "POC", "F/H", "Verified", ...(isAdmin ? [""] : [])].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={isAdmin ? 9 : 8} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>
                  {rows.length === 0 ? "No registrations yet. Import a CSV to get started." : "No results found."}
                </td></tr>
              )}
              {filtered.map((r) => {
                const verified = isVerified(r);
                const fullName = [r.title, r.first_name, r.last_name].filter(Boolean).join(" ");
                return (
                  <tr key={r.id}>
                    <td className="text-[var(--color-text-tertiary)] font-mono text-xs">{r.sr_no}</td>
                    <td className="font-semibold text-[var(--color-text-primary)]">{fullName}</td>
                    <td>{r.country_name ?? r.passport_country ?? ""}</td>
                    <td className="max-w-[180px] truncate" title={r.company_name ?? undefined}>{r.company_name}</td>
                    <td className="max-w-[140px] truncate" title={r.main_import_product_1 ?? undefined}>{r.main_import_product_1}</td>
                    <td className="max-w-[140px] truncate" title={r.main_import_product_2 ?? undefined}>{r.main_import_product_2}</td>
                    <td className="font-medium">{r.poc}</td>
                    <td><span className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2 py-1 rounded text-xs font-mono">{r.flight_hotel_code || "-"}</span></td>
                    <td>
                      <span className={`badge ${verified ? "badge-success border border-[var(--color-success)]/20" : "badge-danger border border-[var(--color-danger)]/20"}`}>
                        {verified ? "Verified" : "Not Verified"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="text-right">
                        <button
                          onClick={() => handleDelete(r.id, fullName)}
                          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] rounded-lg transition-colors cursor-pointer"
                          title="Delete registration"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length !== rows.length && (
        <p className="text-xs font-medium text-[var(--color-text-tertiary)] mt-2 ml-1">
          Showing {filtered.length} of {rows.length}
        </p>
      )}
    </div>
  );
}

// ─── Country Groups ────────────────────────────────────────────────────────────
function CountryGroups({ groups, date }: { groups: { country: string; count: number; message: string }[]; date: string }) {
  if (groups.length === 0) {
    return <p style={{ color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>No registrations on this date.</p>;
  }

  const downloadTxt = () => {
    const blob = new Blob([groups.map((g) => g.message).join("\n\n———————————————\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `country-messages-${date}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button className="btn-secondary py-2" onClick={downloadTxt}><FileText size={14} /> Export .txt</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.country} className="border border-[var(--color-border)] rounded-xl p-4 bg-[var(--color-bg-secondary)] shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-[0.95rem] tracking-tight">
                {g.country} <span className="text-[var(--color-text-tertiary)] font-medium ml-1">· {g.count}</span>
              </span>
              <button
                className="p-1.5 rounded-md hover:bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={async () => { await navigator.clipboard.writeText(g.message); toast.success(`Copied ${g.country}`); }}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="bg-[var(--color-bg-primary)] rounded-lg p-3 border border-[var(--color-border)]">
              <pre className="text-[0.75rem] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto text-[var(--color-text-primary)] custom-scrollbar">
                {g.message}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
