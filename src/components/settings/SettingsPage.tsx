"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Save, RefreshCw, ExternalLink, CheckCircle2, AlertCircle,
  Plus, Shield, Pencil, Trash2, Eye, EyeOff, X, ChevronDown, Zap, Link2, Wifi,
} from "lucide-react";
import { pingGas } from "@/lib/gas-client";

// ─── URL → ID extractors ─────────────────────────────────────────────────────
function extractSheetId(raw: string): string {
  // Full URL: https://docs.google.com/spreadsheets/d/ID/edit...
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Already an ID (no slashes)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw.trim())) return raw.trim();
  return raw.trim();
}

function extractFolderId(raw: string): string {
  // Full URL: https://drive.google.com/drive/folders/ID
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Shared file URL: /file/d/ID
  const m2 = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // Already an ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw.trim())) return raw.trim();
  return raw.trim();
}

function extractGasUrl(raw: string): string {
  // Already a valid exec URL
  if (raw.includes("script.google.com") && raw.includes("/exec")) return raw.trim();
  return raw.trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────
type AppSettings = {
  gas_web_app_url: string;
  registration_sheet_id: string;
  registration_sheet_name: string;
  travel_sheet_name: string;
  db_vujis_sheet_name: string;
  drive_folder_id: string;
  session_timeout_minutes: number;
  backup_gas_web_app_url: string;
  backup_sheet_id: string;
  backup_folder_id: string;
  backup_sheet_id_2: string;
  backup_folder_id_2: string;
};

type StaffUser = {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  createdAt: string | null;
};

type NewUserForm = { email: string; password: string; name: string; role: string };
type EditUserForm = { id: number; name: string; role: string; password: string } | null;

// ─── Constants (outside component) ───────────────────────────────────────────
const ROLES = [
  { value: "admin",      label: "Admin",      desc: "Full access + user management" },
  { value: "supervisor", label: "Supervisor", desc: "Reports + CRM + Travel Desk"   },
  { value: "user",       label: "User",       desc: "Data Entry & Chat only"        },
];

const ROLE_COLOR: Record<string, string> = {
  admin: "#ff3b30", supervisor: "#0071e3", user: "#34c759",
};

// ─── Sub-components OUTSIDE main component (critical for focus stability) ─────

function RoleBadge({ role }: { role: string | null }) {
  const r = role ?? "user";
  const color = ROLE_COLOR[r] ?? "#8e8e93";
  const label = ROLES.find(x => x.value === r)?.label ?? r;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}

function Field({ id, label, value, onChange, type = "text", placeholder, hint }: FieldProps) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {hint && <p className="mt-1 text-xs text-[var(--color-text-tertiary)] font-medium">{hint}</p>}
    </div>
  );
}

interface SectionProps {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}

