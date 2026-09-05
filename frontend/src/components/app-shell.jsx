// macOS Big Sur–style sidebar shell — used for all pages including landing
import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  palette, ACCENT, SANS, MONO,
  useIsMobile, safeArea, TAP, MOBILE_HEADER_H, MOBILE_NAV_H,
} from "../theme.jsx";

const SIDEBAR_W   = 220;
const SIDEBAR_COL = 64;  // collapsed icon-only width

// ── Sidebar panel icon ────────────────────────────────────────────────────────
const CollapseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M14.63384375 1.36615625H1.36615625C0.69999375 1.366125 0.16 1.90614375 0.16 2.57230625v10.8553875c0 0.66615625 0.53999375 1.20618125 1.20615625 1.20615h13.2676875c0.66611875 -0.000025 1.20615625 -0.54003125 1.20615625 -1.20615V2.57230625c0 -0.6661375 -0.5400125 -1.20615 -1.20615625 -1.20615ZM1.36615625 2.57230625h3.01538125v10.8553875H1.36615625Zm13.2676875 10.8553875H5.58769375V2.57230625h9.04615v10.8553875Z" />
  </svg>
);

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  courses: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  instructors: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  schedule: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  chatbot: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  forums: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  ),
  kairo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v15H6z"/>
      <path d="M14 2v6h6"/>
      <path d="M9 13h6"/>
      <path d="M9 17h4"/>
    </svg>
  ),
  ruvo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4"/>
      <path d="M3 12h18v7H3z"/>
      <path d="M7 19v2"/>
      <path d="M17 19v2"/>
    </svg>
  ),
  watchlist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      <path d="M10 2h4"/>
    </svg>
  ),
  profile: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21a8 8 0 0 1 16 0"/>
    </svg>
  ),
  sun: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  moon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  signout: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  hamburger: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5.5"  width="16" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="2" y="9.25" width="11" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="2" y="13"   width="16" height="1.5" rx="0.75" fill="currentColor"/>
    </svg>
  ),
  signin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  ),
};

