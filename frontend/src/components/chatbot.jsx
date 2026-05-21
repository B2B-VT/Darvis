// Chatbot page — full AI chat experience powered by the FastAPI backend
import { useState, useEffect, useRef, useCallback } from "react";
import { Chart, registerables } from "chart.js";
import { DARVIS_CONFIG } from "../config.js";

Chart.register(...registerables);

const CHAT_API = DARVIS_CONFIG.chatApiUrl;

const SUGGESTED = [
  "Which CS 3114 professor has the strongest grade outcomes?",
  "Show me CS electives with the highest GPA",
  "What 2000-level courses have the lowest F rate?",
  "Professor profile for Shaffer",
  "Which CS courses have the most grade data?",
];

// ── Input sanitization & NLP normalization ────────────────────────
// Cleans raw user input before it hits the backend:
//   1. Strips control characters and excessive whitespace
//   2. Caps length at 500 characters
//   3. Normalizes VT course codes (cs3114, cs-3114, CS3114 → CS 3114)
//   4. Title-cases common professor name patterns
function sanitizeInput(raw) {
  if (!raw) return "";
  // Strip non-printable control chars (except newline/tab which are valid in chat)
  let s = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Collapse runs of whitespace
  s = s.replace(/[ \t]+/g, " ").trim();
  // Cap length
  if (s.length > 500) s = s.slice(0, 500).trim();
  return s;
}

// Normalizes VT-specific shorthand:
//   "cs3114" or "cs-3114" or "CS3114" → "CS 3114"
//   "ece 2604" stays as-is
function normalizeCourseCode(s) {
  // Match 2-5 letters immediately followed (optional hyphen) by exactly 4 digits
  return s.replace(/\b([A-Za-z]{2,5})-?(\d{4})\b/g, (_, subj, num) => {
    return subj.toUpperCase() + " " + num;
  });
}

function normalizeInput(raw) {
  let s = sanitizeInput(raw);
  s = normalizeCourseCode(s);
  return s;
}

