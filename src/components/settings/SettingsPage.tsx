"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Save, RefreshCw, ExternalLink, CheckCircle2, AlertCircle,
  Plus, Shield, Pencil, Trash2, Eye, EyeOff, X, ChevronDown,
} from "lucide-react";
import { pingGas } from "@/lib/gas-client";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppSettings = {
  gas_web_app_url: string;
  registration_sheet_id: string;
  registration_sheet_name: string;
  travel_sheet_name: string;
  drive_folder_id: string;
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
  { value: "admin",    label: "Admin",     desc: "Full access + user management" },
  { value: "manager",  label: "Manager",   desc: "All data, no user management"  },
  { value: "staff",    label: "Staff",     desc: "CRM + Travel Desk"             },
  { value: "readonly", label: "Read Only", desc: "View only"                     },
];

const ROLE_COLOR: Record<string, string> = {
  admin: "#ff3b30", manager: "#ff9500", staff: "#0071e3", readonly: "#8e8e93",
};

// ─── Sub-components OUTSIDE main component (critical for focus stability) ─────

function RoleBadge({ role }: { role: string | null }) {
  const r = role ?? "staff";
  const color = ROLE_COLOR[r] ?? "#8e8e93";
  const label = ROLES.find(x => x.value === r)?.label ?? r;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 10px",
      borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
      background: `${color}18`, color,
    }}>{label}</span>
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
      {hint && <p style={{ marginTop: 4, fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>{hint}</p>}
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
    <div className="glass-card" style={{ marginBottom: "1rem", overflow: "hidden" }}>
      <button onClick={onToggle} style={{
        width: "100%", padding: "1.125rem 1.5rem", display: "flex", alignItems: "center",
        gap: "0.75rem", background: "none", border: "none", cursor: "pointer",
        borderBottom: isOpen ? "1px solid var(--color-border)" : "none",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: color, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{icon}</div>
        <span style={{ fontWeight: 600, fontSize: "0.9375rem", flex: 1, textAlign: "left", color: "var(--color-text-primary)" }}>
          {title}
        </span>
        <ChevronDown size={16} color="var(--color-text-tertiary)"
          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {isOpen && <div style={{ padding: "1.5rem" }}>{children}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    gas_web_app_url: "", registration_sheet_id: "",
    registration_sheet_name: "Form Responses 1",
    travel_sheet_name: "Travel Desk Records", drive_folder_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [gasStatus, setGasStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pingMsg, setPingMsg] = useState("");
  const [openSection, setOpenSection] = useState<string>("users");

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({ email: "", password: "", name: "", role: "staff" });
  const [showPass, setShowPass] = useState(false);
  const [editUser, setEditUser] = useState<EditUserForm>(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(({ settings: s }) => {
      if (s) setSettings({
        gas_web_app_url: s.gas_web_app_url ?? "",
        registration_sheet_id: s.registration_sheet_id ?? "",
        registration_sheet_name: s.registration_sheet_name ?? "Form Responses 1",
        travel_sheet_name: s.travel_sheet_name ?? "Travel Desk Records",
        drive_folder_id: s.drive_folder_id ?? "",
      });
    }).catch(console.error);
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) { const d = await res.json(); setUsers(d.users ?? []); }
      else if (res.status === 403) toast.error("Admin role required to view users");
    } finally { setLoadingUsers(false); }
  }, []);

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
        setNewUser({ email: "", password: "", name: "", role: "staff" });
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
    <div style={{ padding: "1.5rem 2rem", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.625rem", fontWeight: 700 }}>Settings</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
          Manage staff accounts, Google integrations, and system configuration
        </p>
      </div>

      {/* ── Staff Accounts ─────────────────────────────────────────────────── */}
      <Section
        isOpen={openSection === "users"}
        onToggle={() => toggle("users")}
        title="Staff Accounts & Access Control"
        color="linear-gradient(135deg,#0071e3,#5856d6)"
        icon={<Shield size={18} color="white" />}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: "1rem" }}>
          <button className="btn-secondary" onClick={loadUsers} title="Refresh">
            <RefreshCw size={13} style={{ animation: loadingUsers ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button className="btn-primary" onClick={() => { setShowAdd(v => !v); }}>
            <Plus size={14} /> {showAdd ? "Cancel" : "Add Staff Account"}
          </button>
        </div>

        {/* Add user form — inputs use stable id/value/onChange pattern */}
        {showAdd && (
          <div style={{
            background: "rgba(0,113,227,0.05)", border: "1px solid rgba(0,113,227,0.2)",
            borderRadius: 12, padding: "1.25rem", marginBottom: "1.25rem",
          }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "1rem" }}>New Staff Account</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <Field
                id="new-email"
                label="Username / Email *"
                value={newUser.email}
                onChange={v => setNewUser(u => ({ ...u, email: v }))}
                placeholder="alice or alice@company.com"
              />
              <div>
                <label className="label" htmlFor="new-password">Password *</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="new-password"
                    type={showPass ? "text" : "password"}
                    className="input"
                    value={newUser.password}
                    onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                    placeholder="Min 4 characters"
                    style={{ paddingRight: "2.5rem" }}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)",
                  }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
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
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={addUser} disabled={adding}>
                {adding ? "Creating…" : "Create Account"}
              </button>
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Role guide */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1rem" }}>
          {ROLES.map(r => (
            <div key={r.value} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              borderRadius: 8, background: "rgba(120,120,128,0.08)", fontSize: "0.75rem",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_COLOR[r.value], flexShrink: 0 }} />
              <strong style={{ color: "var(--color-text-primary)" }}>{r.label}</strong>
              <span style={{ color: "var(--color-text-tertiary)" }}>— {r.desc}</span>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
          {loadingUsers ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          background: `linear-gradient(135deg,${ROLE_COLOR[u.role ?? "staff"]},${ROLE_COLOR[u.role ?? "staff"]}88)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.8125rem", fontWeight: 700, color: "white",
                        }}>
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{u.name ?? "—"}</span>
                      </div>
                    </td>
                    <td><code style={{ fontSize: "0.8125rem" }}>{u.email}</code></td>
                    <td><RoleBadge role={u.role} /></td>
                    <td style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button title="Edit" className="btn-secondary" style={{ padding: "0.25rem 0.5rem" }}
                          onClick={() => setEditUser({ id: u.id, name: u.name ?? "", role: u.role ?? "staff", password: "" })}>
                          <Pencil size={13} />
                        </button>
                        <button title="Delete" disabled={deletingId === u.id}
                          onClick={() => deleteUser(u.id, u.email)}
                          style={{ padding: "0.25rem 0.5rem", background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 8, cursor: "pointer", color: "#ff3b30", display: "flex", alignItems: "center" }}>
                          <Trash2 size={13} />
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
        <div style={{ marginBottom: "1rem" }}>
          <Field
            id="gas-url"
            label="GAS Web App URL"
            value={settings.gas_web_app_url}
            onChange={v => setSettings(s => ({ ...s, gas_web_app_url: v }))}
            placeholder="https://script.google.com/macros/s/…/exec"
            hint="Deploy gas/Code.gs → Web App → Anyone → copy URL here"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
          <button className="btn-secondary" onClick={testGas}>
            <RefreshCw size={13} /> Test Connection
          </button>
          {gasStatus !== "idle" && (
            <span style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: 4, fontWeight: 500, color: gasStatus === "ok" ? "var(--color-success)" : "var(--color-danger)" }}>
              {gasStatus === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {pingMsg}
            </span>
          )}
        </div>
        <div style={{ background: "rgba(120,120,128,0.07)", borderRadius: 12, padding: "1rem", fontSize: "0.8125rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Setup:</p>
          <ol style={{ paddingLeft: "1.25rem", lineHeight: 2, color: "var(--color-text-secondary)" }}>
            <li>Open <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>script.google.com</a> → New Project</li>
            <li>Paste <code>gas/Code.gs</code> → set your folder ID in CONFIG block</li>
            <li>Deploy → Web App → Execute as <strong>Me</strong> → Access: <strong>Anyone</strong></li>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
          <Field id="sheet-id" label="Spreadsheet ID"
            value={settings.registration_sheet_id}
            onChange={v => setSettings(s => ({ ...s, registration_sheet_id: v }))}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            hint="From URL: /spreadsheets/d/[ID]/edit" />
          <Field id="drive-id" label="Drive Folder ID"
            value={settings.drive_folder_id}
            onChange={v => setSettings(s => ({ ...s, drive_folder_id: v }))}
            placeholder="1A2B3C4D5E6F…"
            hint="From Drive URL: /folders/[ID]" />
          <Field id="reg-sheet-name" label="Registration Sheet Tab"
            value={settings.registration_sheet_name}
            onChange={v => setSettings(s => ({ ...s, registration_sheet_name: v }))}
            placeholder="Form Responses 1" />
          <Field id="travel-sheet-name" label="Travel Desk Sheet Tab"
            value={settings.travel_sheet_name}
            onChange={v => setSettings(s => ({ ...s, travel_sheet_name: v }))}
            placeholder="Travel Desk Records" />
        </div>
      </Section>

      {/* ── Save ──────────────────────────────────────────────────────────────*/}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button className="btn-primary" onClick={saveSettings} disabled={saving} style={{ padding: "0.625rem 1.5rem" }}>
          <Save size={14} /> {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {editUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-card-elevated" style={{ width: "100%", maxWidth: 420, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>Edit Account</h3>
              <button onClick={() => setEditUser(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                  New Password <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>(blank = keep current)</span>
                </label>
                <input id="edit-password" type="password" className="input" value={editUser.password}
                  onChange={e => setEditUser(u => u ? { ...u, password: e.target.value } : null)}
                  placeholder="New password (optional)" autoComplete="new-password" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: "1.25rem" }}>
              <button className="btn-primary" onClick={updateUser} disabled={updatingUser} style={{ flex: 1 }}>
                {updatingUser ? "Saving…" : "Save Changes"}
              </button>
              <button className="btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