function RailIcon({ children }) {
  return (
    <span style={{
      width: 24,
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {children}
    </span>
  );
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SidebarItem({ id, label, icon, active, darkMode, badge, onClick, collapsed, onTooltip, onHideTooltip }) {
  const p = palette(darkMode);
  const [hovered, setHovered] = useState(false);
  const collapsedColor = darkMode ? "rgba(255,255,255,0.92)" : "rgba(26,18,15,0.78)";
  const collapsedHoverBg = darkMode ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.08)";

  const activeStyle = darkMode ? {
    background: "linear-gradient(135deg, rgba(134,31,65,0.28) 0%, rgba(134,31,65,0.10) 100%)",
    border: "1px solid rgba(134,31,65,0.40)",
    boxShadow: "0 2px 16px rgba(134,31,65,0.20), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.12)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  } : {
    background: "linear-gradient(135deg, rgba(134,31,65,0.14) 0%, rgba(134,31,65,0.05) 100%)",
    border: "1px solid rgba(134,31,65,0.28)",
    boxShadow: "0 2px 12px rgba(134,31,65,0.10), inset 0 1px 0 rgba(255,255,255,0.70), inset 0 -1px 0 rgba(134,31,65,0.06)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  const hoverStyle = darkMode ? {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 6px rgba(0,0,0,0.10)",
  } : {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.90), 0 1px 6px rgba(0,0,0,0.04)",
  };
  const collapsedBase = collapsed
    ? {
        background: active || hovered ? collapsedHoverBg : "transparent",
        border: "1px solid transparent",
        boxShadow: "none",
      }
    : null;

  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseEnter={e => {
        setHovered(true);
        if (collapsed) onTooltip?.(label, e, "right", <RailIcon name={id}>{icon}</RailIcon>);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHideTooltip?.();
      }}
      style={{
        width: collapsed ? 44 : "100%",
        height: collapsed ? 44 : "auto",
        margin: collapsed ? "0 auto 3px" : "0 0 3px",
        position: "static",
        transform: "none",
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 10,
        padding: collapsed ? 0 : "7px 10px",
        justifyContent: collapsed ? "center" : "flex-start",
        ...(collapsedBase || (active ? activeStyle : hovered ? hoverStyle : { background: "transparent", border: "1px solid transparent", boxShadow: "none" })),
        borderRadius: 10, cursor: "pointer",
        color: collapsed
          ? collapsedColor
          : active
          ? (darkMode ? "#fff" : ACCENT)
          : hovered
          ? (darkMode ? "rgba(255,255,255,0.92)" : p.text)
          : (darkMode ? "rgba(255,255,255,0.76)" : p.textSub),
        fontFamily: SANS, fontWeight: active ? 600 : 500, fontSize: 13.5,
        textAlign: "left",
        transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s, padding 0.20s",
      }}
    >
      <span style={{
        width: collapsed ? 24 : "auto",
        height: collapsed ? 24 : "auto",
        flexShrink: 0,
        opacity: collapsed ? 1 : active ? 1 : hovered ? 0.90 : 0.70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.15s",
      }}>{collapsed ? <RailIcon name={id}>{icon}</RailIcon> : icon}</span>
      <span style={{
        flex: 1,
        opacity: collapsed ? 0 : 1,
        maxWidth: collapsed ? 0 : 140,
        overflow: "hidden",
        whiteSpace: "nowrap",
        transition: "opacity 0.14s ease, max-width 0.22s cubic-bezier(0.16,1,0.3,1)",
      }}>{label}</span>
      {!collapsed && badge > 0 && (
        <span style={{
          background: active ? ACCENT : darkMode ? "rgba(134,31,65,0.55)" : "rgba(134,31,65,0.18)",
          color: active ? "#fff" : ACCENT,
          borderRadius: 999, padding: "1px 7px",
          fontSize: 10.5, fontWeight: 700, fontFamily: MONO, flexShrink: 0,
          border: `1px solid ${active ? "transparent" : "rgba(134,31,65,0.30)"}`,
          overflow: "hidden",
          transition: "opacity 0.14s ease, max-width 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}>{badge}</span>
      )}
    </button>
  );
}

function RailTooltip({ tooltip, darkMode }) {
  if (!tooltip) return null;
  return (
    <>
      <div style={{
        position: "fixed",
        left: tooltip.x,
        top: tooltip.y,
        transform: tooltip.side === "left" ? "translate(-100%, -50%)" : "translateY(-50%)",
        zIndex: 1000,
        pointerEvents: "none",
        padding: "9px 11px",
        borderRadius: 10,
        background: darkMode ? "rgba(28,28,28,0.98)" : "rgba(26,18,15,0.96)",
        color: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
        fontFamily: SANS,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "dvTooltipIn 0.12s ease-out both",
      }}>
        {tooltip.icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{tooltip.icon}</span>}
        {tooltip.label}
      </div>
      <style>{`
        @keyframes dvTooltipIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell({
  page, setPage, darkMode, setDarkMode,
  schedule, isSignedIn, onSignIn, children,
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed]   = useState(false);
  const [railTooltip, setRailTooltip] = useState(null);
  const p = palette(darkMode);

  const sidebarW = collapsed ? SIDEBAR_COL : SIDEBAR_W;

  useEffect(() => { setDrawerOpen(false); }, [page]);

  // Leaving the phone layout must not strand an open drawer over the desktop UI.
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  // Lock the page behind the drawer so the body doesn't scroll under the sheet.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  // Escape closes the drawer — required escape route for an overlay (Apple HIG).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = e => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const navItems = [
    { id: "instructors", label: "Instructors", icon: Icons.instructors },
    { id: "search",      label: "Courses",    icon: Icons.courses     },
    { id: "schedule",    label: "Schedule",   icon: Icons.schedule, badge: isSignedIn ? (schedule?.length || 0) : 0 },
    { id: "chatbot",     label: "Cyrus", icon: Icons.chatbot     },
    { id: "forums",      label: "Forums",     icon: Icons.forums      },
    { id: "kairo",       label: "Kairo",      icon: Icons.kairo       },
    { id: "ruvo",        label: "Ruvo",       icon: Icons.ruvo        },
    { id: "watchlist",   label: "Watchlist",  icon: Icons.watchlist   },
  ];

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "Account";
  const initials    = ([user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || user?.username?.[0] || "?").toUpperCase();

  const sidebarBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.65)";
  const sidebarText = darkMode ? "rgba(255,255,255,0.92)" : p.text;
  const sidebarSubText = darkMode ? "rgba(255,255,255,0.76)" : p.textSub;
  const collapsedIconColor = darkMode ? "rgba(255,255,255,0.92)" : "rgba(26,18,15,0.78)";
  const collapsedIconHoverBg = darkMode ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.08)";
  const showRailTooltip = (label, event, side = "right", icon = null) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setRailTooltip({
      label,
      side,
      icon,
      x: side === "left" ? rect.left - 10 : rect.right + 10,
      y: rect.top + rect.height / 2,
    });
  };
  const hideRailTooltip = () => setRailTooltip(null);

  const asideCss = darkMode ? {
    background: "rgba(8,5,4,0.22)",
    backdropFilter: "blur(100px) saturate(180%) brightness(0.80) contrast(1.08)",
    WebkitBackdropFilter: "blur(100px) saturate(180%) brightness(0.80) contrast(1.08)",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    boxShadow: [
      "6px 0 60px rgba(0,0,0,0.55)",
      "inset -1px 0 0 rgba(255,255,255,0.05)",
      "inset 1px 0 0 rgba(255,255,255,0.02)",
    ].join(", "),
  } : {
    background: "rgba(255,255,255,0.18)",
    backdropFilter: "blur(100px) saturate(220%) brightness(1.12)",
    WebkitBackdropFilter: "blur(100px) saturate(220%) brightness(1.12)",
    borderRight: "1px solid rgba(255,255,255,0.72)",
    boxShadow: [
      "6px 0 40px rgba(0,0,0,0.06)",
      "inset -1px 0 0 rgba(255,255,255,0.95)",
      "inset 1px 0 0 rgba(255,255,255,0.60)",
    ].join(", "),
  };

  // ── Sidebar interior ────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none", overflow: "hidden", position: "relative" }}>
      {/* Specular sheen — top-down highlight simulating light on glass */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "40%",
        pointerEvents: "none", zIndex: 0,
        background: darkMode
          ? "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0) 100%)",
      }} />
      {/* Bottom ambient glow */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
        pointerEvents: "none", zIndex: 0,
        background: darkMode
          ? "linear-gradient(0deg, rgba(134,31,65,0.05) 0%, rgba(134,31,65,0) 100%)"
          : "linear-gradient(0deg, rgba(134,31,65,0.04) 0%, rgba(134,31,65,0) 100%)",
      }} />
      {/* All content sits above sheen */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 1, overflow: "hidden" }}>

      {/* Brand / collapse control */}
      {collapsed ? (
        <button
        onClick={() => { hideRailTooltip(); setCollapsed(false); }}
        aria-label="Expand sidebar"
        onMouseEnter={e => {
          showRailTooltip("Expand sidebar", e, "right", <img src="/darvis-logo.png" alt="" style={{ width: 18, height: 18, borderRadius: 5, objectFit: "cover" }} />);
          e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
        }}
        onMouseLeave={e => {
          hideRailTooltip();
          e.currentTarget.style.background = "transparent";
        }}
        style={{
          width: 44, height: 44, padding: 0, margin: "14px auto 12px",
          position: "static", transform: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, background: "none", border: "none", cursor: "pointer", borderRadius: 12,
          transition: "background 0.12s",
        }}
        >
          <img src="/darvis-logo.png" alt="Darvis" style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover" }} />
        </button>
      ) : (
        <div style={{
          padding: "14px 12px 12px 14px",
          display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0, width: "100%", boxSizing: "border-box",
        }}>
          <button onClick={() => setPage("landing")} title="Home" style={{
            flex: 1,
            minWidth: 0,
            display: "flex", alignItems: "center", gap: 10,
            background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
          }}>
            <img src="/darvis-logo.png" alt="Darvis" style={{
              width: 38, height: 38, borderRadius: 10, objectFit: "cover",
              boxShadow: "0 2px 10px rgba(0,0,0,0.20)", flexShrink: 0,
            }} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            style={{
              background: "transparent",
              color: sidebarSubText,
              border: "none",
              borderRadius: 8,
              width: 34,
              height: 34,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.12s, background 0.12s", flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.07)" : p.cardHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <CollapseIcon />
          </button>
        </div>
      )}

      {/* Nav label */}
      {!collapsed && (
        <div style={{ padding: "6px 14px 5px", flexShrink: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: "1.4px", textTransform: "uppercase", color: p.textFaint }}>
            Navigation
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav style={{
        flex: 1,
        padding: collapsed ? "0" : "0 8px",
        overflowY: "auto",
        display: collapsed ? "flex" : "block",
        flexDirection: collapsed ? "column" : undefined,
        alignItems: collapsed ? "center" : undefined,
      }}>
        {navItems.map(item => (
          <SidebarItem
            key={item.id} {...item}
            active={page === item.id}
            darkMode={darkMode}
            collapsed={collapsed}
            onTooltip={showRailTooltip}
            onHideTooltip={hideRailTooltip}
            onClick={() => setPage(item.id)}
          />
        ))}
      </nav>

      {/* Divider — gradient shimmer instead of solid line */}
      <div style={{
        height: 1, margin: "0 12px", flexShrink: 0,
        background: darkMode
          ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.10) 60%, transparent 100%)"
          : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.80) 40%, rgba(255,255,255,0.80) 60%, transparent 100%)",
      }} />

      {/* User section */}
      <div style={{
        padding: collapsed ? "10px 0 14px" : "10px 8px 12px",
        flexShrink: 0,
        display: collapsed ? "flex" : "block",
        flexDirection: collapsed ? "column" : undefined,
        alignItems: collapsed ? "center" : undefined,
      }}>
        {isSignedIn ? (
          <>
            {/* Profile */}
            <button
              onClick={() => setPage("profile")}
              aria-label="Profile"
              style={{
                width: collapsed ? 44 : "100%",
                height: collapsed ? 44 : "auto",
                margin: collapsed ? "0 auto 8px" : "0 0 8px",
                position: "static",
                transform: "none",
                display: "flex", alignItems: "center",
                gap: collapsed ? 0 : 10,
                padding: collapsed ? 0 : "8px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                marginBottom: 8,
                background: page === "profile"
                  ? (darkMode ? "rgba(134,31,65,0.20)" : "rgba(134,31,65,0.09)")
                  : "transparent",
                border: page === "profile"
                  ? `1px solid ${darkMode ? "rgba(134,31,65,0.35)" : "rgba(134,31,65,0.20)"}`
                  : "1px solid transparent",
                color: collapsed ? collapsedIconColor : p.text,
                borderRadius: 8, cursor: "pointer", fontFamily: SANS, textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => {
                if (collapsed) showRailTooltip("Profile", e, "right", Icons.profile);
                if (page !== "profile") e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
              }}
              onMouseLeave={e => {
                hideRailTooltip();
                if (page !== "profile") e.currentTarget.style.background = "transparent";
              }}
            >
              {collapsed
                ? <RailIcon name="profile">{Icons.profile}</RailIcon>
                : user?.imageUrl
                ? <img src={user.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                : <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg,#6b1833,#861F41,#b03060)",
                    color: "#fff", fontWeight: 700, fontSize: 10, fontFamily: SANS,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{initials}</div>
              }
              {!collapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: sidebarText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                </div>
              )}
            </button>

            {/* Theme + sign out */}
            {collapsed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                {[
                  { title: darkMode ? "Light mode" : "Dark mode", icon: darkMode ? Icons.sun : Icons.moon, action: () => setDarkMode(m => !m) },
                  { title: "Sign out", icon: Icons.signout, action: () => signOut() },
                ].map(({ title, icon, action }) => (
                  <button
                  key={title}
                  onClick={action}
                  aria-label={title}
                  onMouseEnter={e => { showRailTooltip(title, e, "right", <RailIcon name={title.includes("mode") ? (darkMode ? "sun" : "moon") : "signout"}>{icon}</RailIcon>); e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.14)" : "rgba(26,18,15,0.12)"; e.currentTarget.style.color = darkMode ? "#fff" : "rgba(26,18,15,0.92)"; e.currentTarget.style.background = collapsedIconHoverBg; }}
                  onMouseLeave={e => { hideRailTooltip(); e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.color = collapsedIconColor; e.currentTarget.style.background = "transparent"; }}
                  style={{
                    width: 44,
                    height: 44,
                    margin: "0 auto",
                    position: "static",
                    transform: "none",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid transparent",
                    boxShadow: "none",
                    borderRadius: 8, padding: 6, cursor: "pointer", color: collapsedIconColor, display: "flex",
                    transition: "all 0.15s",
                  }}
                  ><RailIcon name={title.includes("mode") ? (darkMode ? "sun" : "moon") : "signout"}>{icon}</RailIcon></button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { label: darkMode ? "Light" : "Dark", icon: darkMode ? Icons.sun : Icons.moon, action: () => setDarkMode(m => !m), danger: false },
                  { label: "Sign out", icon: Icons.signout, action: () => signOut(), danger: true },
                ].map(({ label, icon, action, danger }) => (
                  <button key={label} onClick={action} style={{
                    flex: 1, height: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.50)",
                    border: darkMode ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(255,255,255,0.70)",
                    boxShadow: darkMode ? "inset 0 1px 0 rgba(255,255,255,0.07)" : "inset 0 1px 0 rgba(255,255,255,0.90)",
                    borderRadius: 8, cursor: "pointer",
                    color: sidebarSubText, fontSize: 11, fontFamily: SANS, fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = darkMode ? "#fff" : (danger ? ACCENT : p.text);
                    e.currentTarget.style.borderColor = danger ? "rgba(134,31,65,0.40)" : (darkMode ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.90)");
                    e.currentTarget.style.background = danger ? "rgba(134,31,65,0.08)" : (darkMode ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)");
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = p.textMute;
                    e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)";
                    e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.50)";
                  }}
                  >{icon}<span>{label}</span></button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Not signed in */
          <button
            onClick={onSignIn}
            aria-label="Sign In"
            onMouseEnter={e => {
              if (collapsed) showRailTooltip("Sign In", e, "right", <RailIcon name="signin">{Icons.signin}</RailIcon>);
              if (collapsed) e.currentTarget.style.background = collapsedIconHoverBg;
            }}
            onMouseLeave={e => {
              hideRailTooltip();
              if (collapsed) e.currentTarget.style.background = "transparent";
            }}
            style={{
              width: collapsed ? 44 : "100%",
              height: collapsed ? 44 : "auto",
              margin: collapsed ? "0 auto" : 0,
              position: "static",
              transform: "none",
              display: "flex", alignItems: "center",
              gap: collapsed ? 0 : 8,
              padding: collapsed ? 0 : "9px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: "linear-gradient(135deg,#861F41,#a52856)",
              border: "none", borderRadius: 9, cursor: "pointer",
              color: "#fff", fontFamily: SANS, fontWeight: 600, fontSize: 13,
              ...(collapsed ? { background: "transparent", border: "1px solid transparent" } : {}),
            }}
          >
            {collapsed ? <RailIcon name="signin">{Icons.signin}</RailIcon> : Icons.signin}
            {!collapsed && <span>Sign In</span>}
          </button>
        )}
      </div>
      </div> {/* close inner content wrapper */}
    </div>
  );

  // ── Mobile header ─────────────────────────────────────────────────────────
  const MobileHeader = () => (
    <div style={{
      position: "sticky", top: 0, zIndex: 150,
      // Height grows by the status-bar inset so the bar never sits under the notch.
      height: safeArea.top(MOBILE_HEADER_H),
      paddingTop: safeArea.top(),
      display: "flex", alignItems: "center",
      paddingLeft: safeArea.left(12), paddingRight: safeArea.right(12),
      gap: 6,
      background: darkMode ? "rgba(14,11,10,0.90)" : "rgba(246,243,240,0.92)",
      backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)",
      borderBottom: `1px solid ${sidebarBorder}`, boxSizing: "border-box",
    }}>
      <button
        onClick={() => setDrawerOpen(o => !o)}
        aria-label={drawerOpen ? "Close menu" : "Open menu"}
        aria-expanded={drawerOpen}
        style={{
          background: "none", border: "none", cursor: "pointer", color: p.textSub,
          width: TAP, height: TAP, flexShrink: 0, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {Icons.hamburger}
      </button>
      <button
        onClick={() => setPage("landing")}
        aria-label="Darvis home"
        style={{
          background: "none", border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 8, padding: "0 4px", height: TAP, minWidth: 0,
        }}
      >
        <img src="/darvis-logo.png" alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
        <span style={{
          fontFamily: SANS, fontWeight: 700, fontSize: 15, color: p.text, letterSpacing: "-0.3px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>Darvis</span>
      </button>
      <div style={{ flex: 1 }} />
      {isSignedIn
        ? (
          <button
            onClick={() => setPage("profile")}
            aria-label="Profile"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              width: TAP, height: TAP, flexShrink: 0, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {user?.imageUrl
              ? <img src={user.imageUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#6b1833,#861F41,#b03060)", color: "#fff", fontWeight: 700, fontSize: 11, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials}</div>
            }
          </button>
        )
        : <button onClick={onSignIn} style={{
            background: "#861F41", border: "none", borderRadius: 8, padding: "0 14px",
            height: 36, minHeight: 36, color: "#fff", fontFamily: SANS, fontWeight: 600,
            fontSize: 13, cursor: "pointer", flexShrink: 0,
          }}>Sign In</button>
      }
    </div>
  );

  // ── Mobile drawer ─────────────────────────────────────────────────────────
  // The hamburger used to toggle `drawerOpen` with nothing listening, so it was
  // a dead control and Forums/Profile/theme/sign-out had no mobile entry point
  // at all (the bottom bar only carries four top-level destinations).
  const MobileDrawer = () => {
    const drawerItems = [
      ...navItems,
      ...(isSignedIn ? [{ id: "profile", label: "Profile", icon: Icons.profile }] : []),
      { id: "faqs", label: "FAQs", icon: Icons.forums },
    ];
    return (
      <>
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            // 50% scrim — enough to isolate the sheet from the page behind it.
            background: "rgba(0,0,0,0.50)",
            backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? "auto" : "none",
            transition: "opacity 0.24s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 201,
            width: "min(84vw, 300px)",
            display: "flex", flexDirection: "column",
            paddingTop: safeArea.top(), paddingBottom: safeArea.bottom(),
            paddingLeft: safeArea.left(),
            background: darkMode ? "rgba(12,9,8,0.98)" : "rgba(250,247,243,0.99)",
            borderRight: `1px solid ${sidebarBorder}`,
            boxShadow: drawerOpen ? "12px 0 40px rgba(0,0,0,0.35)" : "none",
            // Slide from the edge it belongs to; exit is quicker than enter.
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: drawerOpen
              ? "transform 0.28s cubic-bezier(0.22,1,0.36,1)"
              : "transform 0.19s cubic-bezier(0.4,0,1,1)",
            visibility: drawerOpen ? "visible" : "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px 16px" }}>
            <img src="/darvis-logo.png" alt="" style={{ width: 32, height: 32, borderRadius: 9, objectFit: "cover" }} />
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: p.text, flex: 1 }}>Darvis</span>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              style={{
                width: TAP, height: TAP, background: "none", border: "none", cursor: "pointer",
                color: p.textSub, fontSize: 22, lineHeight: 1, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>

          <div style={{ height: 1, background: p.lineSoft, margin: "0 16px 8px" }} />

          <nav style={{ flex: 1, overflowY: "auto", padding: "0 10px" }}>
            {drawerItems.map(item => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setPage(item.id); setDrawerOpen(false); }}
                  aria-current={active ? "page" : undefined}
                  style={{
                    width: "100%", minHeight: TAP + 4,
                    display: "flex", alignItems: "center", gap: 13,
                    padding: "0 12px", marginBottom: 3,
                    background: active
                      ? (darkMode ? "rgba(134,31,65,0.24)" : "rgba(134,31,65,0.10)")
                      : "transparent",
                    border: active
                      ? `1px solid ${darkMode ? "rgba(134,31,65,0.40)" : "rgba(134,31,65,0.24)"}`
                      : "1px solid transparent",
                    borderRadius: 11, cursor: "pointer", textAlign: "left",
                    color: active ? (darkMode ? "#fff" : ACCENT) : p.textSub,
                    fontFamily: SANS, fontWeight: active ? 650 : 500, fontSize: 15,
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge > 0 && (
                    <span style={{
                      background: active ? ACCENT : (darkMode ? "rgba(134,31,65,0.55)" : "rgba(134,31,65,0.16)"),
                      color: active ? "#fff" : ACCENT,
                      borderRadius: 999, padding: "2px 8px",
                      fontSize: 11, fontWeight: 700, fontFamily: MONO,
                    }}>{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${p.lineSoft}`, display: "flex", gap: 8 }}>
            <button
              onClick={() => setDarkMode(m => !m)}
              style={{
                flex: 1, minHeight: TAP, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 7, borderRadius: 10, cursor: "pointer",
                background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.70)",
                border: `1px solid ${p.line}`, color: p.textSub,
                fontFamily: SANS, fontSize: 13, fontWeight: 550,
              }}
            >
              {darkMode ? Icons.sun : Icons.moon}
              <span>{darkMode ? "Light" : "Dark"}</span>
            </button>
            {isSignedIn ? (
              <button
                onClick={() => { setDrawerOpen(false); signOut(); }}
                style={{
                  flex: 1, minHeight: TAP, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 7, borderRadius: 10, cursor: "pointer",
                  background: "rgba(134,31,65,0.10)",
                  border: "1px solid rgba(134,31,65,0.30)", color: ACCENT,
                  fontFamily: SANS, fontSize: 13, fontWeight: 600,
                }}
              >
                {Icons.signout}<span>Sign out</span>
              </button>
            ) : (
              <button
                onClick={() => { setDrawerOpen(false); onSignIn(); }}
                style={{
                  flex: 1, minHeight: TAP, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 7, borderRadius: 10, cursor: "pointer",
                  background: "linear-gradient(135deg,#861F41,#a52856)",
                  border: "none", color: "#fff",
                  fontFamily: SANS, fontSize: 13, fontWeight: 600,
                }}
              >
                {Icons.signin}<span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  // ── Landing page: position:fixed sidebar so window.scroll still works ────
  if (page === "landing" && !isMobile) {
    return (
      <div style={{ position: "relative" }}>
        <aside style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: sidebarW, zIndex: 100,
          transition: "width 0.28s cubic-bezier(0.16,1,0.3,1)",
          ...asideCss,
        }}>
          <SidebarContent />
        </aside>
        <RailTooltip tooltip={railTooltip} darkMode={darkMode} />
        <div style={{
          marginLeft: sidebarW,
          transition: "margin-left 0.28s cubic-bezier(0.16,1,0.3,1)",
        }}>
          {children}
        </div>
      </div>
    );
  }

  // ── Desktop (non-landing) ────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <aside style={{
          width: sidebarW, flexShrink: 0, height: "100dvh",
          transition: "width 0.28s cubic-bezier(0.16,1,0.3,1)",
          position: "relative", zIndex: 10,
          ...asideCss,
        }}>
          <SidebarContent />
        </aside>
        <RailTooltip tooltip={railTooltip} darkMode={darkMode} />
        <main key={page} style={{
          flex: 1, minHeight: 0,
          overflowY: page === "chatbot" ? "hidden" : "auto",
          overflowX: "hidden", position: "relative",
          animation: "dvPageIn 0.38s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          {children}
        </main>
      </div>
    );
  }

  // ── Mobile — bottom tab bar ───────────────────────────────────────────────
  const bottomNavItems = [
    { id: "search",      label: "Courses",    icon: Icons.courses     },
    { id: "schedule",    label: "Schedule",   icon: Icons.schedule    },
    { id: "chatbot",     label: "Cyrus",      icon: Icons.chatbot     },
    { id: "instructors", label: "Professors", icon: Icons.instructors },
  ];

  return (
    <>
      <div style={{
        display: "flex", flexDirection: "column", position: "relative", zIndex: 1,
        // dvh tracks the shrinking/growing URL bar; 100vh overflows by its height
        // on iOS Safari and pushes the composer below the fold in chat.
        ...(page === "chatbot" ? { height: "100dvh", overflow: "hidden" } : { minHeight: "100dvh" }),
      }}>
        <MobileHeader />
        <main key={page} style={{
          flex: 1, position: "relative",
          animation: "dvPageIn 0.38s cubic-bezier(0.22,1,0.36,1) both",
          overflowX: "hidden",
          // Clear the fixed tab bar *and* the home-indicator strip beneath it,
          // otherwise the last row of every list sits under the nav.
          paddingBottom: page === "chatbot" ? 0 : safeArea.bottom(MOBILE_NAV_H),
          ...(page === "chatbot" ? { display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" } : {}),
        }}>
          {children}
        </main>
      </div>

      <MobileDrawer />

      {/* Bottom navigation bar */}
      <nav
        aria-label="Primary"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          height: safeArea.bottom(MOBILE_NAV_H),
          paddingBottom: safeArea.bottom(),
          background: darkMode ? "rgba(10,7,6,0.90)" : "rgba(250,248,246,0.94)",
          backdropFilter: "blur(30px) saturate(1.8)",
          WebkitBackdropFilter: "blur(30px) saturate(1.8)",
          borderTop: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.09)",
          display: "flex", alignItems: "stretch",
          boxShadow: darkMode ? "0 -4px 30px rgba(0,0,0,0.45)" : "0 -2px 20px rgba(0,0,0,0.06)",
        }}
      >
        {bottomNavItems.map(item => {
          const isActive = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 3, padding: "6px 2px 8px",
                minHeight: MOBILE_NAV_H,
                background: "none", border: "none", cursor: "pointer",
                color: isActive ? ACCENT : p.textMute,
                // 9.5px labels sat under the 11px legibility floor on a phone.
                fontFamily: SANS, fontSize: 10.5, fontWeight: isActive ? 700 : 500,
                letterSpacing: "-0.1px",
                transition: "color 0.15s",
                borderTop: `2px solid ${isActive ? ACCENT : "transparent"}`,
              }}
            >
              <span style={{ display: "flex", opacity: isActive ? 1 : 0.55, transition: "opacity 0.15s" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
