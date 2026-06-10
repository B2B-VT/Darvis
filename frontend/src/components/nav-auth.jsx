// Nav component — dark minimal
import { useState, useEffect } from "react";
import { SignInButton, SignUpButton, SignedIn, SignedOut, useUser, useClerk } from "@clerk/clerk-react";

// StarRating stays here since courses.jsx and dashboard-prof.jsx import it
export function StarRating({ rating, max = 5, size = 14 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => {
        const fill = i < Math.floor(rating) ? 1 : i < rating ? 0.5 : 0;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 16 16">
            <defs>
              <linearGradient id={`sg${i}${Math.round(rating * 10)}`}>
                <stop offset={`${fill * 100}%`} stopColor="#861F41" />
                <stop offset={`${fill * 100}%`} stopColor="#333" />
              </linearGradient>
            </defs>
            <polygon points="8,1 10,6 15,6 11,9.5 12.5,15 8,12 3.5,15 5,9.5 1,6 6,6"
              fill={`url(#sg${i}${Math.round(rating * 10)})`} />
          </svg>
        );
      })}
    </span>
  );
}

export default function Nav({ page, setPage, schedule, darkMode = true, setDarkMode }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close menu on page change
  useEffect(() => { setMenuOpen(false); }, [page]);

  const navLinks = [
    { id: "search",      label: "Courses" },
    { id: "instructors", label: "Instructors" },
    { id: "schedule",    label: "Schedule" },
    { id: "chatbot",     label: "Chatbot" },
    { id: "forums",      label: "Forums" },
    { id: "faqs",        label: "FAQs" },
    { id: "about",       label: "About" },
  ];

  // Nav adapts: on landing page the campus image is behind it, elsewhere App bg applies
  const navBg     = darkMode ? "rgba(8,8,8,0.88)"   : "rgba(255,252,248,0.88)";
  const navBorder = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const logoColor = darkMode ? "white" : "#1a1210";
  const linkActive  = darkMode ? "white" : "#1a1210";
  const linkDefault = darkMode ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const linkSoon    = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";
  const metaColor   = darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.28)";

  // Sun icon (light mode) / Moon icon (dark mode)
  const ThemeIcon = () => darkMode ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );

  const HamburgerIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5"  width="16" height="1.8" rx="1" fill="currentColor"/>
      <rect x="2" y="9.1" width="16" height="1.8" rx="1" fill="currentColor"/>
      <rect x="2" y="13.2" width="16" height="1.8" rx="1" fill="currentColor"/>
    </svg>
  );
  const CloseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );

  return (
    <>
    <style>{`
      @keyframes navIconIn {
        from { opacity: 0; transform: rotate(-90deg) scale(0.6); }
        to   { opacity: 1; transform: rotate(0deg) scale(1); }
      }
      @keyframes navMenuIn {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
    <nav style={{
      position: "sticky", top: 0, zIndex: 200,
      background: navBg,
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      borderBottom: `1px solid ${navBorder}`,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      transition: "background 0.3s, border-color 0.3s",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: isMobile ? "0 16px" : "0 64px", height: 60,
        display: "flex", alignItems: "center", gap: 0,
        boxSizing: "border-box",
      }}>
        {/* Logo */}
        <button onClick={() => setPage("landing")} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 0, marginRight: isMobile ? 0 : 48,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 26, height: 26 }} />
          <span style={{
            fontWeight: 700, fontSize: 17, color: logoColor,
            letterSpacing: "-0.4px", transition: "color 0.3s",
          }}>
            Darvis
          </span>
        </button>

        {/* Desktop nav links */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {navLinks.map(link => (
              <button key={link.id} onClick={() => setPage(link.id)} style={{
                background: "none", border: "none",
                color: page === link.id ? linkActive : link.soon ? linkSoon : linkDefault,
                padding: "6px 14px", cursor: "pointer",
                fontWeight: page === link.id ? 700 : 500,
                fontSize: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "color 0.15s",
                borderRadius: 7,
                position: "relative",
                display: "flex", alignItems: "center", gap: 7,
              }}
              onMouseEnter={e => {
                if (!link.soon || page === link.id) e.currentTarget.style.color = linkActive;
                else e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = page === link.id ? linkActive : link.soon ? linkSoon : linkDefault;
              }}
              >
                {link.label}
                {link.soon && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                    background: "rgba(134,31,65,0.25)", color: "#861F41",
                    borderRadius: 5, padding: "2px 5px", textTransform: "uppercase",
                  }}>Soon</span>
                )}
                {link.id === "schedule" && schedule.length > 0 && (
                  <span style={{
                    background: "#861F41", color: "white",
                    borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800,
                  }}>{schedule.length}</span>
                )}
                <span style={{
                  position: "absolute", bottom: -1, left: "50%",
                  width: 20, height: 2, background: "#861F41", borderRadius: 2,
                  transform: `translateX(-50%) scaleX(${page === link.id ? 1 : 0})`,
                  transformOrigin: "center",
                  transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
                }} />
              </button>
            ))}
          </div>
        )}

        {/* Spacer on mobile */}
        {isMobile && <div style={{ flex: 1 }} />}

        {/* Right: theme toggle + auth (desktop) or just avatar + hamburger (mobile) */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
          {setDarkMode && (
            <button
              onClick={() => setDarkMode(m => !m)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: metaColor, padding: 6, borderRadius: 7,
                display: "flex", alignItems: "center",
                transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = darkMode ? "white" : "#1a1210";
                e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = metaColor;
                e.currentTarget.style.background = "none";
              }}
            >
              <span key={darkMode ? "moon" : "sun"} style={{
                display: "flex", alignItems: "center",
                animation: "navIconIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
              }}>
                <ThemeIcon />
              </span>
            </button>
          )}

          {/* Auth */}
          <SignedOut>
            {isMobile ? (
              <SignInButton mode="modal">
                <button style={{
                  background: "#861F41", color: "white", border: "none",
                  borderRadius: 999, padding: "7px 16px",
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>Sign in</button>
              </SignInButton>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SignUpButton mode="modal">
                  <button style={{
                    background: "transparent",
                    color: "#861F41",
                    border: "1px solid rgba(134,31,65,0.35)",
                    borderRadius: 999, padding: "7px 16px",
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(134,31,65,0.08)"; e.currentTarget.style.borderColor = "rgba(134,31,65,0.6)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(134,31,65,0.35)"; }}
                  >Join waitlist</button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button style={{
                    background: "#861F41", color: "white", border: "none",
                    borderRadius: 999, padding: "7px 18px",
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    boxShadow: "0 1px 8px rgba(134,31,65,0.25)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#9b2950"; e.currentTarget.style.boxShadow = "0 2px 14px rgba(134,31,65,0.35)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#861F41"; e.currentTarget.style.boxShadow = "0 1px 8px rgba(134,31,65,0.25)"; }}
                  >Sign in</button>
                </SignInButton>
              </div>
            )}
          </SignedOut>

          <SignedIn>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => signOut()}
                style={{
                  height: 30, padding: "0 14px",
                  background: "transparent",
                  border: `1px solid ${darkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`,
                  borderRadius: 999, cursor: "pointer",
                  color: darkMode ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.48)",
                  fontSize: 12, fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.28)";
                  e.currentTarget.style.color = darkMode ? "white" : "#1a1210";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = darkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)";
                  e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.48)";
                }}
              >Sign out</button>
              <button
                onClick={() => setPage("profile")}
                title="Your profile"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  borderRadius: 7,
                  outline: page === "profile" ? "2px solid #861F41" : "2px solid transparent",
                  outlineOffset: 2,
                  transition: "outline-color 0.15s",
                  display: "flex", alignItems: "center",
                }}
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="Profile"
                    style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)", color: "white",
                    fontWeight: 900, fontSize: 11,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {([user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || user?.username?.[0] || "?").toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </SignedIn>

          {/* Hamburger (mobile only) */}
          {isMobile && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
                padding: 6, borderRadius: 7, display: "flex", alignItems: "center",
              }}
            >
              {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          )}
        </div>
      </div>
    </nav>

    {/* Mobile dropdown menu */}
    {isMobile && menuOpen && (
      <div style={{
        position: "fixed", top: 60, left: 0, right: 0, zIndex: 199,
        background: navBg, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        borderBottom: `1px solid ${navBorder}`,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: "8px 16px 16px",
        animation: "navMenuIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}>
        {navLinks.map(link => (
          <button
            key={link.id}
            onClick={() => { setPage(link.id); setMenuOpen(false); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "none", border: "none", cursor: "pointer",
              color: page === link.id ? "#861F41" : (darkMode ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.7)"),
              padding: "14px 4px",
              fontWeight: page === link.id ? 700 : 500, fontSize: 16,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              borderBottom: `1px solid ${navBorder}`,
              textAlign: "left",
            }}
          >
            <span>{link.label}</span>
            {link.id === "schedule" && schedule.length > 0 && (
              <span style={{
                background: "#861F41", color: "white",
                borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 800,
              }}>{schedule.length}</span>
            )}
            {page === link.id && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#861F41" }} />
            )}
          </button>
        ))}
        <SignedOut>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <SignUpButton mode="modal">
              <button style={{
                flex: 1, background: "rgba(134,31,65,0.10)",
                color: "#861F41",
                border: "1.5px solid rgba(134,31,65,0.30)",
                borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>Join waitlist</button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button style={{
                flex: 1, background: "#861F41", color: "white", border: "none",
                borderRadius: 10, padding: "10px",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>Sign in</button>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    )}
    </>
  );
}

// AuthModal kept for compatibility but not used in the main flow
export function AuthModal({ onClose }) {
  return null;
}
