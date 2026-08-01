import { useEffect, useMemo, useState } from "react";
import { API } from "../api.js";
import { ACCENT, MONO, SANS, palette, RADIUS } from "../theme.jsx";

const TOKEN_KEY = "darvis_feedback_dev_token";

function RatingPill({ rating }) {
  const positive = Number(rating) === 1;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      borderRadius: RADIUS.pill,
      padding: "4px 10px",
      fontSize: 12,
      fontWeight: 800,
      color: positive ? "#19c37d" : "#ff6b7a",
      background: positive ? "rgba(25,195,125,0.10)" : "rgba(255,107,122,0.10)",
      border: `1px solid ${positive ? "rgba(25,195,125,0.24)" : "rgba(255,107,122,0.24)"}`,
    }}>
      {positive ? "Thumbs up" : "Thumbs down"}
    </span>
  );
}

export default function FeedbackReviewPage({ darkMode }) {
  const dm = darkMode;
  const p = palette(dm);
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  });
  const [draftToken, setDraftToken] = useState(token);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(token ? "loading" : "idle");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async (nextToken = token) => {
    if (!nextToken.trim()) {
      setStatus("idle");
      setError("Enter the developer token to load feedback.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const data = await API.getCyrusFeedback({ token: nextToken.trim(), limit: 150 });
      setRows(data);
      setStatus("ready");
      try { localStorage.setItem(TOKEN_KEY, nextToken.trim()); } catch {}
      setToken(nextToken.trim());
    } catch (err) {
      setRows([]);
      setStatus("error");
      setError(err.message || "Unable to load feedback.");
    }
  };

  useEffect(() => {
    if (token) load(token);
  }, []);

  const visibleRows = useMemo(() => {
    if (filter === "up") return rows.filter(row => Number(row.rating) === 1);
    if (filter === "down") return rows.filter(row => Number(row.rating) === -1);
    if (filter === "reason") return rows.filter(row => String(row.reason || "").trim());
    return rows;
  }, [rows, filter]);

  const cardBg = dm ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.72)";
  const border = dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)";

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "38px 28px", color: p.text, fontFamily: SANS }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: ACCENT, marginBottom: 8 }}>
              Cyrus Feedback
            </div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, letterSpacing: 0 }}>Review responses</h1>
          </div>
          <button
            onClick={() => load()}
            disabled={status === "loading"}
            style={{
              border: `1px solid ${border}`,
              background: cardBg,
              color: p.text,
              borderRadius: RADIUS.sm,
              padding: "9px 14px",
              fontFamily: SANS,
              fontWeight: 760,
              cursor: status === "loading" ? "default" : "pointer",
            }}
          >
            {status === "loading" ? "Loading" : "Refresh"}
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) auto",
          gap: 10,
          marginBottom: 18,
        }}>
          <input
            value={draftToken}
            onChange={e => setDraftToken(e.target.value)}
            placeholder="Developer token"
            type="password"
            style={{
              background: dm ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.82)",
              color: p.text,
              border: `1px solid ${border}`,
              borderRadius: RADIUS.sm,
              padding: "10px 12px",
              outline: "none",
              fontFamily: SANS,
              fontSize: 14,
            }}
          />
          <button
            onClick={() => load(draftToken)}
            style={{
              background: ACCENT,
              color: "white",
              border: "none",
              borderRadius: RADIUS.sm,
              padding: "10px 16px",
              fontFamily: SANS,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Load
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            ["all", `All ${rows.length}`],
            ["down", `Down ${rows.filter(r => Number(r.rating) === -1).length}`],
            ["up", `Up ${rows.filter(r => Number(r.rating) === 1).length}`],
            ["reason", `With reason ${rows.filter(r => String(r.reason || "").trim()).length}`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              style={{
                background: filter === id ? ACCENT : "transparent",
                color: filter === id ? "white" : p.textSub,
                border: `1px solid ${filter === id ? ACCENT : border}`,
                borderRadius: RADIUS.pill,
                padding: "6px 12px",
                fontFamily: SANS,
                fontWeight: 760,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ color: "#ff6b7a", fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {visibleRows.map(row => (
            <div key={row.id || `${row.created_at}-${row.question}`} style={{
              background: cardBg,
              border: `1px solid ${border}`,
              borderRadius: RADIUS.sm,
              padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <RatingPill rating={row.rating} />
                <div style={{ color: p.textMute, fontSize: 12, fontFamily: MONO }}>
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "No timestamp"} · {row.route || "unknown"}
                </div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ color: p.textMute, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Question</div>
                  <div style={{ color: p.text, lineHeight: 1.55 }}>{row.question}</div>
                </div>
                <div>
                  <div style={{ color: p.textMute, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Answer</div>
                  <div style={{ color: p.textSub, lineHeight: 1.55, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap" }}>{row.answer}</div>
                </div>
                {String(row.reason || "").trim() && (
                  <div>
                    <div style={{ color: p.textMute, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Reason</div>
                    <div style={{ color: p.text, lineHeight: 1.55 }}>{row.reason}</div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {status !== "loading" && !visibleRows.length && (
            <div style={{ color: p.textSub, padding: 28, textAlign: "center", border: `1px solid ${border}`, borderRadius: RADIUS.sm }}>
              No feedback matches this view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
