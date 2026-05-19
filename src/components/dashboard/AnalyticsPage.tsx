"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { BarChart2, Globe, RefreshCw, Database } from "lucide-react";
import { normalizeCompany, type RegistrationRow } from "@/lib/crm-utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useRegistrations() {
  const { data, error, mutate, isLoading } = useSWR<{ rows: RegistrationRow[]; total: number }>(
    "/api/registrations?limit=5000",
    fetcher,
    { revalidateOnFocus: false }
  );
  return { rows: data?.rows ?? [], total: data?.total ?? 0, isLoading, error, mutate };
}

function useDbVujis() {
  const { data, error, mutate, isLoading } = useSWR<{ rows: any[]; total: number }>(
    "/api/db-vujis?limit=5000",
    fetcher,
    { revalidateOnFocus: false }
  );
  return { rows: data?.rows ?? [], total: data?.total ?? 0, isLoading, error, mutate };
}

// ─── Brand Logo ─────────────────────────────────────────────────────────────
function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dc-grad-a" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0071e3" />
          <stop offset="1" stopColor="#5856d6" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#dc-grad-a)" />
      <circle cx="18" cy="18" r="9" stroke="white" strokeWidth="1.8" fill="none" opacity="0.9" />
      <ellipse cx="18" cy="18" rx="4.5" ry="9" stroke="white" strokeWidth="1.4" fill="none" opacity="0.75" />
      <line x1="9" y1="18" x2="27" y2="18" stroke="white" strokeWidth="1.4" opacity="0.75" />
      <path d="M10.5 13.5 Q18 11 25.5 13.5" stroke="white" strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M10.5 22.5 Q18 25 25.5 22.5" stroke="white" strokeWidth="1" fill="none" opacity="0.6" />
      <circle cx="18" cy="18" r="2" fill="white" opacity="0.95" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SectorRow = {
  sector: string;
  totalTarget: number;
  regCount: number;
  regUnique: number;
  status300: number;
  status500: number;
  status600: number;
  status300Unique: number;
  status500Unique: number;
  status600Unique: number;
};

function buildSectorBreakup(rows: RegistrationRow[]): SectorRow[] {
  // Group by main_import_product_1 as sector
  const sectorMap = new Map<string, RegistrationRow[]>();
  for (const r of rows) {
    const sector = (r.main_import_product_1 ?? "(None)").trim() || "(None)";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push(r);
  }

  return Array.from(sectorMap.entries())
    .map(([sector, list]) => {
      // Unique companies within this sector
      const uniqueKeys = new Set(list.map((r) => normalizeCompany(r.company_name)).filter(Boolean));

      const countByStatus = (statusStr: string, arr: RegistrationRow[]) =>
        arr.filter((r) => (r.status ?? "").toLowerCase().includes(statusStr)).length;

      const uniqueByStatus = (statusStr: string, arr: RegistrationRow[]) => {
        const seen = new Set<string>();
        for (const r of arr) {
          if ((r.status ?? "").toLowerCase().includes(statusStr)) {
            const k = normalizeCompany(r.company_name);
            if (k) seen.add(k);
          }
        }
        return seen.size;
      };

      return {
        sector,
        totalTarget: list.length,
        regCount: list.length,
        regUnique: uniqueKeys.size,
        status300: countByStatus("300", list),
        status500: countByStatus("500", list),
        status600: countByStatus("600", list),
        status300Unique: uniqueByStatus("300", list),
        status500Unique: uniqueByStatus("500", list),
        status600Unique: uniqueByStatus("600", list),
      };
    })
    .sort((a, b) => b.regCount - a.regCount);
}

