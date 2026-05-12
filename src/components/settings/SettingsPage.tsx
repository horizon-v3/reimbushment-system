"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Trash2, Plus, Shield, User } from "lucide-react";
import { pingGas } from "@/lib/gas-client";

type Settings = {
  registration_sheet_id: string;
  registration_sheet_name: string;
  travel_sheet_name: string;
  drive_folder_id: string;
  gas_web_app_url: string;
};

type StaffUser = {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  createdAt: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  readonly: "Read Only",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    registration_sheet_id: "",
    registration_sheet_name: "Form Responses 1",
    travel_sheet_name: "Travel Desk Records",
    drive_folder_id: "",
    gas_web_app_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [gasStatus, setGasStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pingMsg, setPingMsg] = useState("");
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "staff" });
  const [addingUser, setAddingUser] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(({ settings: s }) => {
      if (s) setSettings({
        registration_sheet_id: s.registration_sheet_id ?? "",
        registration_sheet_name: s.registration_sheet_name ?? "Form Responses 1",
        travel_sheet_name: s.travel_sheet_name ?? "Travel Desk Records",
        drive_folder_id: s.drive_folder_id ?? "",
        gas_web_app_url: s.gas_web_app_url ?? "",
      });
    });
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    const res = await fetch("/api/admin/seed-user");
    setLoadingUsers(false);
    if (res.ok) { const d = await res.json(); setUsers(d.users ?? []); }
  };

  const saveSettings = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) toast.success("Settings saved ✓");
    else toast.error("Save failed");
  };

  const testGas = async () => {
    setGasStatus("idle"); setPingMsg("Pinging…");
    const res = await pingGas();
    if (res.ok) { setGasStatus("ok"); setPingMsg(res.message ?? "Connected"); }
    else { setGasStatus("error"); setPingMsg(res.error ?? "Failed"); }
  };

  const addUser = async () => {
    if (!newUser.email.trim() || !newUser.password.trim()) return toast.error("Username and password required");
    setAddingUser(true);
    const res = await fetch("/api/admin/seed-user", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newUser, secretKey: process.env.NEXT_PUBLIC_ADMIN_SEED_KEY || "delegate-admin-seed-2024" }),
    });
    setAddingUser(false);
    if (res.ok) {
      toast.success(`User '${newUser.email}' created`);
      setNewUser({ email: "", password: "", name: "", role: "staff" });
      setShowAddForm(false);
      loadUsers();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed to create user");
    }
  };

  const F = ({ label, k, placeholder, type = "text" }: { label: string; k: keyof Settings; placeholder?: string; type?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={settings[k]}
        onChange={e => setSettings(f => ({ ...f, [k]: e.target.value }))} placeholder={placeholder} />
    </div>
  );

  const roleColor: Record<string, string> = {
    admin: "badge-danger", manager: "badge-warning", staff: "badge-neutral", readonly: "badge-neutral",
  };

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.625rem", fontWeight: 700 }}>Settings</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
          Configure integration settings and manage staff access
        </p>
      </div>

      {/* ── User Management ───────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#0071e3,#5856d6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={18} color="white" />
            </div>
            <div>
              <h2 style={{ fontWeight: 600, fontSize: "1rem" }}>Staff Accounts</h2>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Manage who can access the system</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" onClick={loadUsers}><RefreshCw size={13} /></button>
            <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={14} /> Add User
            </button>
          </div>
        </div>

        {/* Add user form */}
        {showAddForm && (
          <div style={{ background: "rgba(0,113,227,0.05)", border: "1px solid var(--color-accent-light)", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>New Staff Account</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "0.875rem" }}>
              <div>
                <label className="label">Username / Email *</label>
                <input className="input" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="e.g. alice or alice@co.com" />
              </div>
              <div>
                <label className="label">Password *</label>
                <input type="password" className="input" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div>
                <label className="label">Display Name</label>
                <input className="input" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Alice Smith" />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn-primary" onClick={addUser} disabled={addingUser}>
                {addingUser ? "Creating…" : "Create Account"}
              </button>
              <button className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Role guide */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
          {Object.entries(ROLE_LABELS).map(([v, l]) => (
            <span key={v} style={{ fontSize: "0.75rem", padding: "0.25rem 0.625rem", borderRadius: 20, background: "rgba(120,120,128,0.1)", color: "var(--color-text-secondary)" }}>
              <strong>{l}</strong> — {v === "admin" ? "Full access + user mgmt" : v === "manager" ? "All data, no users" : v === "staff" ? "CRM + Travel Desk" : "Read-only"}
            </span>
          ))}
        </div>

        {/* Users table */}
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          {loadingUsers ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-tertiary)" }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-tertiary)" }}>No users yet. Create the first account above.</div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>User</th><th>Username / Email</th><th>Role</th><th>Created</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#0071e3,#5856d6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "white", flexShrink: 0 }}>
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{u.name ?? "—"}</span>
                      </div>
                    </td>
                    <td><code style={{ fontSize: "0.8125rem" }}>{u.email}</code></td>
                    <td>
                      <span className={`badge ${roleColor[u.role ?? "staff"] ?? "badge-neutral"}`}>
                        {ROLE_LABELS[u.role ?? "staff"] ?? u.role}
                      </span>
                    </td>
                    <td style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── GAS Section ──────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#4285f4,#34a853)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ExternalLink size={18} color="white" />
          </div>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: "1rem" }}>Google Apps Script</h2>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Web App URL for Drive uploads + Sheets backup</p>
          </div>
        </div>
        <F label="GAS Web App URL" k="gas_web_app_url" placeholder="https://script.google.com/macros/s/…/exec" />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem", alignItems: "center" }}>
          <button className="btn-secondary" onClick={testGas}><RefreshCw size={14} /> Test Connection</button>
          {gasStatus !== "idle" && (
            <span style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem", color: gasStatus === "ok" ? "var(--color-success)" : "var(--color-danger)" }}>
              {gasStatus === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {pingMsg}
            </span>
          )}
        </div>
        <div style={{ marginTop: "1rem", padding: "0.875rem", background: "rgba(120,120,128,0.08)", borderRadius: 10, fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
          <strong style={{ color: "var(--color-text-primary)" }}>Setup steps:</strong>
          <ol style={{ marginTop: "0.375rem", paddingLeft: "1.25rem", lineHeight: 1.8 }}>
            <li>Open <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>script.google.com</a> → New Project</li>
            <li>Paste contents of <code>gas/Code.gs</code> from your project root</li>
            <li>Set your folder ID in the <code>CONFIG</code> object</li>
            <li>Deploy → New Deployment → Web App → Execute as Me → Anyone</li>
            <li>Copy the Web App URL and paste above</li>
          </ol>
        </div>
      </div>

      {/* ── Google Sheets ─────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <h2 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1rem" }}>Google Sheets Backup</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
          <F label="Spreadsheet ID" k="registration_sheet_id" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
          <F label="Registration Sheet Name" k="registration_sheet_name" />
          <F label="Travel Desk Sheet Name" k="travel_sheet_name" />
          <F label="Drive Folder ID" k="drive_folder_id" placeholder="1A2B3C4D5E6F…" />
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.625rem" }}>
          Sheet ID from URL: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
        </p>
      </div>

      {/* ── Neon DB Info ─────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <h2 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>Database Setup</h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
          After setting <code style={{ background: "rgba(120,120,128,0.12)", padding: "0.125rem 0.375rem", borderRadius: 4 }}>DATABASE_URL</code> in <code>.env.local</code>, run these commands:
        </p>
        <div style={{ marginTop: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[
            ["Push schema to Neon:", "npm run db:push"],
            ["Seed admin user:", "node --env-file=.env.local scripts/seed-admin.mjs"],
          ].map(([label, cmd]) => (
            <div key={cmd} style={{ background: "rgba(120,120,128,0.08)", borderRadius: 8, padding: "0.625rem 0.875rem" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>{label}</p>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-accent)" }}>{cmd}</code>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-primary" onClick={saveSettings} disabled={saving}>
        <Save size={14} /> {saving ? "Saving…" : "Save Integration Settings"}
      </button>
    </div>
  );
}
