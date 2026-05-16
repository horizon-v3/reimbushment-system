"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Globe, Users, Plane } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl") || "/";

  const callbackUrl = (() => {
    try {
      const u = new URL(rawCallback, window.location.origin);
      if (u.origin !== window.location.origin) return "/";
      return u.pathname + u.search;
    } catch {
      return "/";
    }
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Invalid credentials");
      } else {
        toast.success("Login successful");
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSignIn} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label className="label" htmlFor="email">Username / Email</label>
        <input id="email" name="email" type="text" autoComplete="username" required className="input"
          placeholder="admin" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={showPass ? "text" : "password"} autoComplete="current-password"
            required className="input pr-11" placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors rounded-md bg-transparent border-none cursor-pointer">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary w-full justify-center py-2.5 text-[0.9375rem] mt-2 shadow-sm font-semibold">
        {isPending ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-[#f5f5f7] via-[#e8eaf0] to-[#f0f4ff]">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[15%] -right-[10%] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,113,227,0.08)_0%,transparent_70%)]" />
        <div className="absolute -bottom-[10%] -left-[8%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.07)_0%,transparent_70%)]" />
      </div>

      <div className="w-full max-w-[420px] relative">
        <div className="glass-card-elevated animate-scale-in overflow-hidden shadow-2xl border border-[var(--color-border)] rounded-2xl">
          {/* macOS title bar */}
          <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center gap-3 bg-[var(--color-surface)]">
            <div className="traffic-lights">
              <span className="traffic-light traffic-light-red" />
              <span className="traffic-light traffic-light-yellow" />
              <span className="traffic-light traffic-light-green" />
            </div>
            <span className="flex-1 text-center text-[0.8125rem] font-semibold text-[var(--color-text-secondary)]">
              DelegateConnect — Staff Portal
            </span>
          </div>

          <div className="p-8 pt-10 pb-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-[14px] bg-gradient-to-br from-[#0071e3] to-[#5856d6] mb-4 shadow-[0_8px_24px_rgba(0,113,227,0.3)]">
                <Globe size={28} color="white" />
              </div>
              <h1 className="text-[1.375rem] font-bold text-[var(--color-text-primary)] mb-1 tracking-tight">Welcome back</h1>
              <p className="text-[0.875rem] font-medium text-[var(--color-text-secondary)]">Sign in to International Delegate CRM</p>
            </div>

            {/* Feature pills */}
            <div className="flex gap-2 justify-center mb-7 flex-wrap">
              {[
                { icon: <Users size={12} className="opacity-70" />, label: "Delegate Mgmt" },
                { icon: <Plane size={12} className="opacity-70" />, label: "Travel Desk" },
                { icon: <Globe size={12} className="opacity-70" />, label: "Analytics" },
              ].map(({ icon, label }) => (
                <span key={label} className="badge badge-neutral px-2.5 py-1 text-[0.7rem] bg-[var(--color-border)]/50 font-medium">
                  {icon} <span className="ml-0.5">{label}</span>
                </span>
              ))}
            </div>

            {/* Form wrapped in Suspense for useSearchParams */}
            <Suspense fallback={<div className="text-center text-[var(--color-text-tertiary)] py-4 font-medium"><Loader2 size={24} className="animate-spin mx-auto text-[var(--color-accent)]" /></div>}>
              <LoginForm />
            </Suspense>

            <p className="mt-5 text-center text-[0.8125rem] text-[var(--color-text-tertiary)] font-medium">
              Accounts are created by an administrator.
            </p>
          </div>
        </div>

        <p className="text-center mt-6 text-[0.75rem] font-medium text-[var(--color-text-tertiary)] tracking-wide">
          DelegateConnect Enterprise · Powered by Neon + Next.js
        </p>
      </div>
    </div>
  );
}