// No longer building from registrations, we use real API data.

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { rows, isLoading, mutate } = useRegistrations();
  const { rows: dbVujisRows, isLoading: dbLoading, mutate: mutateDb } = useDbVujis();
  const [tab, setTab] = useState<"sector" | "dbvujis">("sector");
  const [sectorSearch, setSectorSearch] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [dbProduct1, setDbProduct1] = useState("");
  const [dbProduct2, setDbProduct2] = useState("");
  const [syncing, setSyncing] = useState(false);

  const sectorRows = useMemo(() => buildSectorBreakup(rows), [rows]);

  // Totals for sector
  const sectorTotals = useMemo(() => ({
    totalTarget: sectorRows.reduce((s, r) => s + r.totalTarget, 0),
    regCount: sectorRows.reduce((s, r) => s + r.regCount, 0),
    regUnique: sectorRows.reduce((s, r) => s + r.regUnique, 0),
    status300: sectorRows.reduce((s, r) => s + r.status300, 0),
    status500: sectorRows.reduce((s, r) => s + r.status500, 0),
    status600: sectorRows.reduce((s, r) => s + r.status600, 0),
    status300Unique: sectorRows.reduce((s, r) => s + r.status300Unique, 0),
    status500Unique: sectorRows.reduce((s, r) => s + r.status500Unique, 0),
    status600Unique: sectorRows.reduce((s, r) => s + r.status600Unique, 0),
  }), [sectorRows]);

  const filteredSector = useMemo(() => {
    if (!sectorSearch.trim()) return sectorRows;
    const q = sectorSearch.toLowerCase();
    return sectorRows.filter((r) => r.sector.toLowerCase().includes(q));
  }, [sectorRows, sectorSearch]);

  const filteredDb = useMemo(() => {
    let result = dbVujisRows;
    if (dbSearch.trim()) {
      const q = dbSearch.toLowerCase();
      result = result.filter((r) =>
        [r.company_name, r.country_name, r.region, r.poc]
          .some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    if (dbProduct1.trim()) {
      const q = dbProduct1.toLowerCase();
      result = result.filter((r) => (r.main_import_product_1 || "").toLowerCase().includes(q));
    }
    if (dbProduct2.trim()) {
      const q = dbProduct2.toLowerCase();
      result = result.filter((r) => (r.main_import_product_2 || "").toLowerCase().includes(q));
    }
    return result;
  }, [dbVujisRows, dbSearch, dbProduct1, dbProduct2]);

  const dbStats = useMemo(() => {
    const uniqueKeys = new Set(dbVujisRows.map(r => normalizeCompany(r.company_name)).filter(Boolean));
    let verified = 0;
    let nonVerified = 0;
    for (const r of dbVujisRows) {
      if ((r.proof_of_import_y || "").toLowerCase().includes("y")) verified++;
      else if ((r.proof_of_import_n || "").toLowerCase().includes("n")) nonVerified++;
    }
    return { unique: uniqueKeys.size, verified, nonVerified };
  }, [dbVujisRows]);

  const handleSyncDbVujis = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/db-vujis/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert("Synced " + data.synced + " DB & Vujis records successfully.");
        mutateDb();
      } else {
        alert("Sync failed: " + data.error);
      }
    } catch (e) {
      alert("Error syncing data.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo size={48} />
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-1.5 tracking-tight">
              Analytics
            </h1>
            <p className="text-[0.9rem] font-medium text-[var(--color-text-secondary)]">
              {isLoading ? "Loading…" : `${rows.length.toLocaleString()} registrations · ${sectorRows.length} sectors`}
            </p>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => { mutate(); mutateDb(); }}>
          <RefreshCw size={14} /> Refresh All
        </button>
      </div>

      {/* Tabs */}
      <div className="glass-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h3 className="text-[1.05rem] font-bold tracking-tight">
            {tab === "sector" ? `Sector-wise Breakup (${filteredSector.length} sectors)` : `DB & Vujis (${filteredDb.length} companies)`}
          </h3>
          <div className="tab-strip p-1 bg-[var(--color-border)]/50 rounded-xl flex">
            <button
              className={`tab-item rounded-lg px-4 py-1.5 transition-all flex items-center gap-1.5 ${tab === "sector" ? "active bg-[var(--color-surface)] shadow-sm font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
              onClick={() => setTab("sector")}
            >
              <BarChart2 size={14} /> Sector-wise Breakup
            </button>
            <button
              className={`tab-item rounded-lg px-4 py-1.5 transition-all flex items-center gap-1.5 ${tab === "dbvujis" ? "active bg-[var(--color-surface)] shadow-sm font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
              onClick={() => setTab("dbvujis")}
            >
              <Database size={14} /> DB & Vujis
            </button>
          </div>
        </div>

        {/* ── Sector-wise Breakup ── */}
        {tab === "sector" && (
          <div className="flex flex-col gap-4">
            <input
              type="search"
              className="input max-w-xs py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)]"
              placeholder="Filter sector…"
              value={sectorSearch}
              onChange={(e) => setSectorSearch(e.target.value)}
            />
            <div className="border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="data-table w-full text-[0.8rem]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="align-middle">Sr No</th>
                      <th rowSpan={2} className="align-middle">Sector</th>
                      <th rowSpan={2} className="align-middle text-center">Total Target Count</th>
                      <th rowSpan={2} className="align-middle text-center">Reg Count</th>
                      <th rowSpan={2} className="align-middle text-center">Reg Count (Unique)</th>
                      <th colSpan={3} className="text-center border-b border-[var(--color-border)]">As per Reg Count</th>
                      <th colSpan={3} className="text-center border-b border-[var(--color-border)]">As per Reg Count (Unique)</th>
                    </tr>
                    <tr>
                      <th className="text-center text-[0.72rem]">Status as per 300</th>
                      <th className="text-center text-[0.72rem]">Status as per 500</th>
                      <th className="text-center text-[0.72rem]">Status as per 600</th>
                      <th className="text-center text-[0.72rem]">Status as per 300</th>
                      <th className="text-center text-[0.72rem]">Status as per 500</th>
                      <th className="text-center text-[0.72rem]">Status as per 600</th>
                    </tr>
                    {/* Totals row */}
                    <tr style={{ background: "var(--color-accent-light)", fontWeight: 700 }}>
                      <td></td>
                      <td className="font-bold">Total</td>
                      <td className="text-center font-bold">{sectorTotals.totalTarget}</td>
                      <td className="text-center font-bold">{sectorTotals.regCount}</td>
                      <td className="text-center font-bold">{sectorTotals.regUnique}</td>
                      <td className="text-center font-bold">{sectorTotals.status300}</td>
                      <td className="text-center font-bold">{sectorTotals.status500}</td>
                      <td className="text-center font-bold">{sectorTotals.status600}</td>
                      <td className="text-center font-bold">{sectorTotals.status300Unique}</td>
                      <td className="text-center font-bold">{sectorTotals.status500Unique}</td>
                      <td className="text-center font-bold">{sectorTotals.status600Unique}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr><td colSpan={11} className="text-center py-8 text-[var(--color-text-tertiary)]">Loading…</td></tr>
                    )}
                    {!isLoading && filteredSector.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-8 text-[var(--color-text-tertiary)]">No sector data found.</td></tr>
                    )}
                    {filteredSector.map((r, i) => (
                      <tr key={r.sector} className={i % 2 === 0 ? "" : "bg-[var(--color-bg-primary)]/40"}>
                        <td className="text-[var(--color-text-tertiary)] font-mono text-xs">{i + 1}</td>
                        <td className="font-semibold">{r.sector}</td>
                        <td className="text-center">{r.totalTarget}</td>
                        <td className="text-center">{r.regCount}</td>
                        <td className="text-center font-bold text-[var(--color-accent)]">{r.regUnique}</td>
                        <td className="text-center">{r.status300 || "-"}</td>
                        <td className="text-center">{r.status500 || "-"}</td>
                        <td className="text-center">{r.status600 || "-"}</td>
                        <td className="text-center">{r.status300Unique || "-"}</td>
                        <td className="text-center">{r.status500Unique || "-"}</td>
                        <td className="text-center">{r.status600Unique || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── DB & Vujis ── */}
        {tab === "dbvujis" && (
          <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5 flex-wrap">
              <input
                type="search"
                className="input flex-1 min-w-[180px] py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)]"
                placeholder="Search company, country, region, POC…"
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
              />
              <input
                type="search"
                className="input flex-1 min-w-[160px] py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)]"
                placeholder="Filter Main Import Product 1…"
                value={dbProduct1}
                onChange={(e) => setDbProduct1(e.target.value)}
              />
              <input
                type="search"
                className="input flex-1 min-w-[160px] py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)]"
                placeholder="Filter Main Import Product 2…"
                value={dbProduct2}
                onChange={(e) => setDbProduct2(e.target.value)}
              />
              {(dbSearch || dbProduct1 || dbProduct2) && (
                <button
                  onClick={() => { setDbSearch(""); setDbProduct1(""); setDbProduct2(""); }}
                  className="px-3 py-2 text-[0.8rem] font-semibold rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)] transition-colors whitespace-nowrap"
                >
                  ✕ Clear
                </button>
              )}
            </div>
            {(dbProduct1.trim() || dbProduct2.trim()) && (
              <p className="text-[0.78rem] font-medium text-[var(--color-accent)] -mt-1">
                {dbProduct1.trim() && dbProduct2.trim()
                  ? `Showing where Product-1 contains "${dbProduct1}" AND Product-2 contains "${dbProduct2}"`
                  : dbProduct1.trim()
                    ? `Showing where Product-1 contains "${dbProduct1}"`
                    : `Showing where Product-2 contains "${dbProduct2}"`}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between mb-2">
              <div className="flex items-center gap-4 text-[0.85rem] font-medium text-[var(--color-text-secondary)]">
                <span className="bg-[var(--color-surface)] px-3 py-1.5 rounded-lg border shadow-sm">
                  <strong className="text-[var(--color-text-primary)]">{dbStats.unique}</strong> Unique Companies
                </span>
                <span className="bg-[var(--color-success-light)] text-[var(--color-success)] px-3 py-1.5 rounded-lg border border-[var(--color-success)]/20 shadow-sm">
                  <strong className="font-bold">{dbStats.verified}</strong> Verified (Y)
                </span>
                <span className="bg-[var(--color-danger-light)] text-[var(--color-danger)] px-3 py-1.5 rounded-lg border border-[var(--color-danger)]/20 shadow-sm">
                  <strong className="font-bold">{dbStats.nonVerified}</strong> Non-Verified (N)
                </span>
              </div>
              <button className="btn-primary py-1.5 px-4 text-[0.8rem]" onClick={handleSyncDbVujis} disabled={syncing}>
                <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync from Sheet"}
              </button>
            </div>

            {/* Table */}
            <div className="border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                <table className="data-table w-full text-[0.78rem]">
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Company Name</th>
                      <th>Country Name</th>
                      <th>Region</th>
                      <th className="text-center">Proof of Import (Y)</th>
                      <th className="text-center">Proof of Import (N)</th>
                      <th>Vujis</th>
                      <th>Import Value (USD)</th>
                      <th>Dollar Business</th>
                      <th>Import Value (USD) 2</th>
                      <th className="text-center">BOTH</th>
                      <th className="text-center">Importing from India</th>
                      <th className="text-center">Importing from Other</th>
                      <th>Main Import Product 1</th>
                      <th>Main Import Product 2</th>
                      <th>POC</th>
                      <th>Reason</th>
                      <th>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbLoading && (
                      <tr><td colSpan={18} className="text-center py-8 text-[var(--color-text-tertiary)]">Loading…</td></tr>
                    )}
                    {!dbLoading && filteredDb.length === 0 && (
                      <tr><td colSpan={18} className="text-center py-8 text-[var(--color-text-tertiary)]">No data found. Click Sync to pull from DB & Vujis sheet.</td></tr>
                    )}
                    {filteredDb.map((r, i) => (
                      <tr key={r.sr_no} className={i % 2 === 0 ? "" : "bg-[var(--color-bg-primary)]/40"}>
                        <td className="font-mono text-xs text-[var(--color-text-tertiary)]">{r.sr_no}</td>
                        <td className="font-semibold max-w-[160px] truncate" title={r.company_name}>{r.company_name}</td>
                        <td>{r.country_name}</td>
                        <td>{r.region}</td>
                        <td className="text-center">
                          {r.proof_of_import_y && <span className="badge badge-success text-[0.7rem] px-2">{r.proof_of_import_y}</span>}
                        </td>
                        <td className="text-center">
                          {r.proof_of_import_n && <span className="badge badge-danger text-[0.7rem] px-2">{r.proof_of_import_n}</span>}
                        </td>
                        <td className="text-[var(--color-text-tertiary)]">{r.vujis || "—"}</td>
                        <td className="text-[var(--color-text-tertiary)]">{r.import_value_vujis || "—"}</td>
                        <td className="text-[var(--color-text-tertiary)]">{r.dollar_business || "—"}</td>
                        <td className="text-[var(--color-text-tertiary)]">{r.import_value_dollar || "—"}</td>
                        <td className="text-center">
                          {r.both_db_vujis && <span className="badge badge-neutral text-[0.7rem] px-2">{r.both_db_vujis}</span>}
                        </td>
                        <td className="text-center">
                          {r.importing_from_india && <span className="text-[var(--color-success)] font-semibold">{r.importing_from_india}</span>}
                        </td>
                        <td className="text-center">
                          {r.importing_from_other_country && <span className="text-[var(--color-warning)] font-semibold">{r.importing_from_other_country}</span>}
                        </td>
                        <td className="max-w-[120px] truncate" title={r.main_import_product_1}>{r.main_import_product_1}</td>
                        <td className="max-w-[120px] truncate" title={r.main_import_product_2}>{r.main_import_product_2}</td>
                        <td className="font-medium">{r.poc}</td>
                        <td className="text-[var(--color-text-tertiary)]">{r.reason || "—"}</td>
                        <td className="max-w-[140px] truncate text-[var(--color-text-secondary)]" title={r.comment}>{r.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              * Click "Sync from Sheet" to fetch real-time updates from the "DB & vujis" Google Sheet tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
