// Chatbot page — full AI chat experience powered by the FastAPI backend
import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/clerk-react";
import { Chart, registerables } from "chart.js";
import { DARVIS_CONFIG } from "../config.js";
import { API } from "../api.js";
import { MONO, SANS, ACCENT, COPPER, palette, glassCard, RADIUS, SHADOW, EASE } from "../theme.jsx";
import { SkeletonSidebar, useMinimumLoading } from "./skeletons.jsx";

Chart.register(...registerables);

const CHAT_API = DARVIS_CONFIG.chatApiUrl;

const SUGGESTED = [
  { label: "Build a schedule", prompt: "Build me a schedule where I don’t wake up before 11." },
  { label: "Compare professors", prompt: "Compare these professors for this course." },
  { label: "Find easier electives", prompt: "What are easier electives with strong grade outcomes?" },
  { label: "Check GPA impact", prompt: "Help me understand how this course might affect my GPA." },
  { label: "Plan around preferences", prompt: "Plan around my preferences for time of day, workload, and professor fit." },
  { label: "Explain a course", prompt: "Explain this course using grade and professor data." },
];

const THINKING_MESSAGES = [
  "Understanding your question…",
  "Checking available data…",
  "Looking through what Cyrus knows…",
  "Matching this to your planning needs…",
  "Building your response…",
];

// ── Input sanitization & NLP normalization ────────────────────────
function sanitizeInput(raw) {
  if (!raw) return "";
  let s = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/[ \t]+/g, " ").trim();
  if (s.length > 500) s = s.slice(0, 500).trim();
  return s;
}

function normalizeCourseCode(s) {
  return s.replace(/\b([A-Za-z]{2,5})-?(\d{4})\b/g, (_, subj, num) => {
    return subj.toUpperCase() + " " + num;
  });
}

function normalizeInput(raw) {
  let s = sanitizeInput(raw);
  s = normalizeCourseCode(s);
  return s;
}

