"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Session } from "next-auth";
import {
  Globe, Plane, Settings, LogOut, ChevronRight,
  LayoutDashboard, Menu, X, MessageSquare, BarChart2, Users, ShieldAlert, Clock,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/",              icon: <LayoutDashboard size={17} />, label: "CRM Home",            desc: "KPIs & Analytics",       roles: ["admin"] },
  { href: "/analytics",     icon: <BarChart2 size={17} />,       label: "Analytics",           desc: "Sector & DB/Vujis",      roles: ["admin"] },
  { href: "/delegates",     icon: <Users size={17} />,           label: "Registered Delegates",desc: "View delegate list",     roles: ["admin", "supervisor", "user"] },
  { href: "/travel",        icon: <Plane size={17} />,           label: "Travel Desk",         desc: "Flights, Hotels, Visas", roles: ["admin", "supervisor", "user"] },
  { href: "/chat",          icon: <MessageSquare size={17} />,   label: "Team Chat",           desc: "Enterprise Messaging",   roles: ["admin", "supervisor", "user"] },
  { href: "/operation-log", icon: <ShieldAlert size={17} />,     label: "Operation Log",       desc: "Audit & Permissions",    roles: ["admin"] },
  { href: "/settings",      icon: <Settings size={17} />,        label: "Settings",            desc: "Integration Config",     roles: ["admin"] },
];

const DEFAULT_TIMEOUT_MINUTES = 30;

interface Props {
  session: Session;
  children: React.ReactNode;
}

export default function AppShell({ session, children }: Props) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(DEFAULT_TIMEOUT_MINUTES);
  const [countdown, setCountdown] = useState<number | null>(null); // seconds remaining before logout
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch session timeout from settings ──────────────────────────────────
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(({ settings }) => {
        const mins = parseInt(settings?.session_timeout_minutes ?? String(DEFAULT_TIMEOUT_MINUTES));
        if (!isNaN(mins) && mins > 0) setTimeoutMinutes(mins);
      })
      .catch(() => {/* use default */});
  }, []);

  // ── Inactivity Timer ─────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (warningRef.current)  clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    warningRef.current = null;
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();

    const totalMs = timeoutMinutes * 60 * 1000;
    const warningMs = Math.max(totalMs - 60_000, totalMs * 0.9); // warn at 60s or 90% of timeout

    // Warning: start countdown display
    warningRef.current = setTimeout(() => {
      const warningSeconds = Math.round((totalMs - warningMs) / 1000);
      setCountdown(warningSeconds);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev == null || prev <= 1) return null;
          return prev - 1;
        });
      }, 1000);
    }, warningMs);

    // Actual logout
    timerRef.current = setTimeout(() => {
      clearAllTimers();
      signOut({ redirect: true, callbackUrl: "/login" });
    }, totalMs);
  }, [timeoutMinutes, clearAllTimers]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => {
      if (countdown !== null) setCountdown(null); // dismiss warning on activity
      resetTimer();
    };
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));
    resetTimer();
    return () => {
      clearAllTimers();
      events.forEach(e => document.removeEventListener(e, handleActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMinutes]);

  const handleSignOut = async () => {
    clearAllTimers();
    await signOut({ redirect: true, callbackUrl: "/login" });
  };

  const userInitials = (session.user?.name ?? session.user?.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Inactivity Warning Banner ────────────────────────────────────────── */}
      {countdown !== null && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
            background: "linear-gradient(90deg,#ff9500,#ff3b30)",
            color: "white", padding: "10px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: "0.875rem", fontWeight: 600, boxShadow: "0 2px 12px rgba(255,59,48,0.4)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={16} />
            Session expiring in {countdown}s due to inactivity
          </span>
          <button
            onClick={() => { setCountdown(null); resetTimer(); }}
            style={{
              background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.5)",
              color: "white", borderRadius: "6px", padding: "4px 14px", cursor: "pointer",
              fontSize: "0.8rem", fontWeight: 600,
            }}
          >
            Stay Logged In
          </button>
        </div>
      )}

      {/* ── Mobile overlay ──────────────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)",
          }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`sidebar fixed top-0 left-0 bottom-0 z-50 flex flex-col w-[252px] min-w-[252px] transition-transform duration-250 ease-in-out ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ paddingTop: countdown !== null ? "44px" : "0" }}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-[0_3px_10px_rgba(0,113,227,0.35)] bg-gradient-to-br from-[#0071e3] to-[#5856d6]">
              <Globe size={18} color="white" />
            </div>
            <div>
              <div className="text-[0.95rem] font-bold text-[var(--color-text-primary)] leading-tight tracking-tight">
                DelegateConnect
              </div>
              <div className="text-[0.7rem] text-[var(--color-text-tertiary)] tracking-wide uppercase font-semibold mt-0.5">
                International CRM
              </div>
            </div>
          </div>
        </div>

        {/* Session timeout indicator */}
        <div className="px-5 py-2 border-b border-[var(--color-border)]/50 flex items-center gap-1.5 bg-[var(--color-bg-primary)]/50">
          <Clock size={11} className="text-[var(--color-text-tertiary)] shrink-0" />
          <span className="text-[0.65rem] text-[var(--color-text-tertiary)] font-medium">
            Auto-logout: {timeoutMinutes}min inactivity
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-[0.65rem] font-bold tracking-widest uppercase text-[var(--color-text-tertiary)] px-3 pb-2">
            Modules
          </p>
          {NAV_ITEMS.map(({ href, icon, label, desc, roles }) => {
            const userRole = (session.user as { role?: string })?.role || "user";
            if (!roles.includes(userRole)) return null;
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-150 ease-in-out no-underline ${isActive ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-semibold' : 'text-[var(--color-text-secondary)] font-medium hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-text-primary)]'}`}
              >
                <span className={`shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[0.8125rem] tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</div>
                  <div className="text-[0.65rem] text-[var(--color-text-tertiary)] leading-tight mt-[2px]">{desc}</div>
                </div>
                {isActive && <ChevronRight size={14} className="shrink-0 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer: user + sign out */}
        <div className="p-4 border-t border-[var(--color-border)]">
          {/* User row */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0071e3] to-[#5856d6] flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[0.85rem] font-semibold text-[var(--color-text-primary)] truncate">
                {session.user?.name ?? "Staff"}
              </div>
              {/* Email intentionally hidden per security policy — role shown instead */}
              <div className="text-[0.7rem] text-[var(--color-text-tertiary)] truncate mt-0.5">
                {(session.user as { role?: string })?.role ?? "user"}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-all flex items-center shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[252px]" style={{ paddingTop: countdown !== null ? "44px" : "0" }}>
        {/* Mobile topbar */}
        <div className="mobile-topbar md:hidden px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded-lg transition-colors"
          >
            {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="font-semibold text-sm">DelegateConnect</div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          aside { transform: translateX(-100%) !important; }
          aside.open { transform: translateX(0) !important; }
          div[style*="marginLeft: 252"] { margin-left: 0 !important; }
          .mobile-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