function Section({ isOpen, onToggle, title, icon, color, children }: SectionProps) {
  return (
    <div className="glass-card mb-4 overflow-hidden shadow-sm transition-all">
      <button onClick={onToggle} className={`w-full px-6 py-4 flex items-center gap-3 bg-transparent border-none cursor-pointer transition-colors hover:bg-[var(--color-bg-primary)] ${isOpen ? 'border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/50' : ''}`}>
        <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm" style={{ background: color }}>
          {icon}
        </div>
        <span className="font-semibold text-[0.95rem] flex-1 text-left text-[var(--color-text-primary)] tracking-tight">
          {title}
        </span>
        <ChevronDown size={18} className="text-[var(--color-text-tertiary)] transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
      </button>
      {isOpen && <div className="p-6">{children}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    gas_web_app_url: "", registration_sheet_id: "",
    registration_sheet_name: "Form Responses 1",
    travel_sheet_name: "Travel Desk Records",
    db_vujis_sheet_name: "DB & vujis", drive_folder_id: "",
    session_timeout_minutes: 30,
    backup_gas_web_app_url: "",
    backup_sheet_id: "",
    backup_folder_id: "",
    backup_sheet_id_2: "",
    backup_folder_id_2: "",
  });
  const [saving, setSaving] = useState(false);
  const [gasStatus, setGasStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pingMsg, setPingMsg] = useState("");
  const [openSection, setOpenSection] = useState<string>("quicksetup");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [sheetCreateMsg, setSheetCreateMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncingSheet2, setSyncingSheet2] = useState(false);
  const [syncSheet2Msg, setSyncSheet2Msg] = useState<{ ok: boolean; message: string } | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; message: string } | null>(null);

  const handleCreateTravelSheet = async () => {
    if (!settings.gas_web_app_url || !settings.registration_sheet_id) {
      toast.error("Save your GAS URL and Sheet ID first before creating the sheet.");
      return;
    }
    setCreatingSheet(true);
    setSheetCreateMsg(null);
    try {
      const res = await fetch("/api/settings/create-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gas_web_app_url:       settings.gas_web_app_url,
          registration_sheet_id: settings.registration_sheet_id,
          sheet_name:            "Travel Desk Sheet 2",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSheetCreateMsg({ ok: true, message: data.message ?? "Sheet 2 created successfully!" });
        toast.success("✅ Travel Desk Sheet 2 created!");
      } else {
        setSheetCreateMsg({ ok: false, message: data.error ?? "Failed to create sheet" });
        toast.error(data.error ?? "Failed to create sheet");
      }
    } catch (e) {
      toast.error("Request failed");
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSyncSheet2 = async () => {
    setSyncingSheet2(true);
    setSyncSheet2Msg(null);
    try {
      const res = await fetch("/api/travel/sync-sheet2", { method: "POST" });
      const data = await res.json();
      setSyncSheet2Msg({ ok: data.ok, message: data.message ?? (data.error ?? "Unknown error") });
      if (data.ok) {
        toast.success(`✅ ${data.message}`);
      } else {
        toast.error(data.error ?? "Sync failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setSyncingSheet2(false);
    }
  };

  // ── Connection verification state ─────────────────────────────────────────
  type ConnStatus = { ok: boolean; message: string };
  const [verifying, setVerifying] = useState(false);
  const [connStatus, setConnStatus] = useState<{
    gas: ConnStatus; sheet: ConnStatus; drive: ConnStatus;
  } | null>(null);

  const verifyConnections = useCallback(async (overrideSettings?: typeof settings) => {
    const s = overrideSettings ?? settings;
    if (!s.gas_web_app_url) {
      toast.error("Enter the GAS Web App URL first");
      return false;
    }
    setVerifying(true);
    setConnStatus(null);
    try {
      const res = await fetch("/api/settings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const data = await res.json();
      setConnStatus(data.results);
      if (data.ok) {
        toast.success("✅ All systems connected!");
      } else {
        toast.error("⚠️ Some connections failed — check status below");
      }
      return data.ok as boolean;
    } catch {
      toast.error("Verification request failed");
      return false;
    } finally {
      setVerifying(false);
    }
  }, [settings]);

  // ── Quick Setup state (paste URLs → auto-extract IDs) ─────────────────────
  const [quickSheet, setQuickSheet] = useState("");
  const [quickFolder, setQuickFolder] = useState("");
  const [quickGas, setQuickGas] = useState("");
  const [quickApplied, setQuickApplied] = useState(false);

  const applyQuickSetup = async () => {
    const sheetId  = extractSheetId(quickSheet);
    const folderId = extractFolderId(quickFolder);
    const gasUrl   = extractGasUrl(quickGas);
    const next = {
      ...settings,
      registration_sheet_id: sheetId  || settings.registration_sheet_id,
      drive_folder_id:        folderId || settings.drive_folder_id,
      gas_web_app_url:        gasUrl   || settings.gas_web_app_url,
    };
    setSettings(next);
    // Save first
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
      });
      if (res.ok) {
        setQuickApplied(true);
        toast.success("✅ Settings saved! Verifying connections…");
        // Auto-verify after save
        await verifyConnections(next);
      } else {
        toast.error("Save failed");
      }
    } catch { toast.error("Save failed"); }
  };


  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({ email: "", password: "", name: "", role: "user" });
  const [showPass, setShowPass] = useState(false);
  const [editUser, setEditUser] = useState<EditUserForm>(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) { const d = await res.json(); setUsers(d.users ?? []); }
      else if (res.status === 403) toast.error("Admin role required to view users");
    } finally { setLoadingUsers(false); }
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(({ settings: s }) => {
      if (s) setSettings({
        gas_web_app_url: s.gas_web_app_url ?? "",
        registration_sheet_id: s.registration_sheet_id ?? "",
        registration_sheet_name: s.registration_sheet_name ?? "Form Responses 1",
        travel_sheet_name: s.travel_sheet_name ?? "Travel Desk Records",
        db_vujis_sheet_name: s.db_vujis_sheet_name ?? "DB & vujis",
        drive_folder_id: s.drive_folder_id ?? "",
        session_timeout_minutes: parseInt(s.session_timeout_minutes ?? "30") || 30,
        backup_gas_web_app_url: s.backup_gas_web_app_url ?? "",
        backup_sheet_id: s.backup_sheet_id ?? "",
        backup_folder_id: s.backup_folder_id ?? "",
        backup_sheet_id_2: s.backup_sheet_id_2 ?? "",
        backup_folder_id_2: s.backup_folder_id_2 ?? "",
      });
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);



  // ── Settings ──────────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
      });
      if (res.ok) toast.success("Settings saved ✓");
      else toast.error("Save failed");
    } finally { setSaving(false); }
  };

  const testGas = async () => {
    setGasStatus("idle"); setPingMsg("Connecting…");
    const res = await pingGas();
    setGasStatus(res.ok ? "ok" : "error");
    setPingMsg(res.ok ? (res.message ?? "Connected ✓") : (res.error ?? "Connection failed"));
  };

  // ── User CRUD ─────────────────────────────────────────────────────────────
  const addUser = async () => {
    if (!newUser.email.trim()) return toast.error("Username is required");
    if (newUser.password.trim().length < 4) return toast.error("Password must be at least 4 characters");
    setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`User "${newUser.email}" created`);
        setNewUser({ email: "", password: "", name: "", role: "user" });
        setShowAdd(false);
        loadUsers();
      } else {
        toast.error(data.error ?? "Failed to create user");
      }
    } finally { setAdding(false); }
  };

  const updateUser = async () => {
    if (!editUser) return;
    setUpdatingUser(true);
    try {
      const body: Record<string, unknown> = { id: editUser.id, name: editUser.name, role: editUser.role };
      if (editUser.password.trim()) body.password = editUser.password;
      const res = await fetch("/api/admin/users", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { toast.success("User updated ✓"); setEditUser(null); loadUsers(); }
      else toast.error(data.error ?? "Update failed");
    } finally { setUpdatingUser(false); }
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) { toast.success("User deleted"); loadUsers(); }
      else toast.error(data.error ?? "Delete failed");
    } finally { setDeletingId(null); }
  };

  const toggle = (id: string) => setOpenSection(s => s === id ? "" : id);

  return (
    <div className="p-6 md:p-8 max-w-[860px] mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] mb-1.5">Settings</h1>
        <p className="text-[0.9rem] font-medium text-[var(--color-text-secondary)]">
          Manage staff accounts, Google integrations, and system configuration
        </p>
      </div>

      {/* ── ⚡ Quick Setup ─────────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "quicksetup"}
        onToggle={() => toggle("quicksetup")}
        title="⚡ Quick Setup — Paste & Configure"
        color="linear-gradient(135deg,#ff9500,#ff6b00)"
        icon={<Zap size={18} color="white" />}
      >
        <p className="text-[0.85rem] font-medium text-[var(--color-text-secondary)] mb-5 leading-relaxed bg-[var(--color-bg-primary)] p-3 rounded-lg border border-[var(--color-border)]/50">
          Paste your Google Sheet URL, Drive folder URL, and GAS Web App URL below.
          The IDs are extracted automatically — just click <strong className="text-[var(--color-text-primary)]">Apply & Save</strong>.
        </p>
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <label className="label flex items-center gap-1.5">
              <Link2 size={14} className="text-[var(--color-text-tertiary)]" /> Google Sheet URL or ID
            </label>
            <input
              className="input w-full"
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0… or just paste the ID"
              value={quickSheet}
              onChange={e => setQuickSheet(e.target.value)}
            />
            {quickSheet && (
              <p className="text-xs font-medium text-[var(--color-success)] mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={12} /> Extracted ID: <code className="font-mono bg-[var(--color-success-light)] px-1.5 py-0.5 rounded text-[0.7rem]">{extractSheetId(quickSheet)}</code>
              </p>
            )}
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Link2 size={14} className="text-[var(--color-text-tertiary)]" /> Drive Folder URL or ID
            </label>
            <input
              className="input w-full"
              placeholder="https://drive.google.com/drive/folders/1A2B3C… or just paste the ID"
              value={quickFolder}
              onChange={e => setQuickFolder(e.target.value)}
            />
            {quickFolder && (
              <p className="text-xs font-medium text-[var(--color-success)] mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={12} /> Extracted ID: <code className="font-mono bg-[var(--color-success-light)] px-1.5 py-0.5 rounded text-[0.7rem]">{extractFolderId(quickFolder)}</code>
              </p>
            )}
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Link2 size={14} className="text-[var(--color-text-tertiary)]" /> GAS Web App URL
            </label>
            <input
              className="input w-full"
              placeholder="https://script.google.com/macros/s/AKfy…/exec"
              value={quickGas}
              onChange={e => setQuickGas(e.target.value)}
            />
            {quickGas && quickGas.includes("/exec") && (
              <p className="text-xs font-medium text-[var(--color-success)] mt-1.5 flex items-center gap-1"><CheckCircle2 size={12} /> Valid GAS URL detected</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary py-2 px-5 shadow-sm font-semibold"
            onClick={applyQuickSetup}
            disabled={!quickSheet && !quickFolder && !quickGas}
          >
            <Zap size={15} /> Apply &amp; Save
          </button>
          {quickApplied && (
            <span className="text-[0.85rem] font-medium text-[var(--color-success)] flex items-center gap-1.5 bg-[var(--color-success-light)] px-3 py-1.5 rounded-lg">
              <CheckCircle2 size={15} /> All configured!
            </span>
          )}
        </div>
      </Section>

      {/* ── Staff Accounts ──────────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "users"}
        onToggle={() => toggle("users")}
        title="Staff Accounts & Access Control"
        color="linear-gradient(135deg,#0071e3,#5856d6)"
        icon={<Shield size={18} color="white" />}
      >
        <div className="flex justify-end gap-2 mb-5">
          <button className="btn-secondary py-1.5 px-3" onClick={loadUsers} title="Refresh">
            <RefreshCw size={14} className={loadingUsers ? "animate-spin" : ""} />
          </button>
          <button className="btn-primary py-1.5 px-4 shadow-sm" onClick={() => { setShowAdd(v => !v); }}>
            <Plus size={15} /> {showAdd ? "Cancel" : "Add Staff Account"}
          </button>
        </div>

        {/* Add user form — inputs use stable id/value/onChange pattern */}
        {showAdd && (
          <div className="bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20 rounded-xl p-5 mb-5 shadow-inner">
            <h3 className="font-semibold text-[0.95rem] mb-4 text-[var(--color-accent)] flex items-center gap-1.5"><Shield size={14} /> New Staff Account</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <Field
                id="new-email"
                label="Username / Email *"
                value={newUser.email}
                onChange={v => setNewUser(u => ({ ...u, email: v }))}
                placeholder="alice or alice@company.com"
              />
              <div>
                <label className="label" htmlFor="new-password">Password *</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPass ? "text" : "password"}
                    className="input pr-10"
                    value={newUser.password}
                    onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                    placeholder="Min 4 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors rounded bg-transparent border-none cursor-pointer">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <Field
                id="new-name"
                label="Display Name"
                value={newUser.name}
                onChange={v => setNewUser(u => ({ ...u, name: v }))}
                placeholder="Alice Smith"
              />
              <div>
                <label className="label" htmlFor="new-role">Role</label>
                <select id="new-role" className="input" value={newUser.role}
                  onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button className="btn-primary py-2 px-5 shadow-sm font-semibold" onClick={addUser} disabled={adding}>
                {adding ? "Creating…" : "Create Account"}
              </button>
              <button className="btn-secondary py-2 px-4" onClick={() => setShowAdd(false)}>
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Role guide */}
        <div className="flex gap-2 flex-wrap mb-5">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]/50 text-[0.75rem] font-medium">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ROLE_COLOR[r.value] }} />
              <strong className="text-[var(--color-text-primary)]">{r.label}</strong>
              <span className="text-[var(--color-text-tertiary)]">— {r.desc}</span>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface)] shadow-sm">
          {loadingUsers ? (
            <div className="p-8 text-center text-[var(--color-text-tertiary)] text-[0.875rem] font-medium flex justify-center items-center gap-2"><RefreshCw size={16} className="animate-spin" /> Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-[var(--color-text-tertiary)] text-[0.875rem] font-medium bg-[var(--color-bg-primary)]/30">
              No staff accounts yet. Create the first account above.
            </div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Account</th><th>Username / Email</th><th>Role</th><th>Created</th><th style={{ width: 80 }}>Actions</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[0.8125rem] font-bold shadow-sm" style={{ background: `linear-gradient(135deg,${ROLE_COLOR[u.role ?? "user"]},${ROLE_COLOR[u.role ?? "user"]}88)` }}>
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-[0.9rem] text-[var(--color-text-primary)]">{u.name ?? "—"}</span>
                      </div>
                    </td>
                    <td><code style={{ fontSize: "0.8125rem" }}>{u.email}</code></td>
                    <td><RoleBadge role={u.role} /></td>
                    <td className="text-[var(--color-text-tertiary)] font-medium text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button title="Edit" className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded-md transition-colors cursor-pointer"
                          onClick={() => setEditUser({ id: u.id, name: u.name ?? "", role: u.role ?? "user", password: "" })}>
                          <Pencil size={15} />
                        </button>
                        <button title="Delete" disabled={deletingId === u.id}
                          onClick={() => deleteUser(u.id, u.email)}
                          className="p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] rounded-md transition-colors cursor-pointer flex items-center">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* ── GAS Integration ────────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "gas"}
        onToggle={() => toggle("gas")}
        title="Google Apps Script (Drive + Sheets)"
        color="linear-gradient(135deg,#4285f4,#34a853)"
        icon={<ExternalLink size={18} color="white" />}
      >
        <div className="mb-5">
          <Field
            id="gas-url"
            label="GAS Web App URL"
            value={settings.gas_web_app_url}
            onChange={v => setSettings(s => ({ ...s, gas_web_app_url: v }))}
            placeholder="https://script.google.com/macros/s/…/exec"
            hint="Deploy gas/Code.gs → Web App → Anyone → copy URL here"
          />
        </div>
        <div className="flex items-center gap-3 mb-5">
          <button className="btn-secondary py-2" onClick={testGas}>
            <RefreshCw size={14} className={gasStatus === "idle" && pingMsg ? "animate-spin" : ""} /> Test Connection
          </button>
          {gasStatus !== "idle" && (
            <span className={`text-[0.85rem] flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-lg ${gasStatus === "ok" ? "text-[var(--color-success)] bg-[var(--color-success-light)]" : "text-[var(--color-danger)] bg-[var(--color-danger-light)]"}`}>
              {gasStatus === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {pingMsg}
            </span>
          )}
        </div>
        <div className="bg-[var(--color-bg-primary)] rounded-xl p-5 text-[0.85rem] border border-[var(--color-border)] shadow-inner">
          <p className="font-bold mb-2 flex items-center gap-1.5 text-[var(--color-text-primary)]"><Shield size={14} className="text-[var(--color-accent)]"/> Setup Instructions:</p>
          <ol className="list-decimal pl-5 space-y-1.5 text-[var(--color-text-secondary)] marker:text-[var(--color-text-tertiary)] marker:font-semibold">
            <li>Open <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline font-medium">script.google.com</a> → New Project</li>
            <li>Paste <code className="bg-[var(--color-surface)] px-1 py-0.5 rounded border border-[var(--color-border)] text-xs font-mono">gas/Code.gs</code> → set your folder ID in CONFIG block</li>
            <li>Deploy → Web App → Execute as <strong className="text-[var(--color-text-primary)]">Me</strong> → Access: <strong className="text-[var(--color-text-primary)]">Anyone</strong></li>
            <li>Copy Web App URL → paste above → Save</li>
          </ol>
        </div>
      </Section>

      {/* ── Google Sheets / Drive ──────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "sheets"}
        onToggle={() => toggle("sheets")}
        title="Google Sheets Backup & Drive Folder"
        color="linear-gradient(135deg,#34a853,#0f9d58)"
        icon={<Save size={18} color="white" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="sheet-id">Spreadsheet ID or URL</label>
            <input
              id="sheet-id" className="input"
              value={settings.registration_sheet_id}
              onChange={e => setSettings(s => ({ ...s, registration_sheet_id: extractSheetId(e.target.value) }))}
              onPaste={e => {
                e.preventDefault();
                setSettings(s => ({ ...s, registration_sheet_id: extractSheetId(e.clipboardData.getData("text")) }));
              }}
              placeholder="Paste URL or ID — auto-extracted"
            />
            <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)] font-medium">From URL: /spreadsheets/d/<strong className="text-[var(--color-text-secondary)]">[ID]</strong>/edit</p>
          </div>
          <div>
            <label className="label" htmlFor="drive-id">Drive Folder URL or ID</label>
            <input
              id="drive-id" className="input"
              value={settings.drive_folder_id}
              onChange={e => setSettings(s => ({ ...s, drive_folder_id: extractFolderId(e.target.value) }))}
              onPaste={e => {
                e.preventDefault();
                setSettings(s => ({ ...s, drive_folder_id: extractFolderId(e.clipboardData.getData("text")) }));
              }}
              placeholder="Paste URL or ID — auto-extracted"
            />
            <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)] font-medium">From URL: /folders/<strong className="text-[var(--color-text-secondary)]">[ID]</strong></p>
          </div>
          <Field id="reg-sheet-name" label="Registration Sheet Tab"
            value={settings.registration_sheet_name}
            onChange={v => setSettings(s => ({ ...s, registration_sheet_name: v }))}
            placeholder="Form Responses 1" />
          <Field id="travel-sheet-name" label="Travel Desk Sheet Tab"
            value={settings.travel_sheet_name}
            onChange={v => setSettings(s => ({ ...s, travel_sheet_name: v }))}
            placeholder="Travel Desk Records" />
          <Field id="dbvujis-sheet-name" label="DB & Vujis Sheet Tab"
            value={settings.db_vujis_sheet_name}
            onChange={v => setSettings(s => ({ ...s, db_vujis_sheet_name: v }))}
            placeholder="DB & vujis" />
        </div>

        {/* ── Sheet 2 Actions ── */}
        <div className="mt-5 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <p className="text-[0.875rem] font-semibold text-[var(--color-text-primary)] mb-1 flex items-center gap-2">
            <Save size={14} className="text-[#34a853]" /> Travel Desk Print Sheet (Sheet 2)
          </p>
          <p className="text-[0.8rem] text-[var(--color-text-tertiary)] mb-3 leading-relaxed">
            Creates a formatted tab <strong className="text-[var(--color-text-secondary)]">"Travel Desk Sheet 2"</strong> with exact columns:
            Sr.No, Hotel, Room, Flights, Invoice, Ticket, Visa, Status. 
            Use <strong>Sync All</strong> to backfill existing records.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-secondary py-2 px-4 font-semibold" onClick={handleCreateTravelSheet} disabled={creatingSheet}>
              <RefreshCw size={14} className={creatingSheet ? "animate-spin" : ""} />
              {creatingSheet ? "Creating…" : "Create / Reset Sheet 2"}
            </button>
            <button className="btn-secondary py-2 px-4 font-semibold" onClick={handleSyncSheet2} disabled={syncingSheet2}>
              <RefreshCw size={14} className={syncingSheet2 ? "animate-spin" : ""} />
              {syncingSheet2 ? "Syncing…" : "Sync All Records → Sheet 2"}
            </button>
          </div>
          {sheetCreateMsg && (
            <p className={`mt-2 text-[0.82rem] font-medium flex items-center gap-1.5 ${sheetCreateMsg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {sheetCreateMsg.ok ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>} {sheetCreateMsg.message}
            </p>
          )}
          {syncSheet2Msg && (
            <p className={`mt-2 text-[0.82rem] font-medium flex items-center gap-1.5 ${syncSheet2Msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {syncSheet2Msg.ok ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>} {syncSheet2Msg.message}
            </p>
          )}
        </div>
      </Section>

      {/* ── Session Timeout ──────────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "session"}
        onToggle={() => toggle("session")}
        title="Security — Inactivity Timeout"
        color="linear-gradient(135deg,#ff3b30,#ff6b00)"
        icon={<Shield size={18} color="white" />}
      >
        <p className="text-[0.85rem] text-[var(--color-text-secondary)] mb-5 leading-relaxed">
          Automatically log out all users after this period of inactivity.
          A warning banner will appear 60 seconds before expiry.
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="session-timeout">
              Inactivity Timeout:
              <strong className="ml-2 text-[var(--color-text-primary)]">
                {settings.session_timeout_minutes} minute{settings.session_timeout_minutes !== 1 ? "s" : ""}
              </strong>
            </label>
            <input
              id="session-timeout"
              type="range"
              min="1" max="480" step="5"
              value={settings.session_timeout_minutes}
              onChange={e => setSettings(s => ({ ...s, session_timeout_minutes: parseInt(e.target.value) }))}
              className="w-full mt-2 accent-[var(--color-accent)]"
              style={{ height: "6px", borderRadius: "3px", cursor: "pointer" }}
            />
            <div className="flex justify-between text-[0.7rem] text-[var(--color-text-tertiary)] mt-1">
              <span>1 min</span><span>30 min</span><span>1 hr</span><span>2 hr</span><span>4 hr</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[5,10,15,30,60,120,240].map(m => (
              <button
                key={m}
                onClick={() => setSettings(s => ({ ...s, session_timeout_minutes: m }))}
                className={`px-3 py-1.5 rounded-lg text-[0.8rem] font-semibold border transition-colors cursor-pointer ${
                  settings.session_timeout_minutes === m
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                }`}
              >
                {m < 60 ? `${m}m` : `${m/60}h`}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Backup Configuration ────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "backup"}
        onToggle={() => toggle("backup")}
        title="Backup Destination — Secondary Google Account"
        color="linear-gradient(135deg,#5856d6,#0071e3)"
        icon={<Save size={18} color="white" />}
      >
        <div className="bg-[var(--color-accent-light)] border border-[var(--color-accent)]/30 rounded-xl p-4 mb-5 text-[0.82rem] text-[var(--color-accent)] font-medium leading-relaxed">
          <p className="mb-1 font-bold">Enterprise Backup Architecture</p>
          <p>Configure a <strong>separate Google account</strong> with its own GAS script, spreadsheet, and Drive folder.
          Every registration and travel record will automatically sync to both primary and backup destinations.
          Up to 2 backup folders/sheets are supported for maximum redundancy.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            id="backup-gas-url"
            label="Backup GAS Web App URL"
            value={settings.backup_gas_web_app_url}
            onChange={v => setSettings(s => ({ ...s, backup_gas_web_app_url: v }))}
            placeholder="https://script.google.com/macros/s/…/exec"
            hint="GAS deployed from the secondary/backup Google account"
          />
          <div>
            <label className="label" htmlFor="backup-sheet-id">Backup Spreadsheet ID or URL</label>
            <input
              id="backup-sheet-id" className="input"
              value={settings.backup_sheet_id}
              onChange={e => setSettings(s => ({ ...s, backup_sheet_id: extractSheetId(e.target.value) }))}
              onPaste={e => { e.preventDefault(); setSettings(s => ({ ...s, backup_sheet_id: extractSheetId(e.clipboardData.getData("text")) })); }}
              placeholder="Paste URL or Sheet ID — auto-extracted"
            />
          </div>
          <div>
            <label className="label" htmlFor="backup-folder-id">Backup Drive Folder URL or ID</label>
            <input
              id="backup-folder-id" className="input"
              value={settings.backup_folder_id}
              onChange={e => setSettings(s => ({ ...s, backup_folder_id: extractFolderId(e.target.value) }))}
              onPaste={e => { e.preventDefault(); setSettings(s => ({ ...s, backup_folder_id: extractFolderId(e.clipboardData.getData("text")) })); }}
              placeholder="Paste URL or Folder ID — auto-extracted"
            />
          </div>
          <div className="md:col-span-2">
            <p className="text-[0.8rem] font-bold text-[var(--color-text-secondary)] mb-3 flex items-center gap-1.5">
              <ExternalLink size={13} /> Second Backup (Optional — for double redundancy)
            </p>
          </div>
          <div>
            <label className="label" htmlFor="backup-sheet-id-2">Backup Spreadsheet ID #2 (optional)</label>
            <input
              id="backup-sheet-id-2" className="input"
              value={settings.backup_sheet_id_2}
              onChange={e => setSettings(s => ({ ...s, backup_sheet_id_2: extractSheetId(e.target.value) }))}
              onPaste={e => { e.preventDefault(); setSettings(s => ({ ...s, backup_sheet_id_2: extractSheetId(e.clipboardData.getData("text")) })); }}
              placeholder="Second backup sheet (optional)"
            />
          </div>
          <div>
            <label className="label" htmlFor="backup-folder-id-2">Backup Drive Folder ID #2 (optional)</label>
            <input
              id="backup-folder-id-2" className="input"
              value={settings.backup_folder_id_2}
              onChange={e => setSettings(s => ({ ...s, backup_folder_id_2: extractFolderId(e.target.value) }))}
              onPaste={e => { e.preventDefault(); setSettings(s => ({ ...s, backup_folder_id_2: extractFolderId(e.clipboardData.getData("text")) })); }}
              placeholder="Second backup folder (optional)"
            />
          </div>
          {/* Run backup actions */}
          <div className="md:col-span-2 pt-2 border-t border-[var(--color-border)] mt-2">
            <p className="text-[0.8rem] font-bold text-[var(--color-text-secondary)] mb-3">Manual Backup Trigger</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-primary py-2 px-5 font-semibold shadow-sm"
                onClick={async () => {
                  setRunningBackup(true); setBackupMsg(null);
                  try {
                    const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "registration" }) });
                    const data = await res.json();
                    setBackupMsg({ ok: data.ok, message: data.message ?? data.error ?? "Done" });
                    if (data.ok) toast.success(`✅ ${data.message}`); else toast.error(data.error ?? "Backup failed");
                  } catch { toast.error("Request failed"); } finally { setRunningBackup(false); }
                }}
                disabled={runningBackup}
              >
                <RefreshCw size={14} className={runningBackup ? "animate-spin" : ""} />
                {runningBackup ? "Backing up…" : "Backup Registrations Now"}
              </button>
              <button
                className="btn-secondary py-2 px-4 font-semibold"
                onClick={async () => {
                  setRunningBackup(true); setBackupMsg(null);
                  try {
                    const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "travel" }) });
                    const data = await res.json();
                    setBackupMsg({ ok: data.ok, message: data.message ?? data.error ?? "Done" });
                    if (data.ok) toast.success(`✅ ${data.message}`); else toast.error(data.error ?? "Backup failed");
                  } catch { toast.error("Request failed"); } finally { setRunningBackup(false); }
                }}
                disabled={runningBackup}
              >
                <RefreshCw size={14} className={runningBackup ? "animate-spin" : ""} />
                {runningBackup ? "Running…" : "Backup Travel Records Now"}
              </button>
            </div>
            {backupMsg && (
              <p className={`mt-2 text-[0.82rem] font-medium flex items-center gap-1.5 ${backupMsg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                {backupMsg.ok ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>} {backupMsg.message}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Connection Status Panel ─────────────────────────────────────────*/}
      {connStatus && (
        <div className="glass-card mb-4 overflow-hidden shadow-sm p-5">
          <h3 className="font-bold text-[0.95rem] mb-3 flex items-center gap-2 text-[var(--color-text-primary)]">
            <Wifi size={16} className="text-[var(--color-accent)]" /> Connection Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { key: "gas",   label: "Google Apps Script" },
              { key: "sheet", label: "Google Sheet"        },
              { key: "drive", label: "Google Drive"        },
            ] as { key: keyof typeof connStatus; label: string }[]).map(({ key, label }) => {
              const s = connStatus[key];
              return (
                <div key={key} className={`flex items-start gap-2.5 p-3 rounded-xl border text-[0.8rem] font-medium ${
                  s.ok
                    ? "bg-[var(--color-success-light)] border-[var(--color-success)]/30 text-[var(--color-success)]"
                    : "bg-[var(--color-danger-light)] border-[var(--color-danger)]/30 text-[var(--color-danger)]"
                }`}>
                  {s.ok
                    ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                    : <AlertCircle  size={16} className="shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold">{label}</p>
                    <p className="opacity-80 font-normal text-[0.75rem] mt-0.5">{s.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Save ──────────────────────────────────────────────────────────────*/}
      <div className="flex justify-end items-center gap-3 mt-6">
        <button
          className="btn-secondary py-3 px-6 font-semibold"
          onClick={() => verifyConnections()}
          disabled={verifying}
        >
          <Wifi size={15} className={verifying ? "animate-pulse" : ""} />
          {verifying ? "Verifying…" : "Test All Connections"}
        </button>
        <button className="btn-primary py-3 px-8 shadow-md font-bold text-[0.95rem]" onClick={saveSettings} disabled={saving}>
          <Save size={16} /> {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card-elevated w-full max-w-[420px] p-6 animate-scale-in">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[1.1rem]">Edit Account</h3>
              <button onClick={() => setEditUser(null)} className="p-1.5 rounded-md hover:bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <Field id="edit-name" label="Display Name"
                value={editUser.name}
                onChange={v => setEditUser(e => e ? { ...e, name: v } : null)}
                placeholder="Alice Smith" />
              <div>
                <label className="label" htmlFor="edit-role">Role</label>
                <select id="edit-role" className="input" value={editUser.role}
                  onChange={e => setEditUser(u => u ? { ...u, role: e.target.value } : null)}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="edit-password">
                  New Password <span className="text-[var(--color-text-tertiary)] font-normal ml-1">(blank = keep current)</span>
                </label>
                <input id="edit-password" type="password" className="input" value={editUser.password}
                  onChange={e => setEditUser(u => u ? { ...u, password: e.target.value } : null)}
                  placeholder="New password (optional)" autoComplete="new-password" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn-primary flex-1 justify-center py-2.5 font-semibold shadow-sm" onClick={updateUser} disabled={updatingUser}>
                {updatingUser ? "Saving…" : "Save Changes"}
              </button>
              <button className="btn-secondary py-2.5 px-5" onClick={() => setEditUser(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