// ── Chart widget ──────────────────────────────────────────────────
function ChartWidget({ spec, darkMode }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !spec?.data?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const ctx = canvasRef.current.getContext("2d");
    const { chart_type, x_key, y_key, orientation, data } = spec;
    const dm = darkMode;
    const gridColor  = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const tickColor  = dm ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
    const tickFont   = { family: "'Plus Jakarta Sans', sans-serif", size: 11 };

    let config;

    if (chart_type === "bar") {
      const horizontal = orientation === "horizontal";
      config = {
        type: "bar",
        data: {
          labels: data.map(d => d[y_key]),
          datasets: [{
            data: data.map(d => d[x_key]),
            backgroundColor: "rgba(134,31,65,0.82)",
            borderColor: "#861F41",
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: horizontal ? "y" : "x",
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${x_key}: ${ctx.parsed[horizontal ? "x" : "y"]}`,
              },
            },
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: tickFont } },
            y: { grid: { color: gridColor }, ticks: { color: tickColor, font: tickFont } },
          },
        },
      };
    } else if (chart_type === "scatter") {
      config = {
        type: "scatter",
        data: {
          datasets: [{
            data: data.map(d => ({ x: d[x_key], y: d[y_key] })),
            backgroundColor: "rgba(134,31,65,0.75)",
            borderColor: "#861F41",
            pointRadius: 6,
            pointHoverRadius: 9,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const d = data[ctx.dataIndex];
                  const label = d["Instructor"] || d["Course"] || "";
                  return ` ${label}  (${x_key}: ${ctx.parsed.x}, ${y_key}: ${ctx.parsed.y})`;
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: x_key, color: tickColor, font: { size: 11 } },
              grid: { color: gridColor }, ticks: { color: tickColor, font: tickFont },
            },
            y: {
              title: { display: true, text: y_key, color: tickColor, font: { size: 11 } },
              grid: { color: gridColor }, ticks: { color: tickColor, font: tickFont },
            },
          },
        },
      };
    }

    if (config) chartRef.current = new Chart(ctx, config);
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [spec, darkMode]);

  if (!spec?.data?.length) return null;
  return (
    <div style={{
      marginTop: 14, borderRadius: 10, padding: "14px 16px",
      background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
      border: `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: "#861F41",
        textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 12,
      }}>{spec.title}</div>
      <canvas ref={canvasRef} />
      {spec.description && (
        <div style={{ fontSize: 11, marginTop: 8, color: darkMode ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)", fontStyle: "italic" }}>
          {spec.description}
        </div>
      )}
    </div>
  );
}

// ── Table widget ──────────────────────────────────────────────────
function TableWidget({ table, darkMode }) {
  if (!table?.rows?.length) return null;
  const dm = darkMode;
  const c = {
    border:    dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    headerBg:  dm ? "rgba(255,255,255,0.04)" : "#f0edf8",
    text:      dm ? "#f0edf3" : "#1a1210",
    sub:       dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.42)",
    rowAlt:    dm ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)",
  };

  const confidence = v => {
    if (v === "High")   return { color: "#16a34a", bg: "#dcfce7" };
    if (v === "Medium") return { color: "#b45309", bg: "#fef3c7" };
    return                      { color: "#c0392b", bg: "#fee2e2" };
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: "#861F41",
        textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 8,
      }}>{table.title}</div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${c.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <thead>
            <tr>
              {table.columns.map(col => (
                <th key={col} style={{
                  padding: "7px 10px", textAlign: "left",
                  fontSize: 10, fontWeight: 800, color: c.sub,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  background: c.headerBg,
                  borderBottom: `1px solid ${c.border}`,
                  whiteSpace: "nowrap",
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? c.rowAlt : "transparent", borderBottom: `1px solid ${c.border}` }}>
                {table.columns.map(col => {
                  const val = row[col];
                  const isConf = col === "Confidence Label" && val;
                  const conf = isConf ? confidence(val) : null;
                  return (
                    <td key={col} style={{ padding: "7px 10px", color: c.text, whiteSpace: "nowrap" }}>
                      {isConf ? (
                        <span style={{
                          background: conf.bg, color: conf.color,
                          borderRadius: 20, padding: "2px 8px",
                          fontSize: 11, fontWeight: 700,
                        }}>{val}</span>
                      ) : val != null ? String(val) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Bot message ───────────────────────────────────────────────────
function BotMessage({ msg, darkMode, question, onRetry }) {
  const dm = darkMode;
  const [chartsOpen, setChartsOpen] = useState(false);
  const [copied, setCopied]         = useState(false);

  const handleCopy = () => {
    const text = [
      question ? `Q: ${question}` : null,
      `A: ${msg.answer}`,
      ...(msg.tables || []).map(t => {
        if (!t?.rows?.length) return null;
        const header = t.columns.join(" | ");
        const rows   = t.rows.map(r => t.columns.map(c => r[c] ?? "—").join(" | "));
        return [t.title, header, ...rows].join("\n");
      }),
    ].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const btnBase = {
    background: "none",
    border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
    borderRadius: 20, padding: "3px 11px",
    color: dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: "all 0.15s",
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0, width: "100%" }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: "#861F41", display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 2, overflow: "hidden",
      }}>
        <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 20, height: 20 }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Answer text */}
        <div style={{
          background: msg.isError
            ? (dm ? "rgba(248,113,113,0.06)" : "rgba(220,38,38,0.04)")
            : (dm ? "rgba(255,255,255,0.04)" : "white"),
          border: `1px solid ${msg.isError
            ? (dm ? "rgba(248,113,113,0.20)" : "rgba(220,38,38,0.15)")
            : (dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)")}`,
          borderRadius: "4px 14px 14px 14px",
          padding: "14px 16px",
          color: dm ? "#f0edf3" : "#1a1210",
          fontSize: 14, lineHeight: 1.65, fontWeight: 450,
        }}>
          {msg.answer}
        </div>

        {/* Warnings */}
        {msg.warnings?.length > 0 && (
          <div style={{
            marginTop: 6, fontSize: 11, color: dm ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)",
            fontStyle: "italic", lineHeight: 1.5,
          }}>
            {msg.warnings[0]}
          </div>
        )}

        {/* Tables */}
        {msg.tables?.map((t, i) => <TableWidget key={i} table={t} darkMode={dm} />)}

        {/* Charts toggle */}
        {msg.charts?.filter(c => c.data?.length).length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => setChartsOpen(o => !o)}
              style={{
                background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 20, padding: "4px 14px",
                color: dm ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: "0.3px",
              }}
            >
              {chartsOpen ? "Hide" : "Show"} charts · {msg.charts.filter(c => c.data?.length).length}
            </button>
            {chartsOpen && msg.charts.map((chart, i) => (
              <ChartWidget key={i} spec={chart} darkMode={dm} />
            ))}
          </div>
        )}

        {/* Action row — copy + retry */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            onClick={handleCopy}
            style={{ ...btnBase, color: copied ? "#861F41" : btnBase.color, borderColor: copied ? "rgba(134,31,65,0.35)" : btnBase.borderColor }}
            onMouseEnter={e => { e.currentTarget.style.color = dm ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = copied ? "#861F41" : (dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)"); }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {(msg.isError || onRetry) && question && (
            <button
              onClick={() => onRetry(question)}
              style={btnBase}
              onMouseEnter={e => { e.currentTarget.style.color = "#861F41"; e.currentTarget.style.borderColor = "rgba(134,31,65,0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)"; e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"; }}
            >
              ↺ Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Session storage helpers ───────────────────────────────────────
const STORAGE_KEY = "darvis_chat_sessions";
const MAX_SESSIONS = 40;

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {}
}

function newSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Session list item ─────────────────────────────────────────────
function SessionItem({ session, active, onSelect, onDelete, c }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center",
        background: active ? c.active : hov ? c.hover : "transparent",
        borderLeft: `2px solid ${active ? "#861F41" : "transparent"}`,
        paddingRight: 10,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, padding: "9px 0 9px 14px", minWidth: 0, cursor: "pointer" }}>
        <div style={{
          fontSize: 12, fontWeight: active ? 700 : 500,
          color: active ? c.text : c.sub,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.35, marginBottom: 2,
        }}>{session.title}</div>
        <div style={{ fontSize: 10, color: c.faint, fontWeight: 600 }}>
          {relativeTime(session.createdAt)}
        </div>
      </div>
      {hov && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "3px 5px", marginLeft: 4, flexShrink: 0,
            color: c.faint, fontSize: 13, lineHeight: 1, borderRadius: 4,
            fontFamily: "sans-serif",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
          onMouseLeave={e => e.currentTarget.style.color = c.faint}
          title="Delete chat"
        >✕</button>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({ sessions, currentId, onSelect, onNew, onDelete, darkMode, open, onClose, isMobile }) {
  const dm = darkMode;
  const c = dm ? {
    bg:     "#111111",
    border: "rgba(255,255,255,0.07)",
    text:   "#f0edf3",
    sub:    "rgba(255,255,255,0.40)",
    faint:  "rgba(255,255,255,0.18)",
    hover:  "rgba(255,255,255,0.05)",
    active: "rgba(134,31,65,0.14)",
  } : {
    bg:     "#f0ede9",
    border: "rgba(0,0,0,0.08)",
    text:   "#1a1210",
    sub:    "rgba(0,0,0,0.50)",
    faint:  "rgba(0,0,0,0.28)",
    hover:  "rgba(0,0,0,0.04)",
    active: "rgba(134,31,65,0.07)",
  };

  const panelStyle = isMobile ? {
    position: "fixed",
    top: 60,
    left: 0,
    bottom: 0,
    width: 260,
    zIndex: 200,
    transform: open ? "translateX(0)" : "translateX(-100%)",
    transition: "transform 0.22s ease",
    boxShadow: open ? "6px 0 24px rgba(0,0,0,0.22)" : "none",
  } : {
    width: 240,
    flexShrink: 0,
    borderRight: `1px solid ${c.border}`,
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, top: 60,
            background: "rgba(0,0,0,0.40)", zIndex: 199,
          }}
        />
      )}

      <div style={{
        ...panelStyle,
        background: c.bg,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 14px 12px",
          borderBottom: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, color: "#861F41",
            letterSpacing: "1.5px", textTransform: "uppercase",
          }}>History</span>
          <button
            onClick={onNew}
            style={{
              background: "#861F41", color: "white", border: "none",
              borderRadius: 8, padding: "5px 12px",
              fontWeight: 700, fontSize: 11, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >+ New</button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {sessions.length === 0 ? (
            <div style={{
              padding: "28px 16px", textAlign: "center",
              color: c.faint, fontSize: 12, lineHeight: 1.6,
            }}>
              No past chats yet.<br />Ask something to get started.
            </div>
          ) : sessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === currentId}
              onSelect={() => onSelect(session)}
              onDelete={() => onDelete(session.id)}
              c={c}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main chatbot page ─────────────────────────────────────────────
export default function ChatbotPage({ darkMode, addSection, setPage, userProfile }) {
  const [sessions,          setSessions]         = useState(() => loadSessions());
  const [currentSessionId,  setCurrentSessionId] = useState(null);
  const [messages,          setMessages]         = useState([]);
  const [input,             setInput]            = useState("");
  const [loading,           setLoading]          = useState(false);
  const [serverDown,        setServerDown]       = useState(false);
  const [useRecency,        setUseRecency]       = useState(true);
  const [minStudents,       setMinStudents]      = useState(30);
  const [topN,              setTopN]             = useState(10);
  const [showSettings,      setShowSettings]     = useState(false);
  const [isMobile,          setIsMobile]         = useState(() => window.innerWidth < 768);
  const [sidebarOpen,       setSidebarOpen]      = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const dm = darkMode;

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Persist whenever sessions change
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const c = dm ? {
    bg:      "#0a0a0a",
    surface: "rgba(255,255,255,0.03)",
    border:  "rgba(255,255,255,0.08)",
    text:    "#f0edf3",
    sub:     "rgba(255,255,255,0.40)",
    faint:   "rgba(255,255,255,0.20)",
    inputBg: "rgba(255,255,255,0.05)",
  } : {
    bg:      "#fbf8f4",
    surface: "rgba(0,0,0,0.025)",
    border:  "rgba(0,0,0,0.09)",
    text:    "#1a1210",
    sub:     "rgba(0,0,0,0.50)",
    faint:   "rgba(0,0,0,0.28)",
    inputBg: "white",
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setInput("");
    setShowSettings(false);
    setSidebarOpen(false);
  };

  const selectSession = (session) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setInput("");
    setShowSettings(false);
    if (isMobile) setSidebarOpen(false);
  };

  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) startNewChat();
  };

  const send = useCallback(async (questionOverride) => {
    const question = normalizeInput(questionOverride || input);
    if (!question || loading) return;

    setInput("");
    setServerDown(false);

    const userMsg = { role: "user", content: question };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setLoading(true);

    // Create a new session on the first message
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = newSessionId();
      const title = question.length > 55 ? question.slice(0, 52) + "…" : question;
      setSessions(prev => [
        { id: sessionId, title, messages: withUser, createdAt: Date.now() },
        ...prev,
      ]);
      setCurrentSessionId(sessionId);
    } else {
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, messages: withUser } : s
      ));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    try {
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Handle schedule actions — add sections to scheduler then navigate
      if (data.schedule_actions && data.schedule_actions.length > 0 && addSection) {
        data.schedule_actions.forEach(sec => addSection(sec));
        setTimeout(() => setPage?.("schedule"), 1200);
      }

      const botMsg = { role: "bot", ...data };
      const final = [...withUser, botMsg];
      setMessages(final);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, messages: final } : s
      ));
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === "AbortError";
      const isNetwork = isTimeout || err.message === "Failed to fetch";
      setServerDown(isNetwork);
      const errMsg = {
        role: "bot",
        isError: true,
        answer: isTimeout
          ? "The request timed out. Render's free tier takes ~30 seconds to spin up after inactivity. Try again in a moment."
          : isNetwork
          ? "Couldn't reach the server. Check your connection or try again in ~30 seconds."
          : `Something went wrong on the server. Try again — if it keeps failing, the question may need rephrasing.`,
        tables: [], charts: [], warnings: [],
      };
      const final = [...withUser, errMsg];
      setMessages(final);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, messages: final } : s
      ));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, useRecency, minStudents, topN, messages, currentSessionId]);

  // Retry: re-fetches a response for an existing question and replaces the
  // bot message at botMsgIdx in-place — does NOT append a new user message.
  const retry = useCallback(async (question, botMsgIdx) => {
    if (loading) return;
    setLoading(true);
    setServerDown(false);

    // Replace the bot message with a temporary loading placeholder
    const withPlaceholder = messages.map((m, i) =>
      i === botMsgIdx ? { role: "bot", _retrying: true, answer: "", tables: [], charts: [], warnings: [] } : m
    );
    setMessages(withPlaceholder);

    const sessionId = currentSessionId;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    try {
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.schedule_actions && data.schedule_actions.length > 0 && addSection) {
        data.schedule_actions.forEach(sec => addSection(sec));
        setTimeout(() => setPage?.("schedule"), 1200);
      }
      const botMsg = { role: "bot", ...data };
      const final = messages.map((m, i) => i === botMsgIdx ? botMsg : m);
      setMessages(final);
      if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === "AbortError";
      const isNetwork = isTimeout || err.message === "Failed to fetch";
      setServerDown(isNetwork);
      const errMsg = {
        role: "bot", isError: true,
        answer: isTimeout
          ? "The request timed out. Render's free tier takes ~30 seconds to spin up after inactivity. Try again in a moment."
          : isNetwork
          ? "Couldn't reach the server. Check your connection or try again in ~30 seconds."
          : "Something went wrong on the server. Try again — if it keeps failing, the question may need rephrasing.",
        tables: [], charts: [], warnings: [],
      };
      const final = messages.map((m, i) => i === botMsgIdx ? errMsg : m);
      setMessages(final);
      if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, messages, currentSessionId, useRecency, minStudents, topN]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 60px)",
      background: c.bg,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <Sidebar
        sessions={sessions}
        currentId={currentSessionId}
        onSelect={selectSession}
        onNew={startNewChat}
        onDelete={deleteSession}
        darkMode={dm}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />

      {/* ── Chat area ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${c.border}`,
            background: c.bg, flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: c.sub, padding: 4, fontSize: 18, lineHeight: 1,
              }}
              aria-label="Open chat history"
            >☰</button>
            <span style={{
              fontSize: 11, fontWeight: 800, color: c.faint,
              letterSpacing: "1px", textTransform: "uppercase",
            }}>Darvis AI</span>
            <button
              onClick={startNewChat}
              style={{
                background: "none", border: `1px solid ${c.border}`,
                borderRadius: 7, padding: "5px 10px", cursor: "pointer",
                color: c.sub, fontSize: 11, fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >+ New</button>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────── */}
        {isEmpty && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: isMobile ? "40px 16px 160px" : "60px 24px 200px",
            overflowY: "auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 900, color: "#861F41",
              letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: 20,
            }}>Darvis AI</div>
            <h1 style={{
              margin: "0 0 12px", fontSize: isMobile ? "clamp(28px, 8vw, 38px)" : "clamp(28px, 4vw, 48px)",
              fontWeight: 900, color: c.text, letterSpacing: "-2px", textAlign: "center",
            }}>
              Ask about <span style={{ color: "#861F41" }}>any course.</span>
            </h1>
            <p style={{
              margin: "0 0 32px", fontSize: isMobile ? 14 : 15, color: c.sub,
              maxWidth: 440, textAlign: "center", lineHeight: 1.7,
            }}>
              Grade distributions, professor comparisons, and historical trends. All from real institutional data.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: isMobile ? "100%" : 600 }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 20, padding: "8px 14px",
                  color: c.sub, fontSize: isMobile ? 12 : 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.15s ease", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#861F41"; e.currentTarget.style.color = "#861F41"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.sub; }}
                >{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────── */}
        {!isEmpty && (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isMobile ? "16px 0 16px" : "32px 0 24px", width: "100%" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "0 12px" : "0 24px", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 24 }}>
              {messages.map((msg, i) => (
                msg.role === "user" ? (
                  <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{
                      background: "#861F41", color: "white",
                      borderRadius: "14px 4px 14px 14px",
                      padding: "12px 16px", fontSize: 14, lineHeight: 1.5,
                      maxWidth: "75%", fontWeight: 500,
                    }}>{msg.content}</div>
                  </div>
                ) : (
                  <BotMessage
                    key={i}
                    msg={msg}
                    darkMode={dm}
                    question={messages[i - 1]?.content}
                    onRetry={(q) => retry(q, i)}
                  />
                )
              ))}

              {/* Loading indicator */}
              {loading && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: "#861F41", display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 20, height: 20 }} />
                  </div>
                  <div style={{
                    background: dm ? "rgba(255,255,255,0.04)" : "white",
                    border: `1px solid ${c.border}`,
                    borderRadius: "4px 14px 14px 14px",
                    padding: "14px 18px",
                    display: "flex", gap: 5, alignItems: "center",
                  }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: "#861F41", opacity: 0.7,
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* ── Input bar ───────────────────────────────────────── */}
        <div style={{
          background: c.bg,
          borderTop: `1px solid ${c.border}`,
          padding: isMobile ? "10px 12px 16px" : "16px 24px 20px",
          flexShrink: 0,
        }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* Settings row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button
                onClick={() => setShowSettings(s => !s)}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: c.faint, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.5px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >{showSettings ? "▾" : "▸"} Settings</button>

              {serverDown && (
                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>
                  ⚠ Server unreachable — try again in ~30 seconds
                </span>
              )}
            </div>

            {showSettings && (
              <div style={{
                display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center",
                marginBottom: 12, padding: "12px 14px",
                background: c.surface, borderRadius: 10,
                border: `1px solid ${c.border}`,
                fontSize: 12, color: c.sub,
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={useRecency}
                    onChange={e => setUseRecency(e.target.checked)}
                    style={{ accentColor: "#861F41", width: 14, height: 14, cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>Weight recent terms</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Min students: {minStudents}</span>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={minStudents}
                    onChange={e => setMinStudents(Number(e.target.value))}
                    style={{ width: 80, accentColor: "#861F41" }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Results: {topN}</span>
                  <input
                    type="range" min="3" max="25" step="1"
                    value={topN}
                    onChange={e => setTopN(Number(e.target.value))}
                    style={{ width: 80, accentColor: "#861F41" }}
                  />
                </label>
              </div>
            )}

            {/* Input */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about a course, professor, or grade trend…"
                rows={1}
                style={{
                  flex: 1, padding: "12px 16px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 12, resize: "none",
                  background: c.inputBg, color: c.text,
                  fontSize: 14, fontWeight: 500,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  outline: "none", lineHeight: 1.5,
                  transition: "border-color 0.15s ease",
                  overflowY: "hidden",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                onBlur={e => e.currentTarget.style.borderColor = c.border}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: input.trim() && !loading ? "#861F41" : "rgba(134,31,65,0.2)",
                  border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
                </svg>
              </button>
            </div>

            <div style={{ fontSize: 11, color: c.faint, marginTop: 8, textAlign: "center" }}>
              Based on historical grade data only · Enter to send
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
