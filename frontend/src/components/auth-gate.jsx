// Auth gate — shown when a non-signed-in user navigates to a protected page
import { SignInButton, SignUpButton } from "@clerk/clerk-react";

const PAGE_LABELS = {
  search:   "Browse Courses",
  schedule: "Schedule Builder",
  chatbot:  "Cyrus",
  forums:   "Forums",
  kairo:    "Kairo",
  ruvo:     "Ruvo",
  watchlist:"Watchlist",
};

const PAGE_ICONS = {
  search:   "📚",
  schedule: "📅",
  chatbot:  "🦃",
  forums:   "💬",
  kairo:    "📄",
  ruvo:     "🛋️",
  watchlist:"🔔",
};

export default function AuthGate({ page, darkMode }) {
  const dm = darkMode;
  const c = dm ? {
    bg:     "transparent",
    head:   "#ffffff",
    sub:    "rgba(255,255,255,0.45)",
    card:   "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
  } : {
    bg:     "transparent",
    head:   "#1a1210",
    sub:    "rgba(0,0,0,0.45)",
    card:   "rgba(0,0,0,0.03)",
    border: "rgba(0,0,0,0.08)",
  };

  return (
    <div style={{
      background: c.bg,
      minHeight: "calc(100vh - 60px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{ textAlign: "center", maxWidth: 440, padding: "0 24px" }}>

        <div style={{ fontSize: 56, marginBottom: 20 }}>
          {PAGE_ICONS[page] || "🔒"}
        </div>

        <div style={{
          fontSize: 11, fontWeight: 800, color: "#861F41",
          letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16,
        }}>
          {page === "chatbot" ? "Private Testing" : "Student Account"}
        </div>

        <h2 style={{
          margin: "0 0 14px",
          fontSize: 28, fontWeight: 800,
          color: c.head, letterSpacing: "-0.5px",
          lineHeight: 1.2,
        }}>
          {page === "chatbot" ? "Cyrus is still private" : "Sign in to continue"}<br />
          <span style={{ color: "#861F41" }}>{PAGE_LABELS[page] || "this page"}</span>
        </h2>

        <p style={{
          margin: "0 0 36px",
          fontSize: 15, color: c.sub, lineHeight: 1.65,
        }}>
          {page === "chatbot"
            ? "Cyrus is still being tested with a small group. Sign in if your account has access."
            : "Darvis is live. Create a free account to save your work across devices."}
        </p>

        {page === "chatbot" ? (
          <SignInButton mode="modal">
            <button style={{
              background: "#861F41", color: "white", border: "none",
              borderRadius: 12, padding: "13px 36px",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: "-0.2px",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Sign in
            </button>
          </SignInButton>
        ) : (
          <SignUpButton mode="modal">
            <button style={{
              background: "#861F41", color: "white", border: "none",
              borderRadius: 12, padding: "13px 36px",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: "-0.2px",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Create account
            </button>
          </SignUpButton>
        )}

        <p style={{ margin: "20px 0 0", fontSize: 12, color: c.sub }}>
          {page === "chatbot" ? "Cyrus will open more broadly after testing." : "You can browse Darvis now without creating an account."}
        </p>
      </div>
    </div>
  );
}
