// macOS Big Sur–style sidebar shell — used for all pages including landing
import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { palette, ACCENT, SANS, MONO } from "../theme.jsx";

const SIDEBAR_W   = 220;
const SIDEBAR_COL = 52;  // collapsed icon-only width

// ── Collapse chevron ──────────────────────────────────────────────────────────
const CollapseIcon = ({ collapsed }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    {collapsed
      ? <><line x1="3" y1="7" x2="11" y2="7"/><polyline points="7,3 11,7 7,11"/></>
      : <><line x1="3" y1="7" x2="11" y2="7"/><polyline points="7,3 3,7 7,11"/></>
    }
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

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SidebarItem({ label, icon, active, darkMode, badge, onClick, collapsed }) {
  const p = palette(darkMode);
  const [hovered, setHovered] = useState(false);

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

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 10,
        padding: collapsed ? "7px 0" : "7px 10px",
        justifyContent: collapsed ? "center" : "flex-start",
        marginBottom: 3,
        ...(active ? activeStyle : hovered ? hoverStyle : { background: "transparent", border: "1px solid transparent", boxShadow: "none" }),
        borderRadius: 10, cursor: "pointer",
        color: active ? (darkMode ? "#fff" : ACCENT) : (hovered ? p.text : p.textSub),
        fontFamily: SANS, fontWeight: active ? 600 : 500, fontSize: 13.5,
        textAlign: "left",
        transition: "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s, padding 0.20s",
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : hovered ? 0.90 : 0.70, display: "flex", transition: "opacity 0.15s" }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge > 0 && (
        <span style={{
          background: active ? ACCENT : darkMode ? "rgba(134,31,65,0.55)" : "rgba(134,31,65,0.18)",
          color: active ? "#fff" : ACCENT,
          borderRadius: 999, padding: "1px 7px",
          fontSize: 10.5, fontWeight: 700, fontFamily: MONO, flexShrink: 0,
          border: `1px solid ${active ? "transparent" : "rgba(134,31,65,0.30)"}`,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell({
  page, setPage, darkMode, setDarkMode,
  schedule, isSignedIn, onSignIn, children,
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 768);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed]   = useState(false);
  const p = palette(darkMode);

  const sidebarW = collapsed ? SIDEBAR_COL : SIDEBAR_W;

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [page]);

  const navItems = [
    { id: "search",      label: "Courses",    icon: Icons.courses     },
    { id: "instructors", label: "Instructors", icon: Icons.instructors },
    { id: "schedule",    label: "Schedule",   icon: Icons.schedule, badge: isSignedIn ? (schedule?.length || 0) : 0 },
    { id: "chatbot",     label: "Cyrus", icon: Icons.chatbot     },
    { id: "forums",      label: "Forums",     icon: Icons.forums      },
  ];

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "Account";
  const initials    = ([user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || user?.username?.[0] || "?").toUpperCase();

  const sidebarBorder = darkMode ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.65)";

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

      {/* Title bar */}
      <div style={{
        height: 52, display: "flex", alignItems: "center",
        padding: collapsed ? "0 0 0 14px" : "0 10px 0 18px",
        gap: collapsed ? 0 : 10, flexShrink: 0,
        borderBottom: `1px solid ${sidebarBorder}`,
        justifyContent: collapsed ? "center" : "flex-start",
      }}>
        {!collapsed && (
          <button onClick={() => setPage("landing")} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: SANS, fontWeight: 600, fontSize: 13,
            color: p.textMute, letterSpacing: "-0.2px", textAlign: "left",
          }}>Darvis</button>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 4,
            color: p.textFaint, display: "flex", borderRadius: 6,
            transition: "color 0.12s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = p.textSub}
          onMouseLeave={e => e.currentTarget.style.color = p.textFaint}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>

      {/* App icon / logo */}
      {collapsed ? (
        <button onClick={() => setPage("landing")} title="Home" style={{
          padding: "12px 0", display: "flex", justifyContent: "center",
          flexShrink: 0, background: "none", border: "none", cursor: "pointer", width: "100%",
        }}>
          <img src="/darvis-logo.png" alt="Darvis" style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover" }} />
        </button>
      ) : (
        <button onClick={() => setPage("landing")} style={{
          padding: "16px 14px 10px", display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0, background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left",
        }}>
          <img src="/darvis-logo.png" alt="Darvis" style={{
            width: 42, height: 42, borderRadius: 10, objectFit: "cover",
            boxShadow: "0 2px 10px rgba(0,0,0,0.22)", flexShrink: 0,
          }} />
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14.5, color: p.text, letterSpacing: "-0.3px" }}>Darvis</div>
          </div>
        </button>
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
      <nav style={{ flex: 1, padding: collapsed ? "0 6px" : "0 8px", overflowY: "auto" }}>
        {navItems.map(item => (
          <SidebarItem
            key={item.id} {...item}
            active={page === item.id}
            darkMode={darkMode}
            collapsed={collapsed}
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
      <div style={{ padding: collapsed ? "10px 6px 12px" : "10px 8px 12px", flexShrink: 0 }}>
        {isSignedIn ? (
          <>
            {/* Profile */}
            <button
              onClick={() => setPage("profile")}
              title={collapsed ? displayName : undefined}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                gap: collapsed ? 0 : 10,
                padding: collapsed ? "8px 0" : "8px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                marginBottom: 8,
                background: page === "profile"
                  ? (darkMode ? "rgba(134,31,65,0.20)" : "rgba(134,31,65,0.09)")
                  : "transparent",
                border: page === "profile"
                  ? `1px solid ${darkMode ? "rgba(134,31,65,0.35)" : "rgba(134,31,65,0.20)"}`
                  : "1px solid transparent",
                borderRadius: 8, cursor: "pointer", fontFamily: SANS, textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { if (page !== "profile") e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (page !== "profile") e.currentTarget.style.background = "transparent"; }}
            >
              {user?.imageUrl
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
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: p.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                </div>
              )}
            </button>

            {/* Theme + sign out */}
            {collapsed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                {[
                  { title: darkMode ? "Light mode" : "Dark mode", icon: darkMode ? Icons.sun : Icons.moon, action: () => setDarkMode(m => !m) },
                  { title: "Sign out", icon: Icons.signout, action: () => signOut() },
                ].map(({ title, icon, action }) => (
                  <button key={title} onClick={action} title={title} style={{
                    background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.50)",
                    border: darkMode ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(255,255,255,0.70)",
                    boxShadow: darkMode ? "inset 0 1px 0 rgba(255,255,255,0.07)" : "inset 0 1px 0 rgba(255,255,255,0.90)",
                    borderRadius: 8, padding: 6, cursor: "pointer", color: p.textMute, display: "flex",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(134,31,65,0.40)"; e.currentTarget.style.color = ACCENT; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.70)"; e.currentTarget.style.color = p.textMute; }}
                  >{icon}</button>
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
                    color: p.textMute, fontSize: 11, fontFamily: SANS, fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = danger ? ACCENT : p.text;
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
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: collapsed ? 0 : 8,
              padding: collapsed ? "8px 0" : "9px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: "linear-gradient(135deg,#861F41,#a52856)",
              border: "none", borderRadius: 9, cursor: "pointer",
              color: "#fff", fontFamily: SANS, fontWeight: 600, fontSize: 13,
            }}
            title={collapsed ? "Sign In" : undefined}
          >
            {Icons.signin}
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
      height: 52, display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
      background: darkMode ? "rgba(14,11,10,0.90)" : "rgba(246,243,240,0.92)",
      backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)",
      borderBottom: `1px solid ${sidebarBorder}`, boxSizing: "border-box",
    }}>
      <button onClick={() => setDrawerOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: p.textSub, padding: 4, display: "flex", borderRadius: 6 }}>
        {Icons.hamburger}
      </button>
      <button onClick={() => setPage("landing")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
        <img src="/darvis-logo.png" alt="Darvis" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: p.text, letterSpacing: "-0.3px" }}>Darvis</span>
      </button>
      <div style={{ flex: 1 }} />
      {isSignedIn
        ? (user?.imageUrl
            ? <img src={user.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#6b1833,#861F41,#b03060)", color: "#fff", fontWeight: 700, fontSize: 10, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials}</div>
          )
        : <button onClick={onSignIn} style={{ background: "#861F41", border: "none", borderRadius: 7, padding: "5px 12px", color: "#fff", fontFamily: SANS, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Sign In</button>
      }
    </div>
  );

  // ── Landing page: position:fixed sidebar so window.scroll still works ────
  if (page === "landing" && !isMobile) {
    return (
      <div style={{ position: "relative" }}>
        <aside style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: sidebarW, zIndex: 100,
          transition: "width 0.2s cubic-bezier(0.22,1,0.36,1)",
          ...asideCss,
        }}>
          <SidebarContent />
        </aside>
        <div style={{
          marginLeft: sidebarW,
          transition: "margin-left 0.2s cubic-bezier(0.22,1,0.36,1)",
        }}>
          {children}
        </div>
      </div>
    );
  }

  // ── Desktop (non-landing) ────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <aside style={{
          width: sidebarW, flexShrink: 0, height: "100vh",
          transition: "width 0.2s cubic-bezier(0.22,1,0.36,1)",
          position: "relative", zIndex: 10,
          ...asideCss,
        }}>
          <SidebarContent />
        </aside>
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
        ...(page === "chatbot" ? { height: "100vh", overflow: "hidden" } : { minHeight: "100vh" }),
      }}>
        <MobileHeader />
        <main key={page} style={{
          flex: 1, position: "relative",
          animation: "dvPageIn 0.38s cubic-bezier(0.22,1,0.36,1) both",
          overflowX: "hidden",
          paddingBottom: page === "chatbot" ? 0 : 62,
          ...(page === "chatbot" ? { display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" } : {}),
        }}>
          {children}
        </main>
      </div>

      {/* Bottom navigation bar */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 62,
        background: darkMode ? "rgba(10,7,6,0.90)" : "rgba(250,248,246,0.94)",
        backdropFilter: "blur(30px) saturate(1.8)",
        WebkitBackdropFilter: "blur(30px) saturate(1.8)",
        borderTop: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.09)",
        display: "flex", alignItems: "stretch",
        boxShadow: darkMode ? "0 -4px 30px rgba(0,0,0,0.45)" : "0 -2px 20px rgba(0,0,0,0.06)",
      }}>
        {bottomNavItems.map(item => {
          const isActive = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 3, padding: "6px 0 8px",
                background: "none", border: "none", cursor: "pointer",
                color: isActive ? ACCENT : p.textMute,
                fontFamily: SANS, fontSize: 9.5, fontWeight: isActive ? 700 : 500,
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
