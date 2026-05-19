"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  ShieldAlert, RefreshCw, Search, Ban, CheckCircle2,
  XCircle, Clock, LogIn, LogOut, Trash2, Upload,
  Settings, Users, Filter, ChevronDown,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface LogEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  status: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Permission {
  id: number;
  requested_by: number;
  requested_by_name: string;
  operation: string;
  description: string | null;
  status: string;
  approved_by_name: string | null;
  confirmed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const ACTION_ICON: Record<string, React.ReactNode> = {
  login:             <LogIn size={13} />,
  logout:            <LogOut size={13} />,
  sync:              <Upload size={13} />,
  sync_db_vujis:     <Upload size={13} />,
  sync_sheet2:       <Upload size={13} />,
  delete:            <Trash2 size={13} />,
  delete_travel_record_blocked: <Ban size={13} />,
  settings:          <Settings size={13} />,
  default:           <ShieldAlert size={13} />,
};

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed:  "bg-red-100 text-red-700 border-red-200",
  blocked: "bg-orange-100 text-orange-700 border-orange-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function OperationLogPage() {
  const [search,    setSearch]    = useState("");
  const [tab,       setTab]       = useState<"log" | "permissions">("log");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmErr,  setConfirmErr]  = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const logUrl = `/api/operation-log?limit=200${search ? `&filter=${encodeURIComponent(search)}` : ""}`;
  const { data: logData, isLoading: logLoading, mutate: reloadLog } =
    useSWR<{ logs: LogEntry[]; total: number }>(logUrl, fetcher, { refreshInterval: 30_000 });

  const { data: permData, isLoading: permLoading, mutate: reloadPerms } =
    useSWR<{ permissions: Permission[] }>("/api/operation-permissions", fetcher, { refreshInterval: 15_000 });

  const logs  = logData?.logs  ?? [];
  const perms = permData?.permissions ?? [];
  const pendingCount = perms.filter(p => p.status === "pending").length;

  // ── Block a log entry ────────────────────────────────────────────────────────
  const blockLog = useCallback(async (id: number) => {
    setActionLoading(id);
    await fetch(`/api/operation-log?id=${id}`, { method: "DELETE" });
    await reloadLog();
    setActionLoading(null);
  }, [reloadLog]);

  // ── Approve/deny a permission request ───────────────────────────────────────
  const handlePermAction = useCallback(async (
    id: number, action: "approve" | "deny" | "revoke"
  ) => {
    if (action === "approve" && confirmText.toLowerCase() !== "confirm") {
      setConfirmErr('Type exactly "confirm" to approve');
      return;
    }
    setActionLoading(id);
    const res = await fetch("/api/operation-permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, confirmText }),
    });
    const body = await res.json();
    if (!res.ok) {
      setConfirmErr(body.error ?? "Error");
      setActionLoading(null);
      return;
    }
    setConfirmId(null);
    setConfirmText("");
    setConfirmErr("");
    setActionLoading(null);
    await reloadPerms();
  }, [confirmText, reloadPerms]);

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg">
            <ShieldAlert size={22} color="white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Operation Log
            </h1>
            <p className="text-[0.9rem] text-[var(--color-text-secondary)] mt-0.5">
              Real-time audit trail · Admin only
            </p>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => { reloadLog(); reloadPerms(); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-6 border-b border-[var(--color-border)]">
        <button
          className={`px-4 py-2.5 text-[0.85rem] font-semibold border-b-2 transition-colors ${tab === "log" ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
          onClick={() => setTab("log")}
        >
          Audit Log {logData?.total != null && <span className="ml-1.5 text-xs bg-[var(--color-surface)] px-1.5 py-0.5 rounded-full">{logData.total}</span>}
        </button>
        <button
          className={`px-4 py-2.5 text-[0.85rem] font-semibold border-b-2 transition-colors relative ${tab === "permissions" ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
          onClick={() => setTab("permissions")}
        >
          Permission Requests
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[0.65rem] font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════ AUDIT LOG TAB */}
      {tab === "log" && (
        <>
          {/* Search */}
          <div className="glass-card p-3 mb-4">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                id="oplog-search"
                type="search"
                className="input w-full pl-9 py-2 bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[0.85rem]"
                placeholder="Filter by action, entity, user name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total Events",   value: logData?.total ?? 0,                                    color: "var(--color-accent)" },
              { label: "Success",        value: logs.filter(l => l.status === "success").length,        color: "#10b981" },
              { label: "Failed",         value: logs.filter(l => l.status === "failed").length,         color: "#ef4444" },
              { label: "Blocked",        value: logs.filter(l => l.status === "blocked").length,        color: "#f59e0b" },
            ].map(s => (
              <div key={s.label} className="glass-card p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
                <div className="text-[0.7rem] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="glass-card p-0 overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
              <table className="data-table w-full text-[0.78rem]">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Time</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Status</th>
                    <th>IP Address</th>
                    <th>Details</th>
                    <th className="text-center w-20">Admin Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logLoading && (
                    <tr><td colSpan={10} className="text-center py-12 text-[var(--color-text-tertiary)]">
                      <RefreshCw size={16} className="inline animate-spin mr-2" />Loading logs…
                    </td></tr>
                  )}
                  {!logLoading && logs.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-12 text-[var(--color-text-tertiary)]">
                      No log entries found.
                    </td></tr>
                  )}
                  {logs.map((log, i) => {
                    const icon = ACTION_ICON[log.action] ?? ACTION_ICON.default;
                    const statusStyle = STATUS_STYLE[log.status ?? "success"] ?? STATUS_STYLE.success;
                    const meta = log.metadata as Record<string, unknown> | null;
                    return (
                      <tr key={log.id} className={`${i % 2 === 0 ? "" : "bg-[var(--color-bg-primary)]/40"} ${log.status === "blocked" ? "opacity-60" : ""}`}>
                        <td className="font-mono text-xs text-[var(--color-text-tertiary)]">{log.id}</td>
                        <td className="whitespace-nowrap text-[0.72rem] text-[var(--color-text-secondary)]">{fmt(log.created_at)}</td>
                        <td className="font-semibold text-[var(--color-text-primary)]">{log.user_name ?? `UID:${log.user_id}` ?? "—"}</td>
                        <td>
                          <span className={`badge text-[0.65rem] px-2 ${
                            log.user_role === "admin" ? "badge-danger" :
                            log.user_role === "supervisor" ? "badge-neutral" :
                            "badge-neutral opacity-70"}`}>
                            {log.user_role ?? "—"}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 font-mono text-[0.72rem]">
                            <span className="text-[var(--color-text-tertiary)]">{icon}</span>
                            {log.action}
                          </div>
                        </td>
                        <td className="text-[var(--color-text-secondary)] text-[0.72rem]">
                          {log.entity_type ?? "—"}{log.entity_id ? ` #${log.entity_id}` : ""}
                        </td>
                        <td>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${statusStyle}`}>
                            {log.status === "success" ? <CheckCircle2 size={10} /> :
                             log.status === "failed"  ? <XCircle size={10} /> :
                             log.status === "blocked" ? <Ban size={10} /> :
                             <Clock size={10} />}
                            {log.status}
                          </span>
                        </td>
                        <td className="font-mono text-[0.72rem] text-[var(--color-text-secondary)]">
                          {log.ip_address ?? "—"}
                        </td>
                        <td className="text-[0.7rem] text-[var(--color-text-tertiary)] max-w-[160px] truncate" title={meta ? JSON.stringify(meta) : ""}>
                          {meta ? JSON.stringify(meta).slice(0, 80) : "—"}
                        </td>
                        <td className="text-center">
                          {log.status !== "blocked" && (
                            <button
                              id={`block-log-${log.id}`}
                              title="Mark as blocked / stop this user's operation"
                              onClick={() => blockLog(log.id)}
                              disabled={actionLoading === log.id}
                              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
                            >
                              {actionLoading === log.id
                                ? <RefreshCw size={12} className="animate-spin" />
                                : <Ban size={12} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-[var(--color-border)] text-[0.75rem] text-[var(--color-text-tertiary)] flex justify-between">
              <span>Showing {logs.length.toLocaleString()} of {(logData?.total ?? 0).toLocaleString()} entries (latest 200)</span>
              <span>Auto-refreshes every 30s</span>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════ PERMISSIONS TAB */}
      {tab === "permissions" && (
        <div className="glass-card p-0 overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border)] bg-amber-50 flex items-start gap-3">
            <ShieldAlert size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-[0.82rem] text-amber-800">
              <strong>Supervisor Overwrite Requests</strong> — Supervisors must request admin
              approval before overwriting data. Admin must type <code className="bg-amber-100 px-1 rounded font-mono">confirm</code> to
              approve. Approval expires after 24 hours.
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[560px] custom-scrollbar">
            <table className="data-table w-full text-[0.8rem]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Requested By</th>
                  <th>Operation</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Approved By</th>
                  <th>Expires</th>
                  <th>Requested At</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {permLoading && (
                  <tr><td colSpan={9} className="text-center py-12 text-[var(--color-text-tertiary)]">
                    <RefreshCw size={16} className="inline animate-spin mr-2" />Loading…
                  </td></tr>
                )}
                {!permLoading && perms.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-[var(--color-text-tertiary)]">
                    No permission requests yet.
                  </td></tr>
                )}
                {perms.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? "" : "bg-[var(--color-bg-primary)]/40"}>
                    <td className="font-mono text-xs text-[var(--color-text-tertiary)]">{p.id}</td>
                    <td className="font-semibold">{p.requested_by_name}</td>
                    <td className="font-mono text-[0.72rem]">{p.operation}</td>
                    <td className="text-[var(--color-text-secondary)] max-w-[160px] truncate" title={p.description ?? ""}>{p.description ?? "—"}</td>
                    <td>
                      <span className={`badge text-[0.68rem] px-2 ${
                        p.status === "approved" ? "badge-success" :
                        p.status === "denied"   ? "badge-danger" :
                        p.status === "revoked"  ? "badge-danger opacity-70" :
                        "badge-neutral"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-[var(--color-text-secondary)]">{p.approved_by_name ?? "—"}</td>
                    <td className="text-[0.72rem] text-[var(--color-text-secondary)]">
                      {p.expires_at ? fmt(p.expires_at) : "—"}
                    </td>
                    <td className="text-[0.72rem] text-[var(--color-text-secondary)] whitespace-nowrap">{fmt(p.created_at)}</td>
                    <td className="text-center">
                      {p.status === "pending" && (
                        <>
                          {confirmId === p.id ? (
                            <div className="flex flex-col gap-1.5 min-w-[180px] text-left p-2">
                              <p className="text-[0.72rem] font-semibold text-[var(--color-text-primary)]">
                                Type <code className="bg-[var(--color-surface)] px-1 rounded font-mono text-rose-600">confirm</code> to approve:
                              </p>
                              <input
                                id={`confirm-input-${p.id}`}
                                type="text"
                                className="input py-1 px-2 text-[0.8rem] border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                value={confirmText}
                                onChange={e => { setConfirmText(e.target.value); setConfirmErr(""); }}
                                placeholder="confirm"
                                autoFocus
                              />
                              {confirmErr && <p className="text-[0.7rem] text-rose-600">{confirmErr}</p>}
                              <div className="flex gap-1.5 mt-1">
                                <button
                                  id={`approve-btn-${p.id}`}
                                  onClick={() => handlePermAction(p.id, "approve")}
                                  disabled={actionLoading === p.id}
                                  className="px-2.5 py-1 text-[0.75rem] font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-40 flex items-center gap-1"
                                >
                                  {actionLoading === p.id ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => { setConfirmId(null); setConfirmText(""); setConfirmErr(""); }}
                                  className="px-2.5 py-1 text-[0.75rem] font-semibold bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-border)] transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 justify-center">
                              <button
                                id={`open-approve-${p.id}`}
                                onClick={() => { setConfirmId(p.id); setConfirmText(""); setConfirmErr(""); }}
                                className="px-2.5 py-1 text-[0.72rem] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition flex items-center gap-1"
                              >
                                <CheckCircle2 size={11} /> Approve
                              </button>
                              <button
                                id={`deny-btn-${p.id}`}
                                onClick={() => handlePermAction(p.id, "deny")}
                                disabled={actionLoading === p.id}
                                className="px-2.5 py-1 text-[0.72rem] font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center gap-1 disabled:opacity-40"
                              >
                                <XCircle size={11} /> Deny
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {p.status === "approved" && (
                        <button
                          id={`revoke-btn-${p.id}`}
                          onClick={() => handlePermAction(p.id, "revoke")}
                          disabled={actionLoading === p.id}
                          className="px-2.5 py-1 text-[0.72rem] font-semibold bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition flex items-center gap-1 mx-auto disabled:opacity-40"
                        >
                          <Ban size={11} /> Revoke
                        </button>
                      )}
                      {(p.status === "denied" || p.status === "revoked") && (
                        <span className="text-[0.7rem] text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
