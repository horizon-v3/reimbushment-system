"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search, Users, Globe, RefreshCw, Building2, X } from "lucide-react";
import type { RegistrationRow } from "@/lib/crm-utils";

const fetcher = (url: string) => fetch(url).then(r => r.json());

const EXCLUDED = ["sri lanka", "nepal", "bangladesh"];

interface Props {
  role: string;
}

export default function DelegatesPage({ role }: Props) {
  const { data, isLoading, mutate } = useSWR<{ rows: RegistrationRow[]; total: number }>(
    "/api/registrations?limit=5000",
    fetcher,
    { revalidateOnFocus: false }
  );

  const rows = data?.rows ?? [];

  const [search, setSearch]     = useState("");
  const [country, setCountry]   = useState("");
  const [sector, setSector]     = useState("");
  const [showExcl, setShowExcl] = useState(true);

  const isAdmin = role === "admin";

  // Unique filter options
  const countries = useMemo(() =>
    [...new Set(rows.map(r => r.country_name ?? r.passport_country ?? "").filter(Boolean))].sort()
  , [rows]);

  const sectors = useMemo(() =>
    [...new Set(rows.map(r => r.main_import_product_1 ?? "").filter(Boolean))].sort()
  , [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (!showExcl) list = list.filter(r => !EXCLUDED.includes((r.country_name ?? r.passport_country ?? "").toLowerCase()));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        [r.first_name, r.last_name, r.company_name, r.country_name, r.passport_country, r.participant_email]
          .some(v => (v ?? "").toLowerCase().includes(q))
      );
    }
    if (country) list = list.filter(r => (r.country_name ?? r.passport_country) === country);
    if (sector)  list = list.filter(r => r.main_import_product_1 === sector);
    return list;
  }, [rows, search, country, sector, showExcl]);

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#5856d6] flex items-center justify-center shadow-lg">
            <Users size={22} color="white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Registered Delegates
            </h1>
            <p className="text-[0.9rem] text-[var(--color-text-secondary)] mt-0.5">
              {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} delegates`}
            </p>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => mutate()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Registered", value: rows.length, color: "var(--color-accent)" },
          { label: "Countries",        value: countries.length, color: "#10b981" },
          { label: "Sectors",          value: sectors.length,   color: "#f59e0b" },
          {
            label: "Excl. SL/NP/BD",
            value: rows.filter(r => !EXCLUDED.includes((r.country_name ?? r.passport_country ?? "").toLowerCase())).length,
            color: "#8b5cf6"
          },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
            <div className="text-[0.72rem] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              id="delegates-search"
              type="search"
              className="input w-full pl-9 py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)]"
              placeholder="Search name, company, email, country…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Country filter */}
          <select
            id="delegates-country"
            className="input py-2 min-w-[160px] bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[0.85rem]"
            value={country}
            onChange={e => setCountry(e.target.value)}
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Sector filter */}
          <select
            id="delegates-sector"
            className="input py-2 min-w-[160px] bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[0.85rem]"
            value={sector}
            onChange={e => setSector(e.target.value)}
          >
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Excl toggle */}
          <label className="flex items-center gap-2 text-[0.82rem] font-medium text-[var(--color-text-secondary)] cursor-pointer select-none whitespace-nowrap">
            <input
              id="delegates-excl-toggle"
              type="checkbox"
              className="w-4 h-4 accent-[var(--color-accent)]"
              checked={showExcl}
              onChange={e => setShowExcl(e.target.checked)}
            />
            Include SL / NP / BD
          </label>

          {/* Clear */}
          {(search || country || sector) && (
            <button
              onClick={() => { setSearch(""); setCountry(""); setSector(""); }}
              className="flex items-center gap-1 px-3 py-2 text-[0.8rem] font-semibold rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)] transition-colors"
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[620px] custom-scrollbar">
          <table className="data-table w-full text-[0.8rem]">
            <thead>
              <tr>
                <th className="text-center w-10">Sr</th>
                <th>Name</th>
                <th>Company</th>
                <th><Globe size={12} className="inline mr-1" />Country</th>
                <th>Region</th>
                <th><Building2 size={12} className="inline mr-1" />Sector 1</th>
                <th>Sector 2</th>
                <th>POC</th>
                <th className="text-center">Flight &amp; Hotel</th>
                {isAdmin && <th className="text-center">Status</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="text-center py-12 text-[var(--color-text-tertiary)]">
                    <RefreshCw size={18} className="inline animate-spin mr-2" />Loading delegates…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="text-center py-12 text-[var(--color-text-tertiary)]">
                    No delegates match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const name = [r.title, r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
                const country = r.country_name ?? r.passport_country ?? "—";
                const fh = (r.flight_hotel_code ?? "").trim();
                return (
                  <tr key={r.id} className={i % 2 === 0 ? "" : "bg-[var(--color-bg-primary)]/40"}>
                    <td className="text-center font-mono text-xs text-[var(--color-text-tertiary)]">
                      {r.sr_no ?? i + 1}
                    </td>
                    <td>
                      <div className="font-semibold text-[var(--color-text-primary)] truncate max-w-[160px]" title={name}>
                        {name}
                      </div>
                    </td>
                    <td className="max-w-[150px] truncate font-medium" title={r.company_name ?? ""}>
                      {r.company_name ?? "—"}
                    </td>
                    <td>{country}</td>
                    <td className="text-[var(--color-text-secondary)]">{r.region ?? "—"}</td>
                    <td>
                      {r.main_import_product_1 ? (
                        <span className="badge badge-neutral text-[0.7rem]">{r.main_import_product_1}</span>
                      ) : "—"}
                    </td>
                    <td className="text-[var(--color-text-secondary)]">{r.main_import_product_2 ?? "—"}</td>
                    <td className="font-medium">{r.poc ?? "—"}</td>
                    <td className="text-center">
                      {fh ? (
                        <span className="badge badge-success text-[0.7rem] px-2">{fh}</span>
                      ) : (
                        <span className="text-[var(--color-text-tertiary)] text-xs">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="text-center">
                        {r.status ? (
                          <span className={`badge text-[0.7rem] px-2 ${
                            (r.status ?? "").toLowerCase().includes("confirm") ? "badge-success" :
                            (r.status ?? "").toLowerCase().includes("cancel") ? "badge-danger" :
                            "badge-neutral"
                          }`}>{r.status}</span>
                        ) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-[var(--color-border)] text-[0.75rem] text-[var(--color-text-tertiary)]">
          Showing {filtered.length.toLocaleString()} delegate{filtered.length !== 1 ? "s" : ""}
          {!isAdmin && " · View-only access"}
        </div>
      </div>
    </div>
  );
}
