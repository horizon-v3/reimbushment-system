"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Users, Building2, CheckCircle, XCircle, Hotel, Globe, Copy,
  Upload, Download, FileText, RefreshCw,
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

export default function DashboardPage() {
  const { rows, isLoading, mutate } = useRegistrations();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"table" | "groups">("table");

  const k = useMemo(() => computeKpis(rows), [rows]);
  const byCountry = useMemo(() => pivotCount(rows, (r) => r.country_name ?? r.passport_country), [rows]);
  const bySector = useMemo(() => pivotCount(rows, (r) => r.main_import_product_1), [rows]);
  const byPoc = useMemo(() => pivotCount(rows, (r) => r.poc), [rows]);
  const byRegion = useMemo(() => pivotCount(rows, (r) => r.region), [rows]);

  const generate = useCallback(() => {
    const [y, m, d] = date.split("-").map(Number);
    setMsg(generateGroupMessage(rows, new Date(y, m - 1, d)));
  }, [rows, date]);

  const copy = async () => {
    const text = msg || generateGroupMessage(rows, new Date(date));
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // CSV Import
  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error("CSV is empty");

    const parseRow = (line: string): string[] => {
      const out: string[] = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === "," && !inQ) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur); return out;
    };

    const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const records = lines.slice(1).map((l) => {
      const cells = parseRow(l);
      const obj: Record<string, string | null> = {};
      headers.forEach((h, i) => { obj[h] = cells[i]?.trim() || null; });
      return obj;
    });

    const toastId = toast.loading(`Importing ${records.length} records…`);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Imported ${data.inserted} rows`, { id: toastId });
      mutate();
      e.target.value = "";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed", { id: toastId });
    }
  };

  // XLSX export
  const downloadXlsx = () => {
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
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registrations");
    XLSX.writeFile(wb, `DelegateConnect_Registrations_${date}.xlsx`);
    toast.success("Excel exported");
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
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem",
      }}>
        <div>
          <h1 style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            CRM Home
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            {isLoading ? "Loading…" : `${k.total.toLocaleString()} delegates · ${k.uniqueCompanies.toLocaleString()} companies`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept=".csv" onChange={handleCsv} className="sr-only" style={{ display: "none" }} />
            <span className="btn-secondary">
              <Upload size={14} /> Import CSV
            </span>
          </label>
          <button className="btn-secondary" onClick={downloadXlsx}>
            <Download size={14} /> Export XLSX
          </button>
          <button className="btn-secondary" onClick={() => mutate()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "0.875rem",
        marginBottom: "1.5rem",
      }}>
        {kpiData.map(({ label, value, icon, tone }) => (
          <KpiCard key={label} label={label} value={value} icon={icon} tone={tone as "good" | "bad" | "warn" | "neutral"} />
        ))}
      </div>

      {/* Pivots */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}>
        <PivotTable title="Country-wise" rows={byCountry} />
        <PivotTable title="Sector-wise" rows={bySector} />
        <PivotTable title="POC-wise" rows={byPoc} />
        <PivotTable title="Region-wise" rows={byRegion} />
      </div>

      {/* Group Message Generator */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Group Message Generator</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" style={{ width: 160 }} />
            <button className="btn-primary" onClick={generate}>Generate</button>
            <button className="btn-secondary" onClick={copy}><Copy size={14} /> Copy</button>
          </div>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={8}
          className="input mono"
          style={{ resize: "vertical", fontSize: "0.8125rem", lineHeight: 1.6 }}
          placeholder="Click Generate to create today's WhatsApp message…"
        />
      </div>

      {/* Tab: Table | Country Groups */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
            {tab === "table" ? `Registered Delegates (${rows.length})` : `Country Groups (${groups.length})`}
          </h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div className="tab-strip">
              <button className={`tab-item ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
                Table
              </button>
              <button className={`tab-item ${tab === "groups" ? "active" : ""}`} onClick={() => setTab("groups")}>
                Country Groups
              </button>
            </div>
          </div>
        </div>

        {tab === "table" ? (
          <RegistrationsTable rows={rows} isLoading={isLoading} />
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
    <div className="kpi-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.625rem" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "10px",
          background: bg, color: fg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Pivot Table ───────────────────────────────────────────────────────────────
function PivotTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  const maxVal = rows[0]?.count ?? 1;
  const shown = expanded ? rows : rows.slice(0, 8);

  return (
    <div className="kpi-card" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h4 style={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</h4>
        <span className="badge badge-neutral">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>No data</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {shown.map(({ label, count }) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.1875rem" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{label}</span>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent)", flexShrink: 0 }}>{count}</span>
              </div>
              <div style={{ height: 3, background: "var(--color-border)", borderRadius: 2 }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  background: "var(--color-accent)",
                  width: `${(count / maxVal) * 100}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          ))}
          {rows.length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ fontSize: "0.75rem", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", textAlign: "left", paddingTop: "0.25rem" }}
            >
              {expanded ? "Show less" : `+${rows.length - 8} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Registrations Table ───────────────────────────────────────────────────────
function RegistrationsTable({ rows, isLoading }: { rows: RegistrationRow[]; isLoading: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.country_name, r.company_name, r.poc, r.main_import_product_1]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <input
          type="search"
          className="input"
          placeholder="Search by name, country, company, POC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>
      <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {["Sr No", "Name", "Country", "Company", "Sector", "POC", "F/H", "Verified"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>
                  {rows.length === 0 ? "No registrations yet. Import a CSV to get started." : "No results found."}
                </td></tr>
              )}
              {filtered.map((r) => {
                const verified = isVerified(r);
                return (
                  <tr key={r.id}>
                    <td style={{ color: "var(--color-text-tertiary)" }}>{r.sr_no}</td>
                    <td>{[r.title, r.first_name, r.last_name].filter(Boolean).join(" ")}</td>
                    <td>{r.country_name ?? r.passport_country ?? ""}</td>
                    <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company_name}</td>
                    <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.main_import_product_1}</td>
                    <td>{r.poc}</td>
                    <td>{r.flight_hotel_code}</td>
                    <td>
                      <span className={`badge ${verified ? "badge-success" : "badge-danger"}`}>
                        {verified ? "Verified" : "Not Verified"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length !== rows.length && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.5rem" }}>
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
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className="btn-secondary" onClick={downloadTxt}><FileText size={14} /> Export .txt</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
        {groups.map((g) => (
          <div key={g.country} style={{
            border: "1px solid var(--color-border)", borderRadius: 12,
            padding: "0.875rem", background: "var(--color-bg-secondary)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                {g.country} <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>· {g.count}</span>
              </span>
              <button
                className="btn-secondary"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                onClick={async () => { await navigator.clipboard.writeText(g.message); toast.success(`Copied ${g.country}`); }}
              >
                <Copy size={12} />
              </button>
            </div>
            <pre style={{ fontSize: "0.75rem", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 180, overflowY: "auto", color: "var(--color-text-primary)", margin: 0 }}>
              {g.message}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
