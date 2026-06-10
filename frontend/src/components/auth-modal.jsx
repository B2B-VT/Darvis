// Auth modal — overlay shown when a non-signed-in user clicks a protected page
import { SignInButton, SignUpButton } from "@clerk/clerk-react";

const PAGE_LABELS = {
  search:   "Browse Courses",
  schedule: "Schedule Builder",
  chatbot:  "Darvis",
  forums:   "Forums",
};

export default function AuthModal({ page, onClose, darkMode = true }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#0f0d14",
        border: "1.5px solid rgba(255,255,255,0.1)",
        borderRadius: 22,
        width: "100%", maxWidth: 420,
        padding: "44px 40px 40px",
        textAlign: "center",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        position: "relative",
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.28)", fontSize: 22, lineHeight: 1,
            padding: "4px 6px", borderRadius: 6,
            transition: "color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.28)"}
        >×</button>

        <div style={{ marginBottom: 20 }}>
          <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 56, height: 56 }} />
        </div>

        <div style={{
          fontSize: 10, fontWeight: 700, color: "#861F41",
          letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: 14,
        }}>
          Invite Only · Beta
        </div>

        <h2 style={{
          margin: "0 0 12px",
          fontSize: 24, fontWeight: 800, color: "white", letterSpacing: "-0.5px",
          lineHeight: 1.25,
        }}>
          Sign in to access<br />
          <span style={{ color: "#861F41" }}>{PAGE_LABELS[page] || "this feature"}</span>
        </h2>

        <p style={{
          margin: "0 0 30px",
          fontSize: 14, color: "rgba(255,255,255,0.42)", lineHeight: 1.65,
        }}>
          Darvis is invite-only during beta.<br />
          Already have an invite? Sign in or create an account.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SignInButton mode="modal">
            <button style={{
              background: "#861F41", color: "white", border: "none",
              borderRadius: 12, padding: "13px 24px", width: "100%",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Sign in
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.72)",
              border: "1.5px solid rgba(255,255,255,0.1)",
              borderRadius: 12, padding: "12px 24px", width: "100%",
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            >
              Create account
            </button>
          </SignUpButton>
        </div>

        <p style={{ margin: "20px 0 0", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
          No invite? Reach out to a founder for access.
        </p>
      </div>
    </div>
  );
}
