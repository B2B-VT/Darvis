import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { SANS, ACCENT, palette, RADIUS } from "../theme.jsx";

export default function LockedProductPage({ darkMode = true, name, logo, onClose }) {
  const p = palette(darkMode);
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          maxWidth: 378,
          width: "100%",
          minHeight: 424,
          padding: "40px 36px 32px",
          borderRadius: 20,
          background: darkMode ? "rgba(16,14,19,0.96)" : "rgba(255,255,255,0.96)",
          border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(26,18,15,0.10)"}`,
          boxShadow: darkMode ? "0 28px 72px rgba(0,0,0,0.62)" : "0 28px 72px rgba(26,18,15,0.14)",
          textAlign: "center",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 28,
            height: 28,
            border: "none",
            borderRadius: RADIUS.xs,
            background: "transparent",
            color: darkMode ? "rgba(255,255,255,0.32)" : "rgba(26,18,15,0.42)",
            cursor: "pointer",
            fontSize: 22,
            lineHeight: "24px",
            fontFamily: SANS,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.68)" : p.text; }}
          onMouseLeave={e => { e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.32)" : "rgba(26,18,15,0.42)"; }}
        >
          ×
        </button>

        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 13,
            background: "#050505",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 22px",
            overflow: "hidden",
          }}
        >
          <img
            src={logo || "/darvis-logo.png"}
            alt=""
            style={{
              width: 38,
              height: 38,
              objectFit: "contain",
            }}
          />
        </div>

        <div
          style={{
            color: ACCENT,
            fontFamily: SANS,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Private Testing
        </div>

        <h1
          style={{
            margin: "0 0 2px",
            color: p.text,
            fontFamily: SANS,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.4px",
            lineHeight: 1.18,
          }}
        >
          {name} is still private
        </h1>
        <div
          style={{
            color: ACCENT,
            fontFamily: SANS,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.4px",
            lineHeight: 1.18,
            marginBottom: 16,
          }}
        >
          {name}
        </div>

        <p
          style={{
            margin: "0 auto 30px",
            maxWidth: 300,
            color: darkMode ? "rgba(255,255,255,0.42)" : "rgba(26,18,15,0.52)",
            fontSize: 13.5,
            lineHeight: 1.55,
            fontFamily: SANS,
          }}
        >
          {name} is still being tested with a small group. Sign in if your account has access.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SignInButton mode="modal">
            <button
              style={{
                width: "100%",
                height: 41,
                border: "none",
                borderRadius: 10,
                background: ACCENT,
                color: "#fff",
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 14,
                fontWeight: 800,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#9B2950"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ACCENT; }}
            >
              Sign in
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button
              style={{
                width: "100%",
                height: 39,
                borderRadius: 10,
                border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(26,18,15,0.12)"}`,
                background: darkMode ? "rgba(255,255,255,0.055)" : "rgba(26,18,15,0.035)",
                color: darkMode ? "rgba(255,255,255,0.72)" : p.textSub,
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 13.5,
                fontWeight: 700,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.09)" : "rgba(26,18,15,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.055)" : "rgba(26,18,15,0.035)"; }}
            >
              Create account
            </button>
          </SignUpButton>
        </div>

        <p
          style={{
            margin: "18px 0 0",
            color: darkMode ? "rgba(255,255,255,0.18)" : "rgba(26,18,15,0.28)",
            fontSize: 11,
            lineHeight: 1.4,
            fontFamily: SANS,
          }}
        >
          {name} will open more broadly after testing.
        </p>
      </div>
    </div>
  );
}
