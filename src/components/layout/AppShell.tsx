"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import {
  Globe, Users, Plane, Settings, LogOut, ChevronRight,
  LayoutDashboard, Menu, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

const NAV_ITEMS = [
  { href: "/", icon: <LayoutDashboard size={18} />, label: "CRM Home", desc: "KPIs & Analytics" },
  { href: "/travel", icon: <Plane size={18} />, label: "Travel Desk", desc: "Flights, Hotels, Visas" },
  { href: "/settings", icon: <Settings size={18} />, label: "Settings", desc: "Integration Config" },
];

interface Props {
  session: Session;
  children: React.ReactNode;
}

export default function AppShell({ session, children }: Props) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
      {/* ── Mobile overlay ────────────────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside
        className="sidebar"
        style={{
          width: 260,
          minWidth: 260,
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transform: mobileSidebarOpen ? "translateX(0)" : undefined,
          transition: "transform 0.25s ease",
        }}
      >
        {/* Sidebar header */}
        <div style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--color-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "10px",
              background: "linear-gradient(135deg, #0071e3 0%, #5856d6 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, boxShadow: "0 4px 12px rgba(0,113,227,0.3)",
            }}>
              <Globe size={18} color="white" />
            </div>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
                DelegateConnect
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                International CRM
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "0.75rem 0.75rem", overflowY: "auto" }}>
          <div style={{ marginBottom: "0.25rem" }}>
            <p style={{
              fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "var(--color-text-tertiary)",
              padding: "0.375rem 0.625rem", marginBottom: "0.125rem",
            }}>
              Modules
            </p>
            {NAV_ITEMS.map(({ href, icon, label, desc }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileSidebarOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.625rem",
                    padding: "0.5rem 0.75rem", borderRadius: "10px",
                    marginBottom: "0.125rem",
                    background: isActive ? "var(--color-accent-light)" : "transparent",
                    color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                    fontWeight: isActive ? 600 : 500,
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: isActive ? 600 : 500 }}>{label}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", lineHeight: 1.2 }}>{desc}</div>
                  </div>
                  {isActive && <ChevronRight size={14} />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User footer */}
        <div style={{
          padding: "0.875rem 1rem",
          borderTop: "1px solid var(--color-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #0071e3, #5856d6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 700, color: "white",
              flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "0.8125rem", fontWeight: 600,
                color: "var(--color-text-primary)", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {session.user?.name ?? "Staff"}
              </div>
              <div style={{
                fontSize: "0.6875rem", color: "var(--color-text-tertiary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {session.user?.email}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-tertiary)", padding: "0.25rem",
                borderRadius: "6px", transition: "all 0.15s",
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, marginLeft: 260, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Mobile topbar */}
        <div style={{
          display: "none",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          backdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 30,
        }}
          className="mobile-topbar"
        >
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-text-primary)", padding: "0.25rem",
            }}
          >
            {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          aside { transform: translateX(-100%) !important; }
          aside.open { transform: translateX(0) !important; }
          div[style*="marginLeft: 260"] { margin-left: 0 !important; }
          .mobile-topbar { display: flex !important; align-items: center; }
        }
      `}</style>
    </div>
  );
}
