// Chatbot page — full AI chat experience powered by the FastAPI backend
import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/clerk-react";
import { Chart, registerables } from "chart.js";
import { DARVIS_CONFIG } from "../config.js";
import { API } from "../api.js";
import { MONO, SERIF, SANS, ACCENT, palette, glassCard, glassInput, RADIUS, SHADOW, EASE } from "../theme.jsx";

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
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 2, overflow: "hidden",
      }}>
        <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 20, height: 20 }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Answer text */}
        <div style={{
          ...(msg.isError ? {
            background: dm ? "rgba(248,113,113,0.06)" : "rgba(220,38,38,0.04)",
            border: `1px solid ${dm ? "rgba(248,113,113,0.20)" : "rgba(220,38,38,0.15)"}`,
          } : glassCard(dm)),
          borderRadius: "4px 14px 14px 14px",
          padding: "14px 16px",
          color: p.text,
          fontSize: 14, lineHeight: 1.65, fontWeight: 450,
        }}>
          {msg.answer}
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
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
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
        borderLeft: `2px solid ${active ? ACCENT : "transparent"}`,
        paddingRight: 8,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, padding: `9px 0 9px ${indent ? 22 : 14}px`, minWidth: 0, cursor: "pointer" }}>
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
function Sidebar({ sessions, projects, currentId, onSelect, onNew, onDelete, onMoveSession, onCreateProject, onDeleteProject, onRenameProject, darkMode, open, onClose, isMobile, collapsed }) {
  const dm = darkMode;
  const p = palette(dm);
  const c = {
    bg:     p.bgRaised,
    border: p.line,
    text:   p.text,
    sub:    p.textSub,
    faint:  p.textMute,
    hover:  p.cardHover,
    active: dm ? "rgba(134,31,65,0.14)" : "rgba(134,31,65,0.07)",
  };

  const [addingProj, setAddingProj]   = useState(false);
  const [newProjName, setNewProjName] = useState("");

  const panelStyle = isMobile ? {
    position: "fixed",
    top: 60,
    right: 0,
    bottom: 0,
    width: 260,
    zIndex: 200,
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: `transform 0.22s ${EASE}`,
    boxShadow: open ? "-6px 0 24px rgba(0,0,0,0.22)" : "none",
  } : {
    width: collapsed ? 0 : 240,
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

  const gc = glassCard(dm);

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
        background: gc.background,
        backdropFilter: gc.backdropFilter,
        WebkitBackdropFilter: gc.WebkitBackdropFilter,
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
            fontSize: 10, fontWeight: 700, color: ACCENT,
            letterSpacing: "1.5px", textTransform: "uppercase",
            fontFamily: MONO,
          }}>History</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => { setAddingProj(v => !v); setNewProjName(""); }}
              title="New project"
              style={{
                background: "none", border: `1px solid ${c.border}`,
                borderRadius: RADIUS.xs, padding: "4px 8px", cursor: "pointer",
                color: c.sub, display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 600,
                fontFamily: SANS,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181L15.546 13H2.454l-.257-7.819A2 2 0 0 1 4.19 3h1.668l.714-1.428A1 1 0 0 1 7.465 1h1.07a1 1 0 0 1 .894.553L9.828 3zm-2.95.702.681-1.29a.5.5 0 0 1 .447-.276h.988a.5.5 0 0 1 .447.276l.68 1.29H6.878z"/>
              </svg>
              +
            </button>
            <button
              onClick={onNew}
              style={{
                background: ACCENT, color: "white", border: "none",
                borderRadius: RADIUS.xs, padding: "5px 12px",
                fontWeight: 700, fontSize: 11, cursor: "pointer",
                fontFamily: SANS,
              }}
            >+ New</button>
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
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {sessions.length === 0 ? (
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
                  {projects.length > 0 && (
                    <div style={{
                      padding: "8px 12px 3px",
                      fontSize: 10, fontWeight: 700, color: c.faint,
                      letterSpacing: "0.8px", textTransform: "uppercase",
                      fontFamily: MONO,
                    }}>Other</div>
                  )}
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
  const [useRecency,        setUseRecency]       = useState(true);
  const [minStudents,       setMinStudents]      = useState(30);
  const [topN,              setTopN]             = useState(10);
  const [showSettings,      setShowSettings]     = useState(false);
  const [isMobile,          setIsMobile]         = useState(() => window.innerWidth < 768);
  const [sidebarOpen,       setSidebarOpen]      = useState(false);
  const [sidebarVisible,    setSidebarVisible]   = useState(true);
  const [attachments,       setAttachments]      = useState([]);
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
    }).catch(() => {});
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
    clearTimeout(convSaveTimers.current[id]);
    delete convSaveTimers.current[id];
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
  }, [input, loading, useRecency, minStudents, topN, messages, currentSessionId]);

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
  }, [loading, messages, currentSessionId, useRecency, minStudents, topN]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex",
      height: "100%",
      background: "transparent",
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
            background: p.bg, flexShrink: 0,
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
            }}>Darvis AI</span>
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
            padding: "8px 16px", borderBottom: `1px solid ${p.line}`,
            flexShrink: 0, background: p.bg,
          }}>
            <button
              onClick={() => setSidebarVisible(v => !v)}
              title={sidebarVisible ? "Hide history" : "Show history"}
              style={{
                background: "none", border: `1px solid ${p.line}`,
                borderRadius: RADIUS.sm, padding: "5px 12px", cursor: "pointer",
                color: p.textSub, fontSize: 11, fontWeight: 600,
                fontFamily: SANS,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <rect x="1" y="1" width="12" height="12" rx="2"/><line x1="9" y1="1" x2="9" y2="13"/>
              </svg>
              {sidebarVisible ? "Hide History" : "History"}
            </button>
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
              fontSize: 10, fontWeight: 700, color: ACCENT,
              letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: 20,
              fontFamily: MONO,
            }}>Darvis AI</div>
            <h1 style={{
              margin: "0 0 12px", fontSize: isMobile ? "clamp(28px, 8vw, 38px)" : "clamp(28px, 4vw, 48px)",
              fontWeight: 700, color: p.text, letterSpacing: "-2px", textAlign: "center",
              fontFamily: SANS,
            }}>
              Ask about <span style={{ color: ACCENT }}>any course.</span>
            </h1>
            <p style={{
              margin: "0 0 32px", fontSize: isMobile ? 14 : 15, color: p.textSub,
              maxWidth: 440, textAlign: "center", lineHeight: 1.7, fontFamily: SANS,
            }}>
              Grade distributions, professor comparisons, and historical trends. All from real institutional data.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: isMobile ? "100%" : 600 }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  background: p.card,
                  border: `1px solid ${p.line}`,
                  borderRadius: RADIUS.pill,
                  padding: "8px 14px",
                  color: p.textSub,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: SANS,
                  transition: `all 0.15s ${EASE}`,
                  textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = p.textSub; }}
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
                    <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
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
                        background: ACCENT, color: "white",
                        borderRadius: "14px 4px 14px 14px",
                        padding: "12px 16px", fontSize: 14, lineHeight: 1.5,
                        fontWeight: 500, whiteSpace: "pre-wrap",
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
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 20, height: 20 }} />
                  </div>
                  <div style={{
                    ...glassCard(dm),
                    borderRadius: "4px 14px 14px 14px",
                    padding: "14px 18px",
                    display: "flex", gap: 5, alignItems: "center",
                  }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: ACCENT, opacity: 0.7,
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
          background: p.bg,
          borderTop: `1px solid ${p.line}`,
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
                  color: p.textMute, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.5px",
                  fontFamily: SANS,
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

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10,
                padding: "10px 12px",
                background: p.card, borderRadius: RADIUS.sm,
                border: `1px solid ${p.line}`,
              }}>
                {attachments.map((att, i) => (
                  <div key={i} style={{
                    position: "relative", display: "flex", alignItems: "center", gap: 6,
                    background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                    border: `1px solid ${p.line}`,
                    borderRadius: RADIUS.xs, padding: att.type.startsWith("image/") ? 4 : "6px 10px",
                    maxWidth: 200,
                  }}>
                    {att.type.startsWith("image/") ? (
                      <img src={att.dataUrl} alt={att.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{att.name}</span>
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
            )}

            {/* Input */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              {/* Hidden file input */}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.csv,.doc,.docx"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />

              {/* Paperclip button */}
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach file"
                style={{
                  width: 40, height: 40, borderRadius: RADIUS.xs, flexShrink: 0,
                  background: "none",
                  border: `1px solid ${p.line}`,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: attachments.length > 0 ? ACCENT : p.textMute,
                  transition: `all 0.15s ${EASE}`,
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = attachments.length > 0 ? ACCENT : p.textMute; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                {attachments.length > 0 && (
                  <span style={{
                    position: "absolute", top: -5, right: -5,
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
                placeholder="Ask about a course, professor, or grade trend…"
                rows={1}
                style={{
                  flex: 1, padding: "12px 16px",
                  ...glassInput(dm),
                  borderRadius: RADIUS.sm, resize: "none",
                  color: p.text,
                  fontSize: 14, fontWeight: 500,
                  fontFamily: SANS,
                  outline: "none", lineHeight: 1.5,
                  transition: "border-color 0.15s ease",
                  overflowY: "hidden",
                }}
                onFocus={e => e.currentTarget.style.borderColor = ACCENT}
                onBlur={e => e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)"}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              />
              <button
                onClick={() => send()}
                disabled={(!input.trim() && attachments.length === 0) || loading}
                style={{
                  width: 44, height: 44, borderRadius: RADIUS.sm, flexShrink: 0,
                  background: (input.trim() || attachments.length > 0) && !loading ? ACCENT : "rgba(134,31,65,0.2)",
                  border: "none", cursor: (input.trim() || attachments.length > 0) && !loading ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: `all 0.15s ${EASE}`,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
                </svg>
              </button>
            </div>

            <div style={{ fontSize: 11, color: p.textMute, marginTop: 8, textAlign: "center", fontFamily: SANS }}>
              Based on historical grade data only · Enter to send
            </div>
          </div>
        </div>
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
        />
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        ::selection {
          background: lightblue;
          color: #1a1210;
        }
      `}</style>
    </div>
  );
}