function renderInlineMarkdown(text, keyPrefix = "md") {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function AssistantMarkdown({ text, darkMode }) {
  const p = palette(darkMode);
  const lines = String(text || "").split("\n");
  const nodes = [];
  let list = [];

  const flushList = () => {
    if (!list.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} style={{
        margin: "8px 0 12px 0",
        paddingLeft: 20,
        display: "grid",
        gap: 5,
      }}>
        {list.map((item, i) => (
          <li key={i} style={{ paddingLeft: 2 }}>
            {renderInlineMarkdown(item, `li-${nodes.length}-${i}`)}
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }

    flushList();

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const softHeading = !heading && line.length <= 72 && /:$/.test(line);

    if (heading || softHeading) {
      nodes.push(
        <div key={`h-${i}`} style={{
          margin: nodes.length ? "14px 0 6px" : "0 0 6px",
          color: p.text,
          fontWeight: 800,
          fontSize: 14,
          lineHeight: 1.35,
        }}>
          {renderInlineMarkdown((heading ? heading[1] : line).replace(/:$/, ""), `h-${i}`)}
        </div>
      );
      return;
    }

    nodes.push(
      <p key={`p-${i}`} style={{
        margin: nodes.length ? "8px 0 0" : 0,
        color: p.text,
        lineHeight: 1.7,
      }}>
        {renderInlineMarkdown(line, `p-${i}`)}
      </p>
    );
  });

  flushList();
  return <>{nodes}</>;
}

// ── Chart widget ──────────────────────────────────────────────────
function ChartWidget({ spec, darkMode }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const dm = darkMode;

  useEffect(() => {
    if (!canvasRef.current || !spec?.data?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const ctx = canvasRef.current.getContext("2d");
    const { chart_type, x_key, y_key, orientation, data } = spec;
    const gridColor  = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const tickColor  = dm ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
    const tickFont   = { family: SANS, size: 11 };

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
            borderColor: ACCENT,
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
            borderColor: ACCENT,
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
      ...glassCard(dm),
      marginTop: 14, borderRadius: RADIUS.md, padding: "14px 16px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: ACCENT,
        textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 12,
        fontFamily: MONO,
      }}>{spec.title}</div>
      <canvas ref={canvasRef} />
      {spec.description && (
        <div style={{
          fontSize: 11, marginTop: 8,
          color: dm ? "rgba(244,239,233,0.38)" : "rgba(26,18,15,0.45)",
          fontStyle: "italic", fontFamily: SANS,
        }}>
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
  const p = palette(dm);
  const c = {
    border:   p.line,
    headerBg: dm ? "rgba(255,255,255,0.04)" : "#f0edf8",
    text:     p.text,
    sub:      p.textSub,
    rowAlt:   dm ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)",
  };

  const confidence = v => {
    if (v === "High")   return { color: "#16a34a", bg: "#dcfce7" };
    if (v === "Medium") return { color: "#b45309", bg: "#fef3c7" };
    return                      { color: "#c0392b", bg: "#fee2e2" };
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: ACCENT,
        textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 8,
        fontFamily: MONO,
      }}>{table.title}</div>
      <div style={{ overflowX: "auto", borderRadius: RADIUS.sm, border: `1px solid ${c.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: SANS }}>
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
  const p = palette(dm);
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
    border: `1px solid ${p.line}`,
    borderRadius: RADIUS.pill, padding: "3px 11px",
    color: p.textMute,
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: SANS,
    transition: "all 0.15s",
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0, width: "100%" }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: dm ? "#1f1f1f" : "#f1eee9",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 2, overflow: "hidden",
        border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)"}`,
      }}>
        <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Cyrus" style={{ width: 18, height: 18 }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Answer text */}
        <div style={{
          ...(msg.isError ? {
            background: dm ? "rgba(248,113,113,0.06)" : "rgba(220,38,38,0.04)",
            border: `1px solid ${dm ? "rgba(248,113,113,0.20)" : "rgba(220,38,38,0.15)"}`,
          } : {
            background: "transparent",
            border: "1px solid transparent",
          }),
          borderRadius: RADIUS.md,
          padding: "2px 0 0",
          color: p.text,
          fontSize: 15, lineHeight: 1.72, fontWeight: 450,
          boxShadow: "none",
        }}>
          <AssistantMarkdown text={msg.answer} darkMode={dm} />
        </div>

        {/* Warnings */}
        {msg.warnings?.length > 0 && (
          <div style={{
            marginTop: 6, fontSize: 11, color: p.textMute,
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
                background: "none", border: `1px solid ${p.line}`,
                borderRadius: RADIUS.pill, padding: "4px 14px",
                color: p.textSub,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: SANS,
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
        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
          <button
            onClick={handleCopy}
            style={{ ...btnBase, color: copied ? ACCENT : btnBase.color, borderColor: copied ? "rgba(134,31,65,0.35)" : p.line }}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; }}
            onMouseLeave={e => { e.currentTarget.style.color = copied ? ACCENT : p.textMute; }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {(msg.isError || onRetry) && question && (
            <button
              onClick={() => onRetry(question)}
              style={btnBase}
              onMouseEnter={e => { e.currentTarget.style.color = ACCENT; e.currentTarget.style.borderColor = "rgba(134,31,65,0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = p.textMute; e.currentTarget.style.borderColor = p.line; }}
            >
              ↺ Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator({ darkMode, status }) {
  const dm = darkMode;
  const p = palette(dm);

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minHeight: 58 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: dm ? "#1f1f1f" : "#f1eee9",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)"}`,
      }}>
        <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Cyrus" style={{ width: 18, height: 18 }} />
      </div>
      <div style={{
        padding: "3px 0 0",
        minWidth: 180,
        display: "flex",
        gap: 10,
        alignItems: "center",
        color: p.textSub,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {[0,1,2].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: dm ? "rgba(255,255,255,0.62)" : "rgba(26,18,15,0.46)",
              animation: `chatPulse 1.15s ease-in-out ${i * 0.18}s infinite`,
            }} />
          ))}
        </div>
        <div aria-live="polite" style={{ fontSize: 15, color: p.textSub, fontWeight: 500, lineHeight: 1.4 }}>
          {status}
        </div>
      </div>
    </div>
  );
}

// ── Session storage helpers ───────────────────────────────────────
const STORAGE_KEY  = "darvis_chat_sessions";
const PROJECTS_KEY = "darvis_chat_projects";
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

function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {}
}

function newSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newProjectId() {
  return "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
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
function SessionItem({ session, active, onSelect, onDelete, onMove, projects, c, indent }) {
  const [hov, setHov]       = useState(false);
  const [moveDd, setMoveDd] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setMoveDd(false); }}
      style={{
        display: "flex", alignItems: "center", position: "relative",
        background: active ? c.active : hov ? c.hover : "transparent",
        borderRadius: 8,
        margin: "1px 8px",
        paddingRight: 6,
        transition: "background 0.12s",
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, padding: `8px 0 8px ${indent ? 20 : 10}px`, minWidth: 0, cursor: "pointer" }}>
        <div style={{
          fontSize: 13, fontWeight: active ? 600 : 500,
          color: active ? c.text : c.sub,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.35,
        }}>{session.title}</div>
        <div style={{ fontSize: 10.5, color: c.faint, fontWeight: 500, marginTop: 1 }}>
          {relativeTime(session.createdAt)}
        </div>
      </div>

      {hov && (
        <div style={{ display: "flex", gap: 1, flexShrink: 0, alignItems: "center" }}>
          {/* Move to project */}
          <div style={{ position: "relative" }}>
            <button
              onClick={e => { e.stopPropagation(); setMoveDd(d => !d); }}
              title="Move to project"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "3px 5px", color: c.faint, lineHeight: 1, borderRadius: 4,
                display: "flex", alignItems: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.color = c.text}
              onMouseLeave={e => e.currentTarget.style.color = c.faint}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181L15.546 13H2.454l-.257-7.819A2 2 0 0 1 4.19 3h1.668l.714-1.428A1 1 0 0 1 7.465 1h1.07a1 1 0 0 1 .894.553L9.828 3zm-2.95.702.681-1.29a.5.5 0 0 1 .447-.276h.988a.5.5 0 0 1 .447.276l.68 1.29H6.878z"/>
              </svg>
            </button>
            {moveDd && (
              <div style={{
                position: "absolute", right: 0, top: "100%", zIndex: 400,
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: RADIUS.sm, padding: "4px 0", minWidth: 148,
                boxShadow: SHADOW.lg,
              }}>
                {projects.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 11, color: c.faint }}>
                    No projects yet
                  </div>
                )}
                {projects.map(p => (
                  <div
                    key={p.id}
                    onClick={e => { e.stopPropagation(); onMove(p.id); setMoveDd(false); setHov(false); }}
                    style={{
                      padding: "7px 12px", fontSize: 12, cursor: "pointer",
                      color: session.projectId === p.id ? ACCENT : c.text,
                      fontWeight: session.projectId === p.id ? 700 : 500,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = c.hover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >{p.name}</div>
                ))}
                {session.projectId && (
                  <>
                    <div style={{ height: 1, background: c.border, margin: "3px 0" }} />
                    <div
                      onClick={e => { e.stopPropagation(); onMove(null); setMoveDd(false); setHov(false); }}
                      style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: c.faint }}
                      onMouseEnter={e => e.currentTarget.style.background = c.hover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >Remove from project</div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "3px 5px", color: c.faint, fontSize: 13, lineHeight: 1, borderRadius: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
            onMouseLeave={e => e.currentTarget.style.color = c.faint}
            title="Delete chat"
          >✕</button>
        </div>
      )}
    </div>
  );
}

// ── Project group ─────────────────────────────────────────────────
function ProjectGroup({ project, sessions, currentId, onSelectSession, onDeleteSession, onMoveSession, onDeleteProject, onRenameProject, projects, c }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hov, setHov]             = useState(false);
  const [renaming, setRenaming]   = useState(false);
  const [renameVal, setRenameVal] = useState(project.name);

  return (
    <div>
      {/* Header */}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center",
          padding: "5px 8px 5px 10px",
          background: hov ? c.hover : "transparent",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          onClick={() => setCollapsed(v => !v)}
          style={{ fontSize: 8, color: c.faint, marginRight: 5, flexShrink: 0, width: 10 }}
        >{collapsed ? "▶" : "▼"}</span>

        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={() => { onRenameProject(project.id, renameVal || project.name); setRenaming(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { onRenameProject(project.id, renameVal || project.name); setRenaming(false); }
              if (e.key === "Escape") { setRenameVal(project.name); setRenaming(false); }
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, background: "none", border: "none",
              borderBottom: `1px solid ${c.border}`,
              color: c.text, fontSize: 11, fontWeight: 700,
              outline: "none", padding: "1px 2px",
              fontFamily: SANS,
            }}
          />
        ) : (
          <span
            onClick={() => setCollapsed(v => !v)}
            onDoubleClick={e => { e.stopPropagation(); setRenaming(true); }}
            style={{
              flex: 1, fontSize: 11, fontWeight: 700,
              color: c.text, letterSpacing: "0.2px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >{project.name}</span>
        )}

        <span style={{ fontSize: 10, color: c.faint, marginLeft: 4, flexShrink: 0 }}>
          {sessions.length}
        </span>

        {hov && !renaming && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteProject(project.id); }}
            title="Delete project"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "2px 4px", marginLeft: 4, color: c.faint,
              fontSize: 11, lineHeight: 1, borderRadius: 3, flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
            onMouseLeave={e => e.currentTarget.style.color = c.faint}
          >✕</button>
        )}
      </div>

      {/* Sessions inside project */}
      {!collapsed && sessions.map(session => (
        <SessionItem
          key={session.id}
          session={session}
          active={session.id === currentId}
          onSelect={() => onSelectSession(session)}
          onDelete={() => onDeleteSession(session.id)}
          onMove={projectId => onMoveSession(session.id, projectId)}
          projects={projects}
          c={c}
          indent
        />
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({ sessions, projects, currentId, onSelect, onNew, onDelete, onMoveSession, onCreateProject, onDeleteProject, onRenameProject, darkMode, open, onClose, isMobile, collapsed, historyLoading }) {
  const dm = darkMode;
  const p = palette(dm);
  const c = {
    bg:     dm ? "#050505" : p.bgRaised,
    border: dm ? "rgba(255,255,255,0.10)" : p.line,
    text:   dm ? "rgba(255,255,255,0.92)" : p.text,
    sub:    dm ? "rgba(255,255,255,0.76)" : p.textSub,
    faint:  dm ? "rgba(255,255,255,0.45)" : p.textMute,
    hover:  dm ? "rgba(255,255,255,0.07)" : p.cardHover,
    active: dm ? "rgba(255,255,255,0.11)" : "rgba(26,18,15,0.08)",
  };

  const [addingProj, setAddingProj]   = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const showHistoryLoading = useMinimumLoading(historyLoading);

  const panelStyle = isMobile ? {
    position: "fixed",
    top: 60,
    right: 0,
    bottom: 0,
    width: 280,
    zIndex: 200,
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: `transform 0.22s ${EASE}`,
    boxShadow: open ? "-8px 0 24px rgba(0,0,0,0.30)" : "none",
  } : {
    width: collapsed ? 0 : 260,
    flexShrink: 0,
    borderLeft: `1px solid ${c.border}`,
    overflow: "hidden",
    transition: "width 0.2s ease",
  };

  // Group sessions by project
  const byProject = {};
  const unorganized = [];
  for (const s of sessions) {
    if (s.projectId) {
      if (!byProject[s.projectId]) byProject[s.projectId] = [];
      byProject[s.projectId].push(s);
    } else {
      unorganized.push(s);
    }
  }

  const handleCreateProject = () => {
    const name = newProjName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjName("");
    setAddingProj(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, top: 60, background: "rgba(0,0,0,0.40)", zIndex: 199 }}
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
          padding: "14px 12px 10px",
          borderBottom: `1px solid ${c.border}`,
          display: "grid", gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ color: c.text, fontSize: 17, fontWeight: 750, letterSpacing: 0 }}>
              Cyrus
            </div>
            <button
              onClick={onNew}
              style={{
                background: "transparent",
                color: c.text,
                border: `1px solid ${c.border}`,
                borderRadius: 9,
                padding: "7px 10px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: SANS,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              New chat
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => { setAddingProj(v => !v); setNewProjName(""); }}
              title="New project"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderRadius: 8,
                padding: "8px 8px",
                cursor: "pointer",
                color: c.sub,
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: SANS,
              }}
              onMouseEnter={e => e.currentTarget.style.background = c.hover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.2a2 2 0 0 1-1.6-.8L10.4 4A2 2 0 0 0 8.8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
              </svg>
              New project
            </button>
          </div>
        </div>

        {/* New project input */}
        {addingProj && (
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${c.border}`,
            display: "flex", gap: 6,
          }}>
            <input
              autoFocus
              value={newProjName}
              onChange={e => setNewProjName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleCreateProject();
                if (e.key === "Escape") { setNewProjName(""); setAddingProj(false); }
              }}
              placeholder="Project name…"
              style={{
                flex: 1, background: c.hover,
                border: `1px solid ${c.border}`, borderRadius: RADIUS.xs,
                padding: "5px 8px", fontSize: 12, color: c.text,
                outline: "none", fontFamily: SANS,
              }}
              onFocus={e => e.currentTarget.style.borderColor = ACCENT}
              onBlur={e => e.currentTarget.style.borderColor = c.border}
            />
            <button
              onClick={handleCreateProject}
              disabled={!newProjName.trim()}
              style={{
                background: newProjName.trim() ? ACCENT : "rgba(134,31,65,0.2)",
                color: "white", border: "none", borderRadius: RADIUS.xs,
                padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: SANS,
              }}
            >Create</button>
          </div>
        )}

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
          {showHistoryLoading ? (
            <SkeletonSidebar darkMode={dm} rows={8} style={{ borderRight: "none", padding: "4px 12px 12px" }} />
          ) : sessions.length === 0 ? (
            <div style={{
              padding: "28px 16px", textAlign: "center",
              color: c.faint, fontSize: 12, lineHeight: 1.6, fontFamily: SANS,
            }}>
              No past chats yet.<br />Ask something to get started.
            </div>
          ) : (
            <>
              {/* Projects */}
              {projects.map(project => (
                <ProjectGroup
                  key={project.id}
                  project={project}
                  sessions={byProject[project.id] || []}
                  currentId={currentId}
                  onSelectSession={onSelect}
                  onDeleteSession={onDelete}
                  onMoveSession={onMoveSession}
                  onDeleteProject={onDeleteProject}
                  onRenameProject={onRenameProject}
                  projects={projects}
                  c={c}
                />
              ))}

              {/* Unorganized sessions */}
              {unorganized.length > 0 && (
                <>
                  <div style={{
                    padding: "12px 14px 5px",
                    fontSize: 13, fontWeight: 700, color: c.text,
                  }}>{projects.length > 0 ? "Other" : "Chats"}</div>
                  {unorganized.map(session => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      active={session.id === currentId}
                      onSelect={() => onSelect(session)}
                      onDelete={() => onDelete(session.id)}
                      onMove={projectId => onMoveSession(session.id, projectId)}
                      projects={projects}
                      c={c}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main chatbot page ─────────────────────────────────────────────
export default function ChatbotPage({ darkMode, addSection, setPage, userProfile }) {
  const { user } = useUser();
  const [sessions,          setSessions]         = useState(() => loadSessions());
  const [projects,          setProjects]         = useState(() => loadProjects());
  const [currentSessionId,  setCurrentSessionId] = useState(null);
  const [messages,          setMessages]         = useState([]);
  const [input,             setInput]            = useState("");
  const [loading,           setLoading]          = useState(false);
  const [serverDown,        setServerDown]       = useState(false);
  const [historyLoading,    setHistoryLoading]   = useState(false);
  const [useRecency,        setUseRecency]       = useState(true);
  const [minStudents,       setMinStudents]      = useState(30);
  const [topN,              setTopN]             = useState(10);
  const [showSettings,      setShowSettings]     = useState(false);
  const [isMobile,          setIsMobile]         = useState(() => window.innerWidth < 768);
  const [sidebarOpen,       setSidebarOpen]      = useState(false);
  const [sidebarVisible,    setSidebarVisible]   = useState(true);
  const [attachments,       setAttachments]      = useState([]);
  const [thinkingIndex,     setThinkingIndex]    = useState(0);
  const bottomRef      = useRef(null);
  const inputRef       = useRef(null);
  const fileRef        = useRef(null);
  const convSaveTimers = useRef({});
  const dm = darkMode;
  const p = palette(dm);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load conversations from Supabase on sign-in, merge with localStorage (remote wins)
  useEffect(() => {
    if (!user?.id) return;
    setHistoryLoading(true);
    API.getConversations(user.id).then(rows => {
      if (!rows.length) return;
      setSessions(prev => {
        const localMap = Object.fromEntries(prev.map(s => [s.id, s]));
        rows.forEach(r => {
          const local = localMap[r.session_id];
          const remoteNewer = !local || new Date(r.updated_at) > new Date(local._updatedAt || 0);
          if (remoteNewer) {
            localMap[r.session_id] = {
              id: r.session_id, title: r.title,
              messages: Array.isArray(r.messages) ? r.messages : [],
              createdAt: new Date(r.created_at).getTime(),
              projectId: null, _updatedAt: r.updated_at,
            };
          }
        });
        return Object.values(localMap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      });
    }).catch(() => {}).finally(() => setHistoryLoading(false));
  }, [user?.id]);

  // Debounce-save any session with messages to Supabase
  useEffect(() => {
    if (!user?.id) return;
    sessions.forEach(session => {
      if (!session.messages?.length) return;
      clearTimeout(convSaveTimers.current[session.id]);
      convSaveTimers.current[session.id] = setTimeout(() => {
        API.saveConversation(user.id, session).catch(() => {});
      }, 800);
    });
  }, [sessions, user?.id]);

  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => { saveProjects(projects); }, [projects]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setThinkingIndex(0);
      return;
    }
    const id = setInterval(() => {
      setThinkingIndex(i => (i + 1) % THINKING_MESSAGES.length);
    }, 1700);
    return () => clearInterval(id);
  }, [loading]);

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setInput("");
    setShowSettings(false);
    setSidebarOpen(false);
    setAttachments([]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, {
          name: file.name, type: file.type,
          dataUrl: ev.target.result, size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
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
    if (user?.id) API.deleteConversation(user.id, id).catch(() => {});
  };

  const createProject = (name) => {
    setProjects(prev => [...prev, { id: newProjectId(), name, createdAt: Date.now() }]);
  };

  const deleteProject = (id) => {
    setProjects(prev => prev.filter(proj => proj.id !== id));
    setSessions(prev => prev.map(s => s.projectId === id ? { ...s, projectId: null } : s));
  };

  const renameProject = (id, name) => {
    setProjects(prev => prev.map(proj => proj.id === id ? { ...proj, name } : proj));
  };

  const moveSession = (sessionId, projectId) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, projectId: projectId || null } : s));
  };

  const send = useCallback(async (questionOverride) => {
    const baseText = questionOverride || input;
    const attachSuffix = attachments.length > 0
      ? `\n\n[Attached: ${attachments.map(a => a.name).join(", ")}]`
      : "";
    const question = normalizeInput(baseText + attachSuffix) || normalizeInput(baseText);
    if (!question || loading) return;

    setInput("");
    setAttachments([]);
    setServerDown(false);

    const userMsg = { role: "user", content: question, attachments: attachments.length > 0 ? [...attachments] : undefined };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setLoading(true);

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = newSessionId();
      const title = question.length > 55 ? question.slice(0, 52) + "…" : question;
      setSessions(prev => [
        { id: sessionId, title, messages: withUser, createdAt: Date.now(), projectId: null },
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
      const history = messages
        .filter(m => !m.isError && (m.role === "user" || m.role === "bot"))
        .slice(-10)
        .map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content || m.answer || "" }))
        .filter(m => m.content);

      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null, history }),
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
  }, [input, attachments, loading, useRecency, minStudents, topN, messages, currentSessionId, addSection, setPage, userProfile]);

  const retry = useCallback(async (question, botMsgIdx) => {
    if (loading) return;
    setLoading(true);
    setServerDown(false);

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
        body: JSON.stringify({ question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null, history: messages.slice(0, botMsgIdx).filter(m => !m.isError && (m.role === "user" || m.role === "bot")).slice(-10).map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content || m.answer || "" })).filter(m => m.content) }),
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
  }, [loading, messages, currentSessionId, useRecency, minStudents, topN, addSection, setPage, userProfile]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const isEmpty = messages.length === 0;
  const canSend = (input.trim() || attachments.length > 0) && !loading;

  const PromptIcon = ({ type }) => {
    const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
    if (type === 0) return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    if (type === 1) return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6M19 8v6"/></svg>;
    if (type === 2) return <svg {...common}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>;
    if (type === 3) return <svg {...common}><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-7"/></svg>;
    if (type === 4) return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    return <svg {...common}><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/></svg>;
  };

  const renderAttachmentPreviews = (compact = false) => attachments.length > 0 && (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8, marginBottom: compact ? 12 : 10,
      padding: compact ? "0 8px" : "10px 12px",
      background: compact ? "transparent" : p.card,
      borderRadius: RADIUS.sm,
      border: compact ? "none" : `1px solid ${p.line}`,
    }}>
      {attachments.map((att, i) => (
        <div key={i} style={{
          position: "relative", display: "flex", alignItems: "center", gap: 6,
          background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
          border: `1px solid ${p.line}`,
          borderRadius: RADIUS.xs, padding: att.type.startsWith("image/") ? 4 : "6px 10px",
          maxWidth: compact ? 180 : 200,
        }}>
          {att.type.startsWith("image/") ? (
            <img src={att.dataUrl} alt={att.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, color: p.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: compact ? 112 : 130 }}>{att.name}</span>
            </>
          )}
          <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{
            position: "absolute", top: -6, right: -6,
            width: 16, height: 16, borderRadius: "50%",
            background: ACCENT, color: "white", border: "none",
            cursor: "pointer", fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>✕</button>
        </div>
      ))}
    </div>
  );

  const renderComposer = ({ hero = false } = {}) => (
    <>
      {renderAttachmentPreviews(hero)}
      <div style={{
        display: "flex",
        gap: hero ? 9 : 7,
        alignItems: "flex-end",
        minHeight: hero ? (isMobile ? 56 : 62) : 54,
        padding: hero ? (isMobile ? "7px 8px" : "8px 10px") : "7px 8px",
        borderRadius: hero ? 30 : 26,
        background: dm ? "#212121" : "rgba(255,255,255,0.88)",
        border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(26,18,15,0.11)"}`,
        boxShadow: hero
          ? (dm ? "0 10px 34px rgba(0,0,0,0.28)" : "0 18px 45px rgba(26,18,15,0.10)")
          : (dm ? "0 8px 26px rgba(0,0,0,0.22)" : "0 12px 28px rgba(26,18,15,0.07)"),
        transition: `border-color 0.16s ${EASE}, box-shadow 0.16s ${EASE}`,
      }}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.doc,.docx"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          title="Attach file"
          aria-label="Attach file"
          style={{
            width: hero ? (isMobile ? 42 : 46) : 38,
            height: hero ? (isMobile ? 42 : 46) : 38,
            borderRadius: "50%",
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: attachments.length > 0 ? ACCENT : (dm ? "rgba(255,255,255,0.80)" : p.textSub),
            transition: `all 0.15s ${EASE}`,
            position: "relative",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.color = attachments.length > 0 ? ACCENT : (dm ? "rgba(255,255,255,0.80)" : p.textSub); }}
        >
          <svg width={hero ? 25 : 18} height={hero ? 25 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={hero ? 1.7 : 2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          {attachments.length > 0 && (
            <span style={{
              position: "absolute", top: hero ? 4 : -5, right: hero ? 4 : -5,
              background: ACCENT, color: "white",
              borderRadius: "50%", width: 16, height: 16,
              fontSize: 9, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{attachments.length}</span>
          )}
        </button>

        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Cyrus anything about your semester…"
          rows={1}
          style={{
            flex: 1,
            padding: hero ? (isMobile ? "10px 2px" : "12px 2px") : "9px 6px",
            background: "transparent",
            border: "none",
            borderRadius: RADIUS.sm,
            resize: "none",
            color: p.text,
            fontSize: hero ? (isMobile ? 15 : 16) : 15,
            fontWeight: 500,
            fontFamily: SANS,
            outline: "none",
            lineHeight: 1.45,
            overflowY: "hidden",
            minHeight: hero ? (isMobile ? 40 : 42) : 38,
            maxHeight: 140,
          }}
          onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
        />

        <button
          onClick={() => send()}
          disabled={!canSend}
          aria-label="Send message"
          style={{
            width: hero ? (isMobile ? 42 : 46) : 38,
            height: hero ? (isMobile ? 42 : 46) : 38,
            borderRadius: "50%",
            flexShrink: 0,
            background: canSend ? "#19c37d" : (dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)"),
            color: canSend ? "white" : p.textMute,
            border: "none",
            cursor: canSend ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: `all 0.15s ${EASE}`,
            boxShadow: canSend ? "0 8px 20px rgba(25,195,125,0.22)" : "none",
          }}
        >
          <svg width={hero ? 21 : 18} height={hero ? 21 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
          </svg>
        </button>
      </div>
    </>
  );

  return (
    <div style={{
      display: "flex",
      height: "100%",
      background: dm ? "#000" : "transparent",
      fontFamily: SANS,
      overflow: "hidden",
    }}>

      {/* ── Chat area ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${p.line}`,
            background: dm ? "#000" : p.bg, flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: p.textSub, padding: 4, fontSize: 18, lineHeight: 1,
              }}
              aria-label="Toggle chat history"
            >☰</button>
            <span style={{
              fontSize: 11, fontWeight: 800, color: p.textMute,
              letterSpacing: "1px", textTransform: "uppercase", fontFamily: MONO,
            }}>Cyrus</span>
            <button
              onClick={startNewChat}
              style={{
                background: "none", border: `1px solid ${p.line}`,
                borderRadius: RADIUS.xs, padding: "5px 10px", cursor: "pointer",
                color: p.textSub, fontSize: 11, fontWeight: 700,
                fontFamily: SANS,
              }}
            >+ New</button>
          </div>
        )}

        {/* ── Desktop header with history toggle ─────────────── */}
        {!isMobile && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "10px 18px", borderBottom: `1px solid ${dm ? "rgba(255,255,255,0.08)" : p.line}`,
            flexShrink: 0, background: dm ? "#000" : p.bg,
          }}>
            <button
              onClick={() => setSidebarVisible(v => !v)}
              title={sidebarVisible ? "Hide history" : "Show history"}
              style={{
                background: "transparent", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : p.line}`,
                borderRadius: RADIUS.sm, padding: "5px 12px", cursor: "pointer",
                color: p.textSub, fontSize: 11, fontWeight: 600,
                fontFamily: SANS,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <rect x="1" y="1" width="12" height="12" rx="2"/><line x1="9" y1="1" x2="9" y2="13"/>
              </svg>
              {sidebarVisible ? "Hide sidebar" : "Show sidebar"}
            </button>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────── */}
        {isEmpty && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: isMobile ? "36px 16px 92px" : "40px 28px 112px",
            overflowY: "auto",
            background: dm ? "#000" : "transparent",
          }}>
            <h1 style={{
              margin: isMobile ? "0 0 28px" : "0 0 44px",
              fontSize: isMobile ? 32 : 42,
              fontWeight: 500, color: p.text, letterSpacing: 0, textAlign: "center",
              fontFamily: SANS,
            }}>
              Where should we begin?
            </h1>

            <div style={{
              width: "100%",
              maxWidth: 760,
            }}>
              {renderComposer({ hero: true })}
            </div>

            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: isMobile ? 8 : 12,
              justifyContent: "center",
              width: "100%",
              maxWidth: 760,
              marginTop: isMobile ? 22 : 32,
            }}>
              {SUGGESTED.map((item, i) => (
                <button key={item.label} onClick={() => send(item.prompt)} disabled={loading} style={{
                  background: "transparent",
                  border: `1px solid ${dm ? "rgba(255,255,255,0.15)" : p.line}`,
                  borderRadius: RADIUS.pill,
                  padding: isMobile ? "9px 13px" : "10px 17px",
                  color: p.textSub,
                  fontSize: isMobile ? 13 : 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: SANS,
                  transition: `all 0.15s ${EASE}`,
                  lineHeight: 1.2,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  minHeight: isMobile ? 40 : 44,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.30)" : "rgba(26,18,15,0.24)";
                  e.currentTarget.style.color = p.text;
                  e.currentTarget.style.background = dm ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.55)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.15)" : p.line;
                  e.currentTarget.style.color = p.textSub;
                  e.currentTarget.style.background = "transparent";
                }}
                >
                  <PromptIcon type={i} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div style={{
              marginTop: 20,
              color: p.textMute,
              fontSize: 12,
              lineHeight: 1.5,
              textAlign: "center",
              maxWidth: 600,
            }}>
              Cyrus can make mistakes. Verify important academic information.
            </div>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────── */}
        {!isEmpty && (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isMobile ? "16px 0 16px" : "32px 0 24px", width: "100%", scrollBehavior: "smooth", background: dm ? "#000" : "transparent" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "0 14px" : "0 28px", display: "flex", flexDirection: "column", gap: isMobile ? 18 : 28 }}>
              {messages.map((msg, i) => (
                msg.role === "user" ? (
                  <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: isMobile ? "88%" : "72%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      {msg.attachments?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                          {msg.attachments.map((att, ai) => (
                            att.type.startsWith("image/") ? (
                              <img key={ai} src={att.dataUrl} alt={att.name}
                                style={{ maxWidth: 200, maxHeight: 140, borderRadius: 10, objectFit: "cover", border: "2px solid rgba(255,255,255,0.25)" }} />
                            ) : (
                              <div key={ai} style={{
                                background: "rgba(134,31,65,0.85)", color: "white",
                                borderRadius: 10, padding: "8px 14px",
                                fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
                              }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                </svg>
                                {att.name}
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      <div style={{
                        background: dm ? "#2f2f2f" : "rgba(26,18,15,0.08)",
                        color: p.text,
                        borderRadius: "18px",
                        padding: "10px 14px", fontSize: 15, lineHeight: 1.55,
                        fontWeight: 500, whiteSpace: "pre-wrap",
                        boxShadow: "none",
                      }}>{msg.content}</div>
                    </div>
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
                <ThinkingIndicator darkMode={dm} status={THINKING_MESSAGES[thinkingIndex]} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* ── Input bar ───────────────────────────────────────── */}
        {!isEmpty && (
        <div style={{
          background: dm ? "rgba(0,0,0,0.92)" : "rgba(250,246,240,0.88)",
          backdropFilter: "blur(22px) saturate(150%)",
          WebkitBackdropFilter: "blur(22px) saturate(150%)",
          borderTop: `1px solid ${dm ? "rgba(255,255,255,0.08)" : p.line}`,
          padding: isMobile ? "10px 12px 78px" : "14px 24px 18px",
          flexShrink: 0,
          position: "relative",
          zIndex: 5,
        }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* Settings row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button
                onClick={() => setShowSettings(s => !s)}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: p.textMute, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.5px",
                  fontFamily: SANS,
                }}
              >{showSettings ? "▾" : "▸"} Response controls</button>

              {serverDown && (
                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>
                  Server unreachable. Try again in about 30 seconds.
                </span>
              )}
            </div>

            {showSettings && (
              <div style={{
                display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center",
                marginBottom: 12, padding: "12px 14px",
                background: p.card, borderRadius: RADIUS.sm,
                border: `1px solid ${p.line}`,
                fontSize: 12, color: p.textSub,
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={useRecency}
                    onChange={e => setUseRecency(e.target.checked)}
                    style={{ accentColor: ACCENT, width: 14, height: 14, cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>Weight recent terms</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Min students: {minStudents}</span>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={minStudents}
                    onChange={e => setMinStudents(Number(e.target.value))}
                    style={{ width: 80, accentColor: ACCENT }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Results: {topN}</span>
                  <input
                    type="range" min="3" max="25" step="1"
                    value={topN}
                    onChange={e => setTopN(Number(e.target.value))}
                    style={{ width: 80, accentColor: ACCENT }}
                  />
                </label>
              </div>
            )}

            {renderComposer()}

            <div style={{ fontSize: 11, color: p.textMute, marginTop: 8, textAlign: "center", fontFamily: SANS, lineHeight: 1.45 }}>
              Cyrus can make mistakes. Verify important academic information.
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── Sidebar (right side) ────────────────────────────────── */}
      {(!isMobile || sidebarOpen) && (
        <Sidebar
          sessions={sessions}
          projects={projects}
          currentId={currentSessionId}
          onSelect={selectSession}
          onNew={startNewChat}
          onDelete={deleteSession}
          onMoveSession={moveSession}
          onCreateProject={createProject}
          onDeleteProject={deleteProject}
          onRenameProject={renameProject}
          darkMode={dm}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
          collapsed={!sidebarVisible}
          historyLoading={historyLoading}
        />
      )}

      <style>{`
        @keyframes chatPulse {
          0%, 80%, 100% { transform: translateY(0) scale(0.86); opacity: 0.45; }
          40% { transform: translateY(-5px) scale(1); opacity: 1; }
        }
        ::selection {
          background: lightblue;
          color: #1a1210;
        }
      `}</style>
    </div>
  );
}
