"use client";

import { useState, useEffect } from "react";
import type { Session } from "next-auth";
import {
  Globe, Plane, Settings, LogOut, ChevronRight,
  LayoutDashboard, Menu, X, MessageSquare, BarChart2, Users, ShieldAlert
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

interface Props {
  session: Session;
  children: React.ReactNode;
}

export default function AppShell({ session, children }: Props) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");

    // Inactivity timeout of 10 minutes (600,000 ms)
    let inactivityTimer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        signOut({ redirect: true, callbackUrl: "/login" });
      }, 10 * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(e => document.removeEventListener(e, resetTimer));
    };
  }, []);

  const handleSignOut = async () => {
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
              <div className="text-[0.7rem] text-[var(--color-text-tertiary)] truncate mt-0.5">
                {session.user?.email}
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
      <div className="flex-1 flex flex-col min-w-0 md:ml-[252px]">
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
