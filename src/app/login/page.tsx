"use client";

import { Suspense, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Globe, Users, Plane } from "lucide-react";
import { toast } from "sonner";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        toast.error("Invalid email or password");
      } else {
        toast.success("Signed in successfully");
        router.push(callbackUrl);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label className="label" htmlFor="email">Username / Email</label>
        <input id="email" type="text" autoComplete="username" required className="input"
          placeholder="admin" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password"
            required className="input" placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: "2.75rem" }} />
          <button type="button" onClick={() => setShowPass(!showPass)} style={{
            position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-text-tertiary)", padding: "0.25rem",
          }}>
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "0.625rem 1rem", fontSize: "0.9375rem", marginTop: "0.5rem" }}>
        {isPending ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</> : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #f5f5f7 0%, #e8eaf0 50%, #f0f4ff 100%)",
      padding: "1.5rem", position: "relative", overflow: "hidden",
    }}>
      {/* Background blobs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-15%", right: "-10%", width: "520px", height: "520px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.08) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-10%", left: "-8%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(88,86,214,0.07) 0%, transparent 70%)" }} />
      </div>

      <div style={{ width: "100%", maxWidth: "420px", position: "relative" }}>
        <div className="glass-card-elevated animate-scale-in" style={{ overflow: "hidden" }}>
          {/* macOS title bar */}
          <div style={{ padding: "1rem 1.25rem 0.875rem", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="traffic-lights">
              <span className="traffic-light traffic-light-red" />
              <span className="traffic-light traffic-light-yellow" />
              <span className="traffic-light traffic-light-green" />
            </div>
            <span style={{ flex: 1, textAlign: "center", fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-secondary)" }}>
              DelegateConnect — Staff Portal
            </span>
          </div>

          <div style={{ padding: "2rem 2rem 2.5rem" }}>
            {/* Logo */}
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "14px", background: "linear-gradient(135deg, #0071e3 0%, #5856d6 100%)", marginBottom: "1rem", boxShadow: "0 8px 24px rgba(0,113,227,0.3)" }}>
                <Globe size={28} color="white" />
              </div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Welcome back</h1>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>Sign in to International Delegate CRM</p>
            </div>

            {/* Feature pills */}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1.75rem", flexWrap: "wrap" }}>
              {[
                { icon: <Users size={11} />, label: "Delegate Mgmt" },
                { icon: <Plane size={11} />, label: "Travel Desk" },
                { icon: <Globe size={11} />, label: "Analytics" },
              ].map(({ icon, label }) => (
                <span key={label} className="badge badge-neutral" style={{ fontSize: "0.6875rem" }}>{icon} {label}</span>
              ))}
            </div>

            {/* Form wrapped in Suspense for useSearchParams */}
            <Suspense fallback={<div style={{ textAlign: "center", color: "var(--color-text-tertiary)" }}>Loading…</div>}>
              <LoginForm />
            </Suspense>

            <p style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
              Accounts are created by an administrator.
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
          DelegateConnect Enterprise · Powered by Neon + Next.js
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
