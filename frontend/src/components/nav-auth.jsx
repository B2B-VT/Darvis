// Nav — floating glass capsule with sliding active indicator
import { useState, useEffect, useRef } from "react";
import { SignInButton, SignUpButton, SignedIn, SignedOut, useUser, useClerk } from "@clerk/clerk-react";
import { palette, ACCENT, ACCENT_HOVER, SANS, MONO, EASE } from "../theme.jsx";

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
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [scrolled, setScrolled] = useState(false);

  // Sliding indicator
  const linkRefs = useRef({});
  const rowRef = useRef(null);
  const [pill, setPill] = useState(null); // { left, width }

  const p = palette(darkMode);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on page change
  useEffect(() => { setMenuOpen(false); }, [page]);

  const navLinks = [
    { id: "search",      label: "Courses" },
    { id: "instructors", label: "Instructors" },
    { id: "schedule",    label: "Schedule" },
    { id: "chatbot",     label: "Chatbot" },
    { id: "forums",      label: "Forums" },
  ];

  // Measure the active link and slide the pill under it
  useEffect(() => {
    const el = linkRefs.current[page];
    const row = rowRef.current;
    if (el && row) {
      const rowBox = row.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      setPill({ left: box.left - rowBox.left, width: box.width });
    } else {
      setPill(null);
    }
  }, [page, isMobile]);

  const ThemeIcon = () => darkMode ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );

  const HamburgerIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5.5" width="16" height="1.6" rx="0.8" fill="currentColor"/>
      <rect x="2" y="9.2" width="11" height="1.6" rx="0.8" fill="currentColor"/>
      <rect x="2" y="12.9" width="16" height="1.6" rx="0.8" fill="currentColor"/>
    </svg>
  );
  const CloseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
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
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>

    {/* Floating capsule */}
    <div style={{
      position: "sticky", top: 0, zIndex: 200,
      padding: isMobile ? "10px 12px" : "14px 24px",
      display: "flex", justifyContent: "center",
      pointerEvents: "none",
    }}>
      <nav style={{
        pointerEvents: "auto",
        width: "100%", maxWidth: 1150,
        display: "flex", alignItems: "center",
        gap: isMobile ? 8 : 6,
        padding: isMobile ? "8px 10px 8px 14px" : "8px 10px 8px 18px",
        borderRadius: 999,
        // Liquid glass: heavy blur + saturation, translucent sheen gradient,
        // inset top highlight + bottom shadow hairlines for the lensed-edge look
        background: darkMode
          ? "linear-gradient(180deg, rgba(38,30,27,0.62), rgba(20,16,14,0.5))"
          : "linear-gradient(180deg, rgba(255,255,255,0.66), rgba(250,246,240,0.45))",
        backdropFilter: "blur(28px) saturate(1.9)",
        WebkitBackdropFilter: "blur(28px) saturate(1.9)",
        border: `1px solid ${darkMode ? "rgba(244,239,233,0.14)" : "rgba(255,255,255,0.65)"}`,
        boxShadow: (scrolled
          ? (darkMode ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(26,18,15,0.14)")
          : (darkMode ? "0 4px 16px rgba(0,0,0,0.25)" : "0 4px 16px rgba(26,18,15,0.07)"))
          + (darkMode
            ? ", inset 0 1px 0 rgba(244,239,233,0.12), inset 0 -1px 0 rgba(0,0,0,0.3)"
            : ", inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(26,18,15,0.05)"),
        transition: `box-shadow 0.4s ease, background 0.45s ease, border-color 0.45s ease`,
        fontFamily: SANS,
        boxSizing: "border-box",
      }}>
        {/* Logo — left zone (flex:1 so links sit dead-center) */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <button onClick={() => setPage("landing")} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 0,
          display: "flex", alignItems: "center", gap: 9,
        }}
        onMouseEnter={e => { const img = e.currentTarget.querySelector("img"); if (img) img.style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { const img = e.currentTarget.querySelector("img"); if (img) img.style.transform = "none"; }}
        >
          <img src="/darvis-logo.png" alt="Darvis"
            style={{
              width: 30, height: 30,
              borderRadius: 8,
              objectFit: "cover",
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              transition: `transform 0.3s ${EASE}`,
            }} />
          <span style={{
            fontWeight: 700, fontSize: 16.5, color: p.text,
            letterSpacing: "-0.4px",
          }}>
            Darvis
          </span>
        </button>
        </div>

        {/* Desktop links — centered zone with sliding pill */}
        {!isMobile && (
          <div ref={rowRef} style={{ display: "flex", gap: 2, position: "relative", alignItems: "center" }}>
            {/* Sliding indicator */}
            {pill && (
              <span aria-hidden="true" style={{
                position: "absolute", top: "50%",
                left: pill.left, width: pill.width,
                height: 32, transform: "translateY(-50%)",
                background: darkMode ? "rgba(134,31,65,0.22)" : "rgba(134,31,65,0.10)",
                border: `1px solid ${darkMode ? "rgba(134,31,65,0.45)" : "rgba(134,31,65,0.28)"}`,
                borderRadius: 999,
                transition: `left 0.4s ${EASE}, width 0.4s ${EASE}`,
                pointerEvents: "none",
              }} />
            )}
            {navLinks.map(link => (
              <button key={link.id}
                ref={el => { linkRefs.current[link.id] = el; }}
                onClick={() => setPage(link.id)}
                style={{
                  background: "none", border: "none",
                  color: page === link.id ? (darkMode ? "#fff" : ACCENT) : p.textMute,
                  padding: "7px 13px", cursor: "pointer",
                  fontWeight: page === link.id ? 600 : 500,
                  fontSize: 13.5,
                  fontFamily: SANS,
                  borderRadius: 999,
                  position: "relative", zIndex: 1,
                  display: "flex", alignItems: "center", gap: 7,
                  transition: "color 0.25s ease",
                }}
                onMouseEnter={e => { if (page !== link.id) e.currentTarget.style.color = p.text; }}
                onMouseLeave={e => { e.currentTarget.style.color = page === link.id ? (darkMode ? "#fff" : ACCENT) : p.textMute; }}
              >
                {link.label}
                {link.id === "schedule" && schedule.length > 0 && (
                  <span style={{
                    fontFamily: MONO,
                    background: ACCENT, color: "white",
                    borderRadius: 999, padding: "1px 7px", fontSize: 10.5, fontWeight: 600,
                    animation: "dvPop 0.3s cubic-bezier(0.34,1.2,0.64,1) both",
                  }}>{schedule.length}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Right cluster — right zone (flex:1, content pushed to the end) */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: isMobile ? 8 : 10 }}>
          {setDarkMode && (
            <button
              onClick={() => setDarkMode(m => !m)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                background: "none", cursor: "pointer",
                border: `1px solid ${p.lineSoft}`,
                color: p.textMute, width: 32, height: 32, borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = p.text; e.currentTarget.style.borderColor = p.line; }}
              onMouseLeave={e => { e.currentTarget.style.color = p.textMute; e.currentTarget.style.borderColor = p.lineSoft; }}
            >
              <span key={darkMode ? "moon" : "sun"} style={{
                display: "flex", alignItems: "center",
                animation: `navIconIn 0.4s ${EASE} both`,
              }}>
                <ThemeIcon />
              </span>
            </button>
          )}

          <SignedOut>
            {isMobile ? (
              <SignInButton mode="modal">
                <button style={{
                  background: ACCENT, color: "white", border: "none",
                  borderRadius: 999, padding: "7px 15px",
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                  fontFamily: SANS,
                }}>Sign in</button>
              </SignInButton>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <SignUpButton mode="modal">
                  <button style={{
                    background: "transparent", color: ACCENT,
                    border: `1px solid rgba(134,31,65,0.35)`,
                    borderRadius: 999, padding: "7px 15px",
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                    fontFamily: SANS,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(134,31,65,0.08)"; e.currentTarget.style.borderColor = "rgba(134,31,65,0.6)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(134,31,65,0.35)"; }}
                  >Join waitlist</button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button style={{
                    background: ACCENT, color: "white", border: "none",
                    borderRadius: 999, padding: "7px 17px",
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                    fontFamily: SANS,
                    boxShadow: "0 1px 10px rgba(134,31,65,0.3)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = ACCENT_HOVER; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ACCENT; }}
                  >Sign in</button>
                </SignInButton>
              </div>
            )}
          </SignedOut>

          <SignedIn>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {!isMobile && (
                <button
                  onClick={() => signOut()}
                  style={{
                    height: 32, padding: "0 13px",
                    background: "transparent",
                    border: `1px solid ${p.lineSoft}`,
                    borderRadius: 999, cursor: "pointer",
                    color: p.textMute,
                    fontSize: 12, fontWeight: 600,
                    fontFamily: SANS,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = p.text; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = p.lineSoft; e.currentTarget.style.color = p.textMute; }}
                >Sign out</button>
              )}
              <button
                onClick={() => setPage("profile")}
                title="Your profile"
                aria-label="Your profile"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  borderRadius: 999,
                  outline: page === "profile" ? `2px solid ${ACCENT}` : "2px solid transparent",
                  outlineOffset: 2,
                  transition: "outline-color 0.2s",
                  display: "flex", alignItems: "center",
                }}
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="Profile"
                    style={{ width: 30, height: 30, borderRadius: 999, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)", color: "white",
                    fontWeight: 700, fontSize: 11, fontFamily: SANS,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {([user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || user?.username?.[0] || "?").toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </SignedIn>

          {isMobile && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: p.textSub,
                padding: 6, borderRadius: 999, display: "flex", alignItems: "center",
              }}
            >
              <span key={menuOpen ? "x" : "h"} style={{ display: "flex", animation: `navIconIn 0.3s ${EASE} both` }}>
                {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>

    {/* Mobile dropdown */}
    {isMobile && menuOpen && (
      <div style={{
        position: "fixed", top: 64, left: 12, right: 12, zIndex: 199,
        background: p.glass,
        backdropFilter: "blur(22px) saturate(1.4)", WebkitBackdropFilter: "blur(22px) saturate(1.4)",
        border: `1px solid ${p.line}`,
        borderRadius: 22,
        fontFamily: SANS,
        padding: "6px 16px 16px",
        boxShadow: darkMode ? "0 16px 48px rgba(0,0,0,0.5)" : "0 16px 48px rgba(26,18,15,0.16)",
        animation: "navMenuIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}>
        {navLinks.map((link, i) => (
          <button
            key={link.id}
            onClick={() => { setPage(link.id); setMenuOpen(false); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "none", border: "none", cursor: "pointer",
              color: page === link.id ? ACCENT : p.textSub,
              padding: "14px 4px",
              fontWeight: page === link.id ? 650 : 500, fontSize: 16,
              fontFamily: SANS,
              borderBottom: i < navLinks.length - 1 ? `1px solid ${p.lineSoft}` : "none",
              textAlign: "left",
              animation: `dvFadeUp 0.4s ${EASE} ${0.03 * i}s both`,
            }}
          >
            <span>{link.label}</span>
            {link.id === "schedule" && schedule.length > 0 && (
              <span style={{
                fontFamily: MONO,
                background: ACCENT, color: "white",
                borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600,
              }}>{schedule.length}</span>
            )}
            {page === link.id && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
            )}
          </button>
        ))}
        <SignedIn>
          <button
            onClick={() => signOut()}
            style={{
              width: "100%", marginTop: 14,
              background: "transparent",
              border: `1px solid ${p.line}`,
              borderRadius: 999, padding: "10px", fontWeight: 600, fontSize: 14,
              color: p.textSub, cursor: "pointer", fontFamily: SANS,
            }}>Sign out</button>
        </SignedIn>
        <SignedOut>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <SignUpButton mode="modal">
              <button style={{
                flex: 1, background: "transparent",
                color: ACCENT,
                border: "1px solid rgba(134,31,65,0.35)",
                borderRadius: 999, padding: "10px", fontWeight: 600, fontSize: 14,
                cursor: "pointer", fontFamily: SANS,
              }}>Join waitlist</button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button style={{
                flex: 1, background: ACCENT, color: "white", border: "none",
                borderRadius: 999, padding: "10px",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
                fontFamily: SANS,
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
