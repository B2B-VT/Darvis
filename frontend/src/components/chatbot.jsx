// Chatbot page — full AI chat experience powered by the FastAPI backend
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { Chart, registerables } from "chart.js";
import { DARVIS_CONFIG, CYRUS_PUBLIC_LAUNCHED, CYRUS_ALLOWLIST } from "../config.js";
import { API } from "../api.js";
import { MONO, SANS, ACCENT, COPPER, palette, glassCard, RADIUS, SHADOW, EASE, PageHeader } from "../theme.jsx";
import { SkeletonSidebar, useMinimumLoading } from "./skeletons.jsx";
import CyrusLogo from "./cyrus-logo.jsx";

Chart.register(...registerables);

const CHAT_API = DARVIS_CONFIG.chatApiUrl;
const CHAT_STREAM_API = CHAT_API.endsWith("/chat")
  ? CHAT_API.replace(/\/chat$/, "/chat/stream")
  : `${CHAT_API.replace(/\/$/, "")}/stream`;
const FEEDBACK_API = CHAT_API.endsWith("/chat")
  ? CHAT_API.replace(/\/chat$/, "/feedback")
  : `${CHAT_API.replace(/\/$/, "")}/feedback`;

const SUGGESTED = [
  { label: "Build a schedule", prompt: "Build me a schedule where I don’t wake up before 11." },
  { label: "Compare professors", prompt: "Compare these professors for this course." },
  { label: "Find easier electives", prompt: "What are easier electives with strong grade outcomes?" },
  { label: "Check GPA impact", prompt: "Help me understand how this course might affect my GPA." },
  { label: "Plan around preferences", prompt: "Plan around my preferences for time of day, workload, and professor fit." },
  { label: "Explain a course", prompt: "Explain this course using grade and professor data." },
];

const EMPTY_STATE_HEADLINES = [
  "Where should we begin?",
  "What can we make clearer today?",
  "What decision are we working through?",
  "What should we figure out together?",
  "Where do you want more confidence?",
  "What class is on your mind?",
  "What would make this semester easier?",
  "What should we untangle first?",
  "What are you trying to optimize?",
  "What would help you move forward?",
  "What should we look into next?",
  "What choice deserves a second look?",
];

const FALLBACK_THINKING_PHASES = [
  { after: 0, message: "Thinking" },
  { after: 3600, message: "Understanding your question" },
  { after: 6200, message: "Checking available data" },
  { after: 9800, message: "Preparing your answer" },
  { after: 18000, message: "Almost ready" },
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

// ── Input autocomplete / spell-correct helpers ────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

// The word (or "SUBJ NNNN" pair) currently being typed at the end of the input —
// what a suggestion dropdown should match against and replace on selection.
function trailingToken(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const last = words[words.length - 1];
  const prev = words[words.length - 2] || "";
  if (/^\d{1,4}$/.test(last) && /^[A-Za-z]{2,6}$/.test(prev)) return `${prev} ${last}`;
  return last;
}

// Best inline completion for the token currently being typed — "cs 31" ->
// "CS 3114", "hamou" -> "Hamouda". Prefix matches only; typo correction is
// handled separately by correctWord() on word boundaries.
function completionFor(text, entityPool) {
  const token = trailingToken(text).trim();
  if (token.length < 2) return null;
  const lower = token.toLowerCase();
  if (/\s/.test(token)) {
    for (const c of entityPool.courses) {
      const code = `${c.subject} ${c.number}`;
      if (code.length > token.length && code.toLowerCase().startsWith(lower)) return code;
    }
    return null;
  }
  for (const inst of entityPool.instructors) {
    const name = typeof inst === "string" ? inst : inst?.name;
    if (!name) continue;
    const last = name.split(" ").slice(-1)[0];
    if (last.length > token.length && last.toLowerCase().startsWith(lower)) return last;
  }
  return null;
}

// Silently corrects a just-completed word against known professor last names.
// Scoped to names only (not course numbers) — a 1-digit course-number typo
// like "3115" vs "3114" is a different real course, not a spelling mistake,
// so auto-"fixing" it could quietly point the question at the wrong course.
// Ordinary English words are never "corrected" into a name, even if they
// happen to be a short edit distance from one (e.g. "want" is 1 edit from
// the real surname "Wang") — this list is the guard against that.
const COMMON_WORDS = new Set([
  "the","and","for","are","was","were","have","has","had","not","but","you","your",
  "with","from","this","that","what","when","where","which","who","how","why","does",
  "did","get","got","make","made","take","took","know","think","see","look","find",
  "use","used","work","call","try","ask","tell","feel","become","leave","put","mean",
  "keep","let","begin","seem","help","talk","turn","start","might","show","hear","play",
  "run","move","live","believe","bring","happen","write","sit","stand","lose","add",
  "change","follow","stop","create","speak","read","allow","spend","grow","open","walk",
  "win","offer","remember","love","consider","appear","buy","wait","serve","send","expect",
  "build","stay","fall","cut","reach","kill","remain","suggest","raise","pass","sell",
  "require","report","decide","pull","want","need","will","would","could","should","can",
  "about","after","again","also","any","because","before","between","both","cant","come",
  "could","each","even","every","first","give","good","great","hard","here","into","just",
  "kind","last","like","little","long","many","more","most","much","must","new","next",
  "now","off","once","only","other","our","out","over","own","part","people","really",
  "right","same","say","school","some","something","still","such","take","than","their",
  "them","then","there","these","they","thing","those","time","too","two","under","until",
  "very","way","well","went","were","without","year","years","class","classes","course",
  "courses","professor","professors","instructor","instructors","grade","grades","credit",
  "credits","hard","easy","best","worst","good","bad","teach","teaches","teaching","taught",
]);

// Only attempt a professor-name correction when the text actually suggests a
// name is being typed — a raw edit-distance match alone isn't enough signal
// (e.g. "want" is 1 edit from the real surname "Wang").
const NAME_CONTEXT_HINTS = ["professor", "prof", "dr", "instructor", "teach", "taught", "by"];

// Exact-match corrections — commonly misspelled English words and informal
// chat abbreviations. Unlike the fuzzy name correction below, these are safe
// to apply unconditionally: they're known typos/shorthand, not proximity
// guesses, so there's no "want" -> "Wang" class of false positive.
const MISSPELLING_MAP = {
  recieve: "receive", recieved: "received", recieving: "receiving",
  definately: "definitely", definitly: "definitely", seperate: "separate",
  seperately: "separately", occured: "occurred", occuring: "occurring",
  occassion: "occasion", untill: "until", wich: "which", thier: "their",
  necesary: "necessary", neccessary: "necessary", arguement: "argument",
  acheive: "achieve", begining: "beginning", beleive: "believe",
  calender: "calendar", comming: "coming", commited: "committed",
  committment: "commitment", enviroment: "environment", existance: "existence",
  goverment: "government", happend: "happened", immediatly: "immediately",
  independant: "independent", posession: "possession", priviledge: "privilege",
  recomend: "recommend", recommeded: "recommended", reccommend: "recommend",
  succesful: "successful", successfull: "successful", tommorow: "tomorrow",
  teh: "the", adn: "and", hte: "the", taht: "that", waht: "what",
  wnat: "want", wnated: "wanted", becuase: "because", cours: "course",
  proffesor: "professor", proffessor: "professor", professer: "professor",
  intructor: "instructor", schedual: "schedule", shedule: "schedule",
  prerequisit: "prerequisite", requirment: "requirement", requirments: "requirements",
  // informal abbreviations
  u: "you", ur: "your", r: "are", pls: "please", plz: "please",
  thx: "thanks", thanx: "thanks", info: "information", req: "requirement",
  reqs: "requirements", prereq: "prerequisite", prereqs: "prerequisites",
  recs: "recommendations", sched: "schedule", avg: "average",
  approx: "approximately", bc: "because", b4: "before", def: "definitely",
  prof: "professor", profs: "professors", diff: "difficulty",
};

function correctKnownWord(word) {
  const lower = word.toLowerCase();
  const fixed = MISSPELLING_MAP[lower];
  if (!fixed) return null;
  if (word[0] && word[0] === word[0].toUpperCase() && /[a-z]/i.test(word[0])) {
    return fixed.charAt(0).toUpperCase() + fixed.slice(1);
  }
  return fixed;
}

function hasNameContext(precedingText) {
  const words = precedingText.toLowerCase().split(/\s+/).filter(Boolean).slice(-4);
  return words.some(w => NAME_CONTEXT_HINTS.some(hint => w.includes(hint)));
}

function correctWord(word, entityPool) {
  const w = word.trim();
  if (w.length < 4 || /\d/.test(w)) return null;
  const lower = w.toLowerCase();
  if (COMMON_WORDS.has(lower)) return null;
  const maxD = w.length <= 5 ? 1 : 2;
  let best = null, bestD = maxD + 1;
  for (const inst of entityPool.instructors) {
    const name = typeof inst === "string" ? inst : inst?.name;
    if (!name) continue;
    const last = name.split(" ").slice(-1)[0];
    if (Math.abs(last.length - w.length) > 2) continue;
    if (last.toLowerCase() === lower) return null; // already correct
    if (COMMON_WORDS.has(last.toLowerCase())) continue; // surname doubles as a real word (e.g. "Baker")
    const d = levenshtein(lower, last.toLowerCase());
    if (d > 0 && d <= maxD && d < bestD) { best = last; bestD = d; }
  }
  return best;
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
function BotMessage({ msg, darkMode, question, onRetry, onFeedback }) {
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

  const iconBtn = {
    background: "none",
    border: "none",
    borderRadius: 8,
    width: 30,
    height: 30,
    padding: 0,
    color: dm ? "rgba(255,255,255,0.62)" : "rgba(26,18,15,0.48)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  };

  const activeFeedbackBtn = {
    color: "#fff",
    background: dm ? "rgba(255,255,255,0.16)" : ACCENT,
    boxShadow: dm ? "0 0 0 1px rgba(255,255,255,0.10), 0 0 16px rgba(255,255,255,0.18)" : "0 0 16px rgba(134,31,65,0.24)",
  };

  const ActionIcon = ({ type, active = false }) => {
    const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
    const filled = { ...common, fill: "currentColor" };
    if (type === "copy") return <svg {...common}><path d="M7 7.5V5.75A2.75 2.75 0 0 1 9.75 3h8.5A2.75 2.75 0 0 1 21 5.75v8.5A2.75 2.75 0 0 1 18.25 17H16.5"/><path d="M5.75 7h8.5A2.75 2.75 0 0 1 17 9.75v8.5A2.75 2.75 0 0 1 14.25 21h-8.5A2.75 2.75 0 0 1 3 18.25v-8.5A2.75 2.75 0 0 1 5.75 7Z"/></svg>;
    if (type === "check") return <svg {...common}><path d="m20 6-11 11-5-5"/></svg>;
    if (type === "good") return <svg {...(active ? filled : common)}><path d="M7 10v11"/><path d="M15 5.5 14 10h5.4a1.8 1.8 0 0 1 1.75 2.2l-1.6 6.5A2.9 2.9 0 0 1 16.75 21H5.8A1.8 1.8 0 0 1 4 19.2V11.8A1.8 1.8 0 0 1 5.8 10H8l3.45-5.15A1.9 1.9 0 0 1 15 5.5Z"/></svg>;
    if (type === "bad") return <svg {...(active ? filled : common)}><path d="M17 14V3"/><path d="M9 18.5 10 14H4.6a1.8 1.8 0 0 1-1.75-2.2l1.6-6.5A2.9 2.9 0 0 1 7.25 3H18.2A1.8 1.8 0 0 1 20 4.8v7.4a1.8 1.8 0 0 1-1.8 1.8H16l-3.45 5.15A1.9 1.9 0 0 1 9 18.5Z"/></svg>;
    if (type === "share") return <svg {...common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/></svg>;
    if (type === "retry") return <svg {...common}><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v6h-6"/></svg>;
    return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
  };

  const handleShare = () => {
    const text = msg.answer || "";
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      <div style={{ width: "100%", minWidth: 0 }}>
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

        {/* Action row */}
        {!msg._streaming && <div style={{ display: "flex", gap: 4, marginTop: 10, alignItems: "center" }}>
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy response"}
            title={copied ? "Copied" : "Copy"}
            style={{ ...iconBtn, color: copied ? ACCENT : iconBtn.color }}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = copied ? ACCENT : iconBtn.color; e.currentTarget.style.background = "none"; }}
          >
            <ActionIcon type={copied ? "check" : "copy"} />
          </button>
          <button
            onClick={() => onFeedback?.("up")}
            aria-label="Good response"
            title="Good response"
            style={{ ...iconBtn, ...(msg.feedback === "up" ? activeFeedbackBtn : {}) }}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
            onMouseLeave={e => {
              e.currentTarget.style.color = msg.feedback === "up" ? "#fff" : iconBtn.color;
              e.currentTarget.style.background = msg.feedback === "up" ? activeFeedbackBtn.background : "none";
            }}
          >
            <ActionIcon type="good" active={msg.feedback === "up"} />
          </button>
          <button
            onClick={() => onFeedback?.("down")}
            aria-label="Bad response"
            title="Bad response"
            style={{ ...iconBtn, ...(msg.feedback === "down" ? activeFeedbackBtn : {}) }}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
            onMouseLeave={e => {
              e.currentTarget.style.color = msg.feedback === "down" ? "#fff" : iconBtn.color;
              e.currentTarget.style.background = msg.feedback === "down" ? activeFeedbackBtn.background : "none";
            }}
          >
            <ActionIcon type="bad" active={msg.feedback === "down"} />
          </button>
          <button
            onClick={handleShare}
            aria-label="Share response"
            title="Share"
            style={iconBtn}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = iconBtn.color; e.currentTarget.style.background = "none"; }}
          >
            <ActionIcon type="share" />
          </button>
          {(msg.isError || onRetry) && question && (
            <button
              onClick={() => onRetry(question)}
              aria-label="Try again"
              title="Try again"
              style={iconBtn}
              onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = iconBtn.color; e.currentTarget.style.background = "none"; }}
            >
              <ActionIcon type="retry" />
            </button>
          )}
          <button
            aria-label="More actions"
            title="More"
            style={iconBtn}
            onMouseEnter={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.background = dm ? "rgba(255,255,255,0.06)" : "rgba(26,18,15,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = iconBtn.color; e.currentTarget.style.background = "none"; }}
          >
            <ActionIcon type="more" />
          </button>
        </div>}
      </div>
    </div>
  );
}

function ThinkingIndicator({ darkMode, status }) {
  const dm = darkMode;
  const p = palette(dm);
  const muted = dm ? "rgba(255,255,255,0.46)" : "rgba(26,18,15,0.48)";
  const bright = dm ? "rgba(255,255,255,0.92)" : "rgba(26,18,15,0.82)";

  return (
    <div style={{ minHeight: 32, display: "flex", alignItems: "center" }}>
      <div
        aria-live="polite"
        className="chat-thinking-text"
        style={{
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.45,
          color: p.textSub,
          backgroundImage: `linear-gradient(90deg, ${muted} 0%, ${muted} 35%, ${bright} 50%, ${muted} 65%, ${muted} 100%)`,
          backgroundSize: "220% 100%",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "chatTextShimmer 2.2s ease-in-out infinite",
        }}
      >
        {status}
      </div>
    </div>
  );
}

function parseSseEvents(buffer) {
  const events = [];
  let rest = buffer;
  let boundary = rest.indexOf("\n\n");
  while (boundary !== -1) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf("\n\n");

    let event = "message";
    const dataLines = [];
    raw.split("\n").forEach(line => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    });
    if (!dataLines.length) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
    } catch {
      events.push({ event, data: { raw: dataLines.join("\n") } });
    }
  }
  return { events, rest };
}

function applyScheduleActions(data, addSection, setPage, clearSchedule) {
  // schedule_actions is only ever populated by handle_schedule_builder, and
  // that handler always returns a complete, self-contained schedule built
  // from scratch — never an incremental single-course addition. Without
  // clearing first, asking for a new schedule after not liking the last one
  // stacked the new courses on top of the old ones instead of replacing them.
  if (data?.schedule_actions?.length > 0 && addSection) {
    clearSchedule?.();
    data.schedule_actions.forEach(sec => addSection(sec));
    setTimeout(() => setPage?.("schedule"), 1200);
  }
}

function buildBotMessage(data) {
  return { _id: newMessageId(), role: "bot", feedback: null, ...data };
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

function newMessageId() {
  return "msg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newProjectId() {
  return "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function SidebarIcon({ name, size = 22, strokeWidth = 1.9 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (name === "new") return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
  if (name === "project") return <svg {...common}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9z"/></svg>;
  if (name === "collapse") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M14.63384375 1.36615625H1.36615625C0.69999375 1.366125 0.16 1.90614375 0.16 2.57230625v10.8553875c0 0.66615625 0.53999375 1.20618125 1.20615625 1.20615h13.2676875c0.66611875 -0.000025 1.20615625 -0.54003125 1.20615625 -1.20615V2.57230625c0 -0.6661375 -0.5400125 -1.20615 -1.20615625 -1.20615ZM1.36615625 2.57230625h3.01538125v10.8553875H1.36615625Zm13.2676875 10.8553875H5.58769375V2.57230625h9.04615v10.8553875Z" />
    </svg>
  );
  return null;
}

function CyrusRailIcon({ children }) {
  return (
    <span style={{
      width: 24,
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      {children}
    </span>
  );
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
        margin: "1px 12px",
        paddingRight: 4,
        transition: "background 0.12s",
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, padding: `8px 0 8px ${indent ? 22 : 10}px`, minWidth: 0, cursor: "pointer" }}>
        <div style={{
          fontSize: 14, fontWeight: active ? 600 : 400,
          color: active ? c.text : c.sub,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.35,
        }}>{session.title}</div>
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
          margin: "1px 12px",
          padding: "7px 8px 7px 10px",
          borderRadius: 8,
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
              color: c.text, fontSize: 14, fontWeight: 500,
              outline: "none", padding: "1px 2px",
              fontFamily: c.font,
            }}
          />
        ) : (
          <span
            onClick={() => setCollapsed(v => !v)}
            onDoubleClick={e => { e.stopPropagation(); setRenaming(true); }}
            style={{
              flex: 1, fontSize: 14, fontWeight: 400,
              color: c.sub, letterSpacing: 0,
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
const CYRUS_SIDEBAR_WIDTH = 306;
const CYRUS_SIDEBAR_COLLAPSED_WIDTH = 64;

function Sidebar({ sessions, projects, currentId, onSelect, onNew, onDelete, onMoveSession, onCreateProject, onDeleteProject, onRenameProject, darkMode, open, onClose, isMobile, collapsed, historyLoading, onToggleCollapse }) {
  const dm = darkMode;
  const p = palette(dm);
  const sidebarFont = `"Segoe UI", ${SANS}`;
  const c = {
    bg:     dm ? "linear-gradient(180deg, rgba(10,8,7,0.96) 0%, rgba(5,5,5,0.98) 58%, rgba(16,7,6,0.96) 100%)" : p.bgRaised,
    border: dm ? "rgba(255,255,255,0.10)" : p.line,
    text:   dm ? "rgba(255,255,255,0.92)" : p.text,
    sub:    dm ? "rgba(255,255,255,0.76)" : p.textSub,
    faint:  dm ? "rgba(255,255,255,0.45)" : p.textMute,
    hover:  dm ? "rgba(255,255,255,0.07)" : p.cardHover,
    active: dm ? "rgba(255,255,255,0.11)" : "rgba(26,18,15,0.08)",
    font:   sidebarFont,
  };

  const [addingProj, setAddingProj]   = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [railTooltip, setRailTooltip] = useState(null);
  const showHistoryLoading = useMinimumLoading(historyLoading);
  const showRailTooltip = (label, event, icon = null) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setRailTooltip({
      label,
      icon,
      x: rect.left - 10,
      y: rect.top + rect.height / 2,
    });
  };
  const hideRailTooltip = () => setRailTooltip(null);

  const panelStyle = isMobile ? {
    position: "fixed",
    top: 60,
    right: 0,
    bottom: 0,
    width: CYRUS_SIDEBAR_WIDTH,
    zIndex: 200,
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: `transform 0.22s ${EASE}`,
    boxShadow: open ? "-8px 0 24px rgba(0,0,0,0.30)" : "none",
  } : {
    width: collapsed ? CYRUS_SIDEBAR_COLLAPSED_WIDTH : CYRUS_SIDEBAR_WIDTH,
    flexShrink: 0,
    borderLeft: `1px solid ${c.border}`,
    overflow: "hidden",
    transition: "width 0.28s cubic-bezier(0.16,1,0.3,1)",
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleSessions = normalizedQuery
    ? sessions.filter(s => (s.title || "Untitled chat").toLowerCase().includes(normalizedQuery))
    : sessions;
  const visibleIds = new Set(visibleSessions.map(s => s.id));
  const visibleUnorganized = unorganized.filter(s => visibleIds.has(s.id));
  const toolbarItems = [
    { label: "New chat", icon: "new", action: onNew },
    {
      label: "New Project",
      icon: "project",
      action: () => {
        setAddingProj(v => !v);
        setNewProjName("");
        if (collapsed && !isMobile) onToggleCollapse?.();
      },
    },
    {
      label: "Search Chats",
      icon: "search",
      action: () => {
        setSearchOpen(v => !v);
        if (collapsed && !isMobile) onToggleCollapse?.();
      },
    },
  ];

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
        fontFamily: sidebarFont,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: collapsed && !isMobile ? "14px 0 10px" : "22px 20px 14px",
          display: collapsed && !isMobile ? "flex" : "grid",
          flexDirection: collapsed && !isMobile ? "column" : undefined,
          alignItems: collapsed && !isMobile ? "center" : undefined,
          gap: collapsed && !isMobile ? 12 : 18,
          flexShrink: 0,
        }}>
          {collapsed && !isMobile ? (
            <CyrusLogo
              ariaLabel="Cyrus home"
              onActivate={() => { hideRailTooltip(); onToggleCollapse?.(); }}
              size={36}
              style={{
                width: 44,
                height: 44,
                margin: 0,
                borderRadius: 12,
                overflow: "hidden",
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ color: c.text, fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>
                Cyrus
              </div>
              <button
                onClick={() => isMobile ? onClose?.() : onToggleCollapse?.()}
                aria-label={isMobile ? "Close sidebar" : "Collapse sidebar"}
                style={{
                  background: "transparent",
                  color: c.sub,
                  border: "none",
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={e => e.currentTarget.style.background = c.hover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <SidebarIcon name="collapse" size={23} />
              </button>
            </div>
          )}

          <div style={{
            display: collapsed && !isMobile ? "flex" : "grid",
            flexDirection: collapsed && !isMobile ? "column" : undefined,
            alignItems: collapsed && !isMobile ? "center" : undefined,
            gap: collapsed && !isMobile ? 6 : 2,
            width: collapsed && !isMobile ? "100%" : undefined,
          }}>
            {toolbarItems.map(item => (
              <button
                key={item.label}
                onClick={item.action}
                aria-label={item.label}
                onMouseEnter={e => {
                  if (collapsed && !isMobile) showRailTooltip(item.label, e, <CyrusRailIcon><SidebarIcon name={item.icon} size={22} strokeWidth={2} /></CyrusRailIcon>);
                  e.currentTarget.style.background = c.hover;
                }}
                onMouseLeave={e => {
                  hideRailTooltip();
                  e.currentTarget.style.background = "transparent";
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: collapsed && !isMobile ? 0 : "9px 0",
                  width: collapsed && !isMobile ? 44 : "auto",
                  height: collapsed && !isMobile ? 44 : "auto",
                  margin: collapsed && !isMobile ? 0 : 0,
                  cursor: "pointer",
                  color: c.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed && !isMobile ? "center" : "flex-start",
                  gap: 13,
                  fontSize: 18,
                  fontWeight: 400,
                  fontFamily: sidebarFont,
                  textAlign: "left",
                }}
              >
                {collapsed && !isMobile ? (
                  <CyrusRailIcon><SidebarIcon name={item.icon} size={24} strokeWidth={2} /></CyrusRailIcon>
                ) : (
                  <span style={{ width: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <SidebarIcon name={item.icon} size={24} strokeWidth={2} />
                  </span>
                )}
                <span style={{
                  opacity: collapsed && !isMobile ? 0 : 1,
                  maxWidth: collapsed && !isMobile ? 0 : 190,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  transition: "opacity 0.14s ease, max-width 0.22s cubic-bezier(0.16,1,0.3,1)",
                }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {!collapsed && searchOpen && (
          <div style={{ padding: "0 20px 12px", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 9,
              background: dm ? "rgba(255,255,255,0.08)" : "rgba(26,18,15,0.06)",
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: "8px 10px",
            }}>
              <SidebarIcon name="search" size={18} strokeWidth={1.8} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search chats"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: c.text,
                  fontSize: 14,
                  fontFamily: sidebarFont,
                }}
              />
            </div>
          </div>
        )}

        {/* New project input */}
        {!collapsed && addingProj && (
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
                outline: "none", fontFamily: sidebarFont,
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
                fontFamily: sidebarFont,
              }}
            >Create</button>
          </div>
        )}

        {/* Session list */}
        {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px" }}>
          {showHistoryLoading ? (
            <SkeletonSidebar darkMode={dm} rows={8} style={{ borderRight: "none", padding: "4px 12px 12px" }} />
          ) : visibleSessions.length === 0 ? (
            <div style={{
              padding: "28px 16px", textAlign: "center",
              color: c.faint, fontSize: 13, lineHeight: 1.6, fontFamily: sidebarFont,
            }}>
              {normalizedQuery ? "No matching chats." : <>No past chats yet.<br />Ask something to get started.</>}
            </div>
          ) : (
            <>
              {/* Projects */}
              {projects.length > 0 && (
                <>
                  <div style={{
                    padding: "12px 20px 7px",
                    fontSize: 17, fontWeight: 700, color: c.text,
                    fontFamily: sidebarFont,
                  }}>Projects</div>
                  {projects.map(project => {
                    const projectSessions = (byProject[project.id] || []).filter(s => visibleIds.has(s.id));
                    if (normalizedQuery && projectSessions.length === 0) return null;
                    return (
                      <ProjectGroup
                        key={project.id}
                        project={project}
                        sessions={projectSessions}
                        currentId={currentId}
                        onSelectSession={onSelect}
                        onDeleteSession={onDelete}
                        onMoveSession={onMoveSession}
                        onDeleteProject={onDeleteProject}
                        onRenameProject={onRenameProject}
                        projects={projects}
                        c={c}
                      />
                    );
                  })}
                </>
              )}

              {/* Unorganized sessions */}
              {visibleUnorganized.length > 0 && (
                <>
                  <div style={{
                    padding: projects.length > 0 ? "18px 20px 7px" : "12px 20px 7px",
                    fontSize: 17, fontWeight: 700, color: c.text,
                    fontFamily: sidebarFont,
                  }}>Chats</div>
                  {visibleUnorganized.map(session => (
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
        )}
      </div>
      {railTooltip && (
        <>
          <div style={{
            position: "fixed",
            left: railTooltip.x,
            top: railTooltip.y,
            transform: "translate(-100%, -50%)",
            zIndex: 1000,
            pointerEvents: "none",
            padding: "9px 11px",
            borderRadius: 10,
            background: dm ? "rgba(28,28,28,0.98)" : "rgba(26,18,15,0.96)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
            fontFamily: sidebarFont,
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "dvTooltipIn 0.12s ease-out both",
          }}>
            {railTooltip.icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{railTooltip.icon}</span>}
            {railTooltip.label}
          </div>
          <style>{`
            @keyframes dvTooltipIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </>
      )}
    </>
  );
}

// ── Main chatbot page ─────────────────────────────────────────────
function CyrusApp({ darkMode, addSection, clearSchedule, setPage, userProfile }) {
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
  const [thinkingStatus,    setThinkingStatus]   = useState("Thinking");
  const [entityPool,        setEntityPool]       = useState({ courses: [], instructors: [] });
  const [editingIndex,      setEditingIndex]     = useState(null);
  const [closingEditIndex,  setClosingEditIndex] = useState(null);
  const [editDraft,         setEditDraft]        = useState("");
  const [copiedUserIndex,   setCopiedUserIndex]  = useState(null);
  const [headlineIndex,     setHeadlineIndex]    = useState(() => Math.floor(Math.random() * EMPTY_STATE_HEADLINES.length));
  const [headlineUsesName,  setHeadlineUsesName] = useState(() => Math.random() < 0.25);
  const bottomRef      = useRef(null);
  const inputRef       = useRef(null);
  const fileRef        = useRef(null);
  const convSaveTimers = useRef({});
  const activeControllerRef = useRef(null);
  const stopRequestedRef    = useRef(false);
  const dm = darkMode;
  const p = palette(dm);
  const chatSurface = dm
    ? "radial-gradient(circle at 16% 0%, rgba(134,31,65,0.13), transparent 34%), radial-gradient(circle at 92% 10%, rgba(196,115,64,0.08), transparent 32%), linear-gradient(180deg, #090807 0%, #050505 48%, #080504 100%)"
    : "linear-gradient(180deg, #faf6f0 0%, #f3eee8 100%)";
  const chatPanel = dm ? "rgba(8,7,6,0.78)" : "rgba(255,255,255,0.72)";
  const firstName = user?.firstName || userProfile?.firstName || "";
  const emptyHeadline = firstName && headlineUsesName
    ? EMPTY_STATE_HEADLINES[headlineIndex].replace(/\?$/, `, ${firstName}?`)
    : EMPTY_STATE_HEADLINES[headlineIndex];
  const rotateEmptyHeadline = useCallback(() => {
    setHeadlineIndex(prev => {
      if (EMPTY_STATE_HEADLINES.length <= 1) return prev;
      let next = Math.floor(Math.random() * EMPTY_STATE_HEADLINES.length);
      if (next === prev) next = (next + 1) % EMPTY_STATE_HEADLINES.length;
      return next;
    });
    setHeadlineUsesName(Math.random() < 0.25);
  }, []);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Loaded once for the input's course/professor autocomplete + spell-correct.
  useEffect(() => {
    API.getCourses({}).then(list => setEntityPool(p => ({ ...p, courses: list }))).catch(() => {});
    API.getInstructors().then(list => setEntityPool(p => ({ ...p, instructors: list }))).catch(() => {});
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
              projectId: r.project_id || local?.projectId || null,
              _updatedAt: r.updated_at,
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
    bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setThinkingStatus("Thinking");
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const phase = [...FALLBACK_THINKING_PHASES]
        .reverse()
        .find(item => elapsed >= item.after);
      if (phase) setThinkingStatus(current => current === "Thinking" || FALLBACK_THINKING_PHASES.some(p => p.message === current) ? phase.message : current);
    }, 450);
    return () => clearInterval(id);
  }, [loading]);

  const startNewChat = () => {
    rotateEmptyHeadline();
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
    rotateEmptyHeadline();
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
    const newPid = projectId || null;
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, projectId: newPid } : s));
    if (user?.id) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        API.saveConversation(user.id, { ...session, projectId: newPid }).catch(() => {});
      }
    }
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

    const userMsg = { _id: newMessageId(), role: "user", content: question, attachments: attachments.length > 0 ? [...attachments] : undefined };
    const botMessageId = newMessageId();
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
	    activeControllerRef.current = controller;
	    stopRequestedRef.current = false;
	    const timeoutId = setTimeout(() => controller.abort(), 50000);
	    let streamStarted = false;
	    let streamedAnswer = "";
	    let finalData = null;
	
	    try {
      const history = messages
        .filter(m => !m.isError && !m._streaming && (m.role === "user" || m.role === "bot"))
        .slice(-8)
        .map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content || m.answer || "" }))
        .filter(m => m.content);

      const payload = { question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null, history };
	      try {
        const streamRes = await fetch(CHAT_STREAM_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const contentType = streamRes.headers.get("content-type") || "";
        if (!streamRes.ok || !streamRes.body || !contentType.includes("text/event-stream")) {
          throw new Error(`Streaming unavailable: HTTP ${streamRes.status}`);
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const parsed = parseSseEvents(buffer);
          buffer = parsed.rest;

          for (const item of parsed.events) {
            if (item.event === "status" && item.data?.message) {
              setThinkingStatus(item.data.message);
            } else if (item.event === "answer_chunk") {
              streamStarted = true;
              streamedAnswer += item.data?.text || "";
              const streamingMsg = {
                _id: botMessageId,
                role: "bot",
                answer: streamedAnswer,
                tables: [],
                charts: [],
                warnings: [],
                _streaming: true,
              };
              const partial = [...withUser, streamingMsg];
              setMessages(partial);
              setSessions(prev => prev.map(s =>
                s.id === sessionId ? { ...s, messages: partial } : s
              ));
            } else if (item.event === "final") {
              finalData = item.data;
            } else if (item.event === "error") {
              throw new Error(item.data?.message || "Streaming error");
            }
          }
        }

        if (!finalData && streamStarted) {
          finalData = { answer: streamedAnswer, route: "stream", tables: [], charts: [], warnings: [], metadata: {}, schedule_actions: [] };
        }
      } catch (streamErr) {
        if (streamStarted) throw streamErr;

        const res = await fetch(CHAT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${res.status}`);
        }
        finalData = await res.json();
      }

      clearTimeout(timeoutId);
      applyScheduleActions(finalData, addSection, setPage, clearSchedule);

      const botMsg = { ...buildBotMessage(finalData), _id: botMessageId };
      const final = [...withUser, botMsg];
      setMessages(final);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, messages: final } : s
      ));
	    } catch (err) {
	      clearTimeout(timeoutId);
	      if (stopRequestedRef.current) {
	        if (streamStarted && streamedAnswer) {
	          const stoppedMsg = { _id: botMessageId, role: "bot", answer: streamedAnswer.trim(), tables: [], charts: [], warnings: [], metadata: { stopped: true } };
	          const final = [...withUser, stoppedMsg];
	          setMessages(final);
	          setSessions(prev => prev.map(s =>
	            s.id === sessionId ? { ...s, messages: final } : s
	          ));
	        }
	        return;
	      }
	      const isTimeout = err.name === "AbortError";
      const isNetwork = isTimeout || err.message === "Failed to fetch";
      setServerDown(isNetwork);
      const errMsg = {
        _id: botMessageId,
        role: "bot",
        isError: true,
        feedback: null,
        answer: "Something went wrong while preparing the response. Try again.",
        tables: [], charts: [], warnings: [],
      };
      const final = [...withUser, errMsg];
      setMessages(final);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, messages: final } : s
      ));
	    } finally {
	      activeControllerRef.current = null;
	      stopRequestedRef.current = false;
	      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, attachments, loading, useRecency, minStudents, topN, messages, currentSessionId, addSection, clearSchedule, setPage, userProfile]);

  const retry = useCallback(async (question, botMsgIdx) => {
    if (loading) return;
    setLoading(true);
    setServerDown(false);
    const botMessageId = messages[botMsgIdx]?._id || newMessageId();

    const withPlaceholder = messages.map((m, i) =>
      i === botMsgIdx ? { _id: botMessageId, role: "bot", _retrying: true, answer: "", tables: [], charts: [], warnings: [] } : m
    );
    setMessages(withPlaceholder);

	    const sessionId = currentSessionId;
	    const controller = new AbortController();
	    activeControllerRef.current = controller;
	    stopRequestedRef.current = false;
	    const timeoutId = setTimeout(() => controller.abort(), 50000);
	    let streamStarted = false;
	    let streamedAnswer = "";
	    let finalData = null;
	
	    try {
      const historyEnd = messages[botMsgIdx - 1]?.role === "user" && messages[botMsgIdx - 1]?.content === question
        ? botMsgIdx - 1
        : botMsgIdx;
      const payload = {
        question,
        use_recency: useRecency,
        min_students: minStudents,
        top_n: topN,
        user_profile: userProfile || null,
        history: messages.slice(0, historyEnd).filter(m => !m.isError && !m._streaming && (m.role === "user" || m.role === "bot")).slice(-8).map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content || m.answer || "" })).filter(m => m.content),
      };
	      try {
        const streamRes = await fetch(CHAT_STREAM_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const contentType = streamRes.headers.get("content-type") || "";
        if (!streamRes.ok || !streamRes.body || !contentType.includes("text/event-stream")) {
          throw new Error(`Streaming unavailable: HTTP ${streamRes.status}`);
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const parsed = parseSseEvents(buffer);
          buffer = parsed.rest;

          for (const item of parsed.events) {
            if (item.event === "status" && item.data?.message) {
              setThinkingStatus(item.data.message);
            } else if (item.event === "answer_chunk") {
              streamStarted = true;
              streamedAnswer += item.data?.text || "";
              const streamingMsg = { _id: botMessageId, role: "bot", answer: streamedAnswer, tables: [], charts: [], warnings: [], _streaming: true };
              const partial = messages.map((m, i) => i === botMsgIdx ? streamingMsg : m);
              setMessages(partial);
              if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: partial } : s));
            } else if (item.event === "final") {
              finalData = item.data;
            } else if (item.event === "error") {
              throw new Error(item.data?.message || "Streaming error");
            }
          }
        }
        if (!finalData && streamStarted) {
          finalData = { answer: streamedAnswer, route: "stream", tables: [], charts: [], warnings: [], metadata: {}, schedule_actions: [] };
        }
      } catch (streamErr) {
        if (streamStarted) throw streamErr;
        const res = await fetch(CHAT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${res.status}`);
        }
        finalData = await res.json();
      }

      clearTimeout(timeoutId);
      applyScheduleActions(finalData, addSection, setPage, clearSchedule);
      const botMsg = { ...buildBotMessage(finalData), _id: botMessageId };
      const final = messages.map((m, i) => i === botMsgIdx ? botMsg : m);
      setMessages(final);
      if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
	    } catch (err) {
	      clearTimeout(timeoutId);
	      if (stopRequestedRef.current) {
	        if (streamStarted && streamedAnswer) {
	          const stoppedMsg = { _id: botMessageId, role: "bot", answer: streamedAnswer.trim(), tables: [], charts: [], warnings: [], metadata: { stopped: true } };
	          const final = messages.map((m, i) => i === botMsgIdx ? stoppedMsg : m);
	          setMessages(final);
	          if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
	        }
	        return;
	      }
	      const isTimeout = err.name === "AbortError";
      const isNetwork = isTimeout || err.message === "Failed to fetch";
      setServerDown(isNetwork);
      const errMsg = {
        _id: botMessageId, role: "bot", isError: true,
        answer: "Something went wrong while preparing the response. Try again.",
        tables: [], charts: [], warnings: [],
      };
      const final = messages.map((m, i) => i === botMsgIdx ? errMsg : m);
      setMessages(final);
      if (sessionId) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
	    } finally {
	      activeControllerRef.current = null;
	      stopRequestedRef.current = false;
	      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
	  }, [loading, messages, currentSessionId, useRecency, minStudents, topN, addSection, clearSchedule, setPage, userProfile]);

  const stopCyrus = useCallback(() => {
    if (!activeControllerRef.current) return;
    stopRequestedRef.current = true;
    activeControllerRef.current.abort();
  }, []);

  const closeEditMode = useCallback(() => {
    if (editingIndex == null || closingEditIndex != null) return;
    const index = editingIndex;
    setClosingEditIndex(index);
    window.setTimeout(() => {
      setEditingIndex(current => current === index ? null : current);
      setEditDraft("");
      setClosingEditIndex(current => current === index ? null : current);
    }, 330);
  }, [editingIndex, closingEditIndex]);

  const copyUserMessage = useCallback((content, index) => {
    navigator.clipboard?.writeText(content || "").then(() => {
      setCopiedUserIndex(index);
      setTimeout(() => setCopiedUserIndex(current => current === index ? null : current), 1800);
    }).catch(() => {});
  }, []);

  const submitEditedQuery = useCallback(async () => {
    if (loading || editingIndex == null) return;
    const question = normalizeInput(editDraft);
    if (!question) return;

    const prior = messages.slice(0, editingIndex);
    const userMsg = { _id: newMessageId(), role: "user", content: question };
    const botMessageId = newMessageId();
    const withUser = [...prior, userMsg];
    let sessionId = currentSessionId || newSessionId();
    const updateTitle = editingIndex === 0;

    setClosingEditIndex(null);
    setEditingIndex(null);
    setEditDraft("");
    setMessages(withUser);
    setLoading(true);
    setServerDown(false);
    if (!currentSessionId) setCurrentSessionId(sessionId);
    setSessions(prev => {
      const title = question.length > 55 ? question.slice(0, 52) + "…" : question;
      const exists = prev.some(s => s.id === sessionId);
      if (!exists) return [{ id: sessionId, title, messages: withUser, createdAt: Date.now(), projectId: null }, ...prev];
      return prev.map(s => s.id === sessionId ? { ...s, title: updateTitle ? title : s.title, messages: withUser } : s);
    });

    const controller = new AbortController();
    activeControllerRef.current = controller;
    stopRequestedRef.current = false;
    const timeoutId = setTimeout(() => controller.abort(), 50000);
    let streamStarted = false;
    let streamedAnswer = "";
    let finalData = null;

    try {
      const history = prior
        .filter(m => !m.isError && !m._streaming && (m.role === "user" || m.role === "bot"))
        .slice(-8)
        .map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content || m.answer || "" }))
        .filter(m => m.content);
      const payload = { question, use_recency: useRecency, min_students: minStudents, top_n: topN, user_profile: userProfile || null, history };

      try {
        const streamRes = await fetch(CHAT_STREAM_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const contentType = streamRes.headers.get("content-type") || "";
        if (!streamRes.ok || !streamRes.body || !contentType.includes("text/event-stream")) {
          throw new Error(`Streaming unavailable: HTTP ${streamRes.status}`);
        }
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const parsed = parseSseEvents(buffer);
          buffer = parsed.rest;
          for (const item of parsed.events) {
            if (item.event === "status" && item.data?.message) {
              setThinkingStatus(item.data.message);
            } else if (item.event === "answer_chunk") {
              streamStarted = true;
              streamedAnswer += item.data?.text || "";
              const streamingMsg = { _id: botMessageId, role: "bot", answer: streamedAnswer, tables: [], charts: [], warnings: [], _streaming: true };
              const partial = [...withUser, streamingMsg];
              setMessages(partial);
              setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: partial } : s));
            } else if (item.event === "final") {
              finalData = item.data;
            } else if (item.event === "error") {
              throw new Error(item.data?.message || "Streaming error");
            }
          }
        }
        if (!finalData && streamStarted) {
          finalData = { answer: streamedAnswer, route: "stream", tables: [], charts: [], warnings: [], metadata: {}, schedule_actions: [] };
        }
      } catch (streamErr) {
        if (streamStarted) throw streamErr;
        const res = await fetch(CHAT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${res.status}`);
        }
        finalData = await res.json();
      }

      clearTimeout(timeoutId);
      applyScheduleActions(finalData, addSection, setPage, clearSchedule);
      const final = [...withUser, { ...buildBotMessage(finalData), _id: botMessageId }];
      setMessages(final);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
    } catch (err) {
      clearTimeout(timeoutId);
      if (stopRequestedRef.current) {
        if (streamStarted && streamedAnswer) {
          const final = [...withUser, { _id: botMessageId, role: "bot", answer: streamedAnswer.trim(), tables: [], charts: [], warnings: [], metadata: { stopped: true } }];
          setMessages(final);
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
        }
        return;
      }
      setServerDown(err.name === "AbortError" || err.message === "Failed to fetch");
      const final = [...withUser, {
        _id: botMessageId,
        role: "bot",
        isError: true,
        feedback: null,
        answer: "Something went wrong while preparing the response. Try again.",
        tables: [], charts: [], warnings: [],
      }];
      setMessages(final);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: final } : s));
    } finally {
      activeControllerRef.current = null;
      stopRequestedRef.current = false;
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, editingIndex, editDraft, messages, currentSessionId, useRecency, minStudents, topN, userProfile, addSection, clearSchedule, setPage]);

  const sendFeedback = (index, rating, reason = "") => {
    const target = messages[index];
    if (!target) return;
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, feedback: rating } : m));
    if (currentSessionId) {
      setSessions(prev => prev.map(s => s.id === currentSessionId
        ? { ...s, messages: s.messages.map((m, i) => i === index ? { ...m, feedback: rating } : m) }
        : s));
    }
    const payload = {
      question: messages[index - 1]?.content || "",
      answer: target.answer || "",
      route: target.route || "",
      rating: rating === "up" ? 1 : -1,
      reason: reason.trim() || null,
    };
    fetch(FEEDBACK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(res => {
      if (!res.ok) return;
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, feedback: rating } : m));
      if (currentSessionId) {
        setSessions(prev => prev.map(s => s.id === currentSessionId
          ? { ...s, messages: s.messages.map((m, i) => i === index ? { ...m, feedback: rating } : m) }
          : s));
      }
    }).catch(() => {});
  };

  const completion = useMemo(() => completionFor(input, entityPool), [input, entityPool]);
  const ghostSuffix = completion ? completion.slice(trailingToken(input).length) : "";

  const handleInputChange = e => {
    const next = e.target.value;
    const prev = input;
    // Word-boundary autocorrect: user just typed a single space/newline right
    // after a word — silently fix it if it's a near-miss for a known name.
    if (next.length === prev.length + 1 && /\s$/.test(next) && !/\s$/.test(prev)) {
      const boundary = next.slice(-1);
      const stem = next.slice(0, -1);
      const words = stem.split(" ");
      const currentWord = words[words.length - 1];

      // 1. Exact known misspelling/abbreviation — safe unconditionally.
      const known = correctKnownWord(currentWord);
      if (known) {
        words[words.length - 1] = known;
        setInput(words.join(" ") + boundary);
        return;
      }

      // 2. Fuzzy professor-name correction — only in a plausible name context.
      const precedingText = words.slice(0, -1).join(" ");
      if (hasNameContext(precedingText)) {
        const corrected = correctWord(currentWord, entityPool);
        if (corrected) {
          words[words.length - 1] = corrected;
          setInput(words.join(" ") + boundary);
          return;
        }
      }
    }
    setInput(next);
  };

  const handleKey = e => {
    if (e.key === "Tab" && completion) {
      e.preventDefault();
      const token = trailingToken(input);
      setInput(input.slice(0, input.length - token.length) + completion + " ");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const isEmpty = messages.length === 0;
  const canSend = (input.trim() || attachments.length > 0) && !loading;

  const PromptIcon = ({ type }) => {
    const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.85, strokeLinecap: "round", strokeLinejoin: "round" };
    if (type === 0) return <svg {...common}><rect x="3.5" y="4" width="17" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3.5 10h17"/></svg>;
    if (type === 1) return <svg {...common}><path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4 11.5-11.5z"/></svg>;
    if (type === 2) return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    if (type === 3) return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/></svg>;
    if (type === 4) return <svg {...common}><path d="M4 7h16M6 12h12M8 17h8"/><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-15z"/></svg>;
    return <svg {...common}><path d="M5 6h14M5 12h14M5 18h8"/><circle cx="18" cy="18" r="2.5"/></svg>;
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

  const renderComposer = ({ hero = false } = {}) => {
    const composerTextStyle = {
      padding: hero ? (isMobile ? "10px 2px" : "12px 2px") : "9px 6px",
      fontSize: hero ? (isMobile ? 15 : 16) : 15,
      fontWeight: 500,
      fontFamily: SANS,
      lineHeight: 1.45,
      minHeight: hero ? (isMobile ? 40 : 42) : 38,
      maxHeight: 140,
      boxSizing: "border-box",
      borderRadius: RADIUS.sm,
    };
    return (
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

        <div style={{ position: "relative", flex: 1 }}>
          {/* Ghost-text layer: same box/font as the textarea. The typed text
              here is invisible but keeps layout (so wrapping/height matches);
              only the completion suffix after it is actually visible. */}
          <div aria-hidden="true" style={{
            ...composerTextStyle,
            visibility: "hidden",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            overflowY: "hidden",
          }}>
            <span>{input}</span>
            <span style={{ visibility: "visible", color: dm ? "rgba(255,255,255,0.34)" : "rgba(26,18,15,0.36)" }}>{ghostSuffix}</span>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            placeholder="Ask Cyrus anything"
            style={{
              ...composerTextStyle,
              position: "absolute", inset: 0,
              background: "transparent",
              border: "none",
              resize: "none",
              color: p.text,
              outline: "none",
              overflowY: "hidden",
            }}
          />
        </div>

        <button
          onClick={loading ? stopCyrus : () => send()}
          disabled={!loading && !canSend}
          aria-label={loading ? "Stop Cyrus" : "Send message"}
          style={{
            width: hero ? (isMobile ? 42 : 46) : 38,
            height: hero ? (isMobile ? 42 : 46) : 38,
            borderRadius: "50%",
            flexShrink: 0,
            background: loading ? (dm ? "rgba(255,255,255,0.92)" : "#1a1210") : canSend ? "#19c37d" : (dm ? "rgba(255,255,255,0.10)" : "rgba(26,18,15,0.10)"),
            color: loading ? (dm ? "#111" : "#fff") : canSend ? "white" : p.textMute,
            border: "none",
            cursor: (loading || canSend) ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: `all 0.15s ${EASE}`,
            boxShadow: canSend && !loading ? "0 8px 20px rgba(25,195,125,0.22)" : "none",
          }}
        >
          {loading ? (
            <svg width={hero ? 18 : 15} height={hero ? 18 : 15} viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width={hero ? 21 : 18} height={hero ? 21 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          )}
        </button>
      </div>
    </>
    );
  };

  return (
    <div style={{
      display: "flex",
      height: "100%",
      background: chatSurface,
      fontFamily: SANS,
      overflow: "hidden",
    }}>

      {/* ── Chat area ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, background: chatPanel }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${p.line}`,
            background: dm ? "rgba(8,7,6,0.86)" : p.bg, flexShrink: 0,
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

        {/* ── Empty state ─────────────────────────────────────── */}
        {isEmpty && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: isMobile ? "36px 16px 92px" : "40px 28px 112px",
            overflowY: "auto",
            background: "transparent",
          }}>
            <h1 style={{
              margin: isMobile ? "0 0 28px" : "0 0 44px",
              fontSize: isMobile ? 32 : 42,
              fontWeight: 500, color: p.text, letterSpacing: 0, textAlign: "center",
              fontFamily: SANS,
            }}>
              {emptyHeadline}
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
                  border: `1px solid ${dm ? "rgba(255,255,255,0.18)" : p.line}`,
                  borderRadius: RADIUS.pill,
                  padding: isMobile ? "9px 13px" : "11px 18px",
                  color: dm ? "rgba(255,255,255,0.72)" : p.textSub,
                  fontSize: isMobile ? 13 : 15,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: SANS,
                  transition: `all 0.15s ${EASE}`,
                  lineHeight: 1.2,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: isMobile ? 40 : 46,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.32)" : "rgba(26,18,15,0.24)";
                  e.currentTarget.style.color = dm ? "rgba(255,255,255,0.92)" : p.text;
                  e.currentTarget.style.background = dm ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.55)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.18)" : p.line;
                  e.currentTarget.style.color = dm ? "rgba(255,255,255,0.72)" : p.textSub;
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
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isMobile ? "16px 0 16px" : "32px 0 24px", width: "100%", scrollBehavior: "smooth", background: "transparent" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "0 14px" : "0 28px", display: "flex", flexDirection: "column", gap: isMobile ? 18 : 28 }}>
              {messages.map((msg, i) => (
                msg.role === "user" ? (
                  <div key={msg._id || `${msg.role}-${i}-${msg.content || ""}`} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{
                      width: editingIndex === i ? "100%" : "auto",
                      maxWidth: editingIndex === i ? "100%" : (isMobile ? "88%" : "72%"),
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                      transition: `max-width 0.24s ${EASE}, width 0.24s ${EASE}`,
                    }}>
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
                      {editingIndex === i ? (
                        <div style={{
                          animation: `${closingEditIndex === i ? "editQueryOut 0.32s" : "editQueryIn 0.24s"} ${EASE} both`,
                          width: "100%",
                          minHeight: isMobile ? 156 : 184,
                          boxSizing: "border-box",
                          background: dm ? "#2f2f2f" : "rgba(26,18,15,0.08)",
                          color: p.text,
                          borderRadius: isMobile ? 20 : 24,
                          padding: isMobile ? "18px 18px 68px" : "22px 26px 74px",
                          boxShadow: "none",
                          position: "relative",
                          transformOrigin: "right top",
                          willChange: "opacity, transform",
                          pointerEvents: closingEditIndex === i ? "none" : "auto",
                        }}>
                          <textarea
                            value={editDraft}
                            onChange={e => setEditDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submitEditedQuery();
                              }
                              if (e.key === "Escape") {
                                closeEditMode();
                              }
                            }}
                            autoFocus
                            style={{
                              width: "100%",
                              minHeight: isMobile ? 68 : 88,
                              resize: "none",
                              boxSizing: "border-box",
                              background: "transparent",
                              color: p.text,
                              border: "none",
                              padding: 0,
                              fontSize: 15,
                              lineHeight: 1.55,
                              fontWeight: 500,
                              fontFamily: SANS,
                              outline: "none",
                              overflowY: "auto",
                              animation: `${closingEditIndex === i ? "editContentOut 0.18s" : "editContentIn 0.18s 0.05s"} ${EASE} both`,
                            }}
                          />
                          <div style={{
                            position: "absolute",
                            right: isMobile ? 14 : 22,
                            bottom: isMobile ? 14 : 18,
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            animation: `${closingEditIndex === i ? "editControlsOut 0.16s" : "editControlsIn 0.18s 0.08s"} ${EASE} both`,
                          }}>
                            <button
                              onClick={closeEditMode}
                              style={{
                                background: dm ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.78)",
                                border: `1px solid ${dm ? "rgba(255,255,255,0.14)" : "rgba(26,18,15,0.16)"}`,
                                color: p.text,
                                borderRadius: RADIUS.pill,
                                padding: "9px 17px",
                                fontFamily: SANS,
                                fontSize: 14,
                                fontWeight: 760,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={submitEditedQuery}
                              disabled={!editDraft.trim()}
                              style={{
                                background: editDraft.trim() ? (dm ? "rgba(255,255,255,0.92)" : ACCENT) : (dm ? "rgba(255,255,255,0.12)" : "rgba(26,18,15,0.10)"),
                                border: "none",
                                color: editDraft.trim() ? (dm ? "#151515" : "white") : p.textMute,
                                borderRadius: RADIUS.pill,
                                padding: "9px 18px",
                                fontFamily: SANS,
                                fontSize: 14,
                                fontWeight: 800,
                                cursor: editDraft.trim() ? "pointer" : "default",
                              }}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="user-message-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, position: "relative" }}>
                          <div style={{
                            background: dm ? "#2f2f2f" : "rgba(26,18,15,0.08)",
                            color: p.text,
                            borderRadius: "18px",
                            padding: "10px 14px", fontSize: 15, lineHeight: 1.55,
                            fontWeight: 500, whiteSpace: "pre-wrap",
                            boxShadow: "none",
                            transition: `background 0.18s ${EASE}, border-radius 0.18s ${EASE}, transform 0.18s ${EASE}`,
                          }}>{msg.content}</div>
                          {!loading && messages[i + 1]?.role === "bot" && (
                            <div className="user-message-actions" style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              opacity: 0,
                              visibility: "hidden",
                              pointerEvents: "none",
                              height: 30,
                              marginTop: -1,
                              transform: "translateY(-2px)",
                              transition: `opacity 0.36s ${EASE} 0.08s, transform 0.36s ${EASE} 0.08s, visibility 0s linear 0.44s`,
                            }}>
                              <button
                                className="user-message-action-button"
                                onClick={() => copyUserMessage(msg.content, i)}
                                aria-label={copiedUserIndex === i ? "Copied message" : "Copy message"}
                                title={copiedUserIndex === i ? "Copied" : "Copy"}
                              >
                                {copiedUserIndex === i ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m20 6-11 11-5-5"/>
                                  </svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M7 7.5V5.75A2.75 2.75 0 0 1 9.75 3h8.5A2.75 2.75 0 0 1 21 5.75v8.5A2.75 2.75 0 0 1 18.25 17H16.5"/>
                                    <path d="M5.75 7h8.5A2.75 2.75 0 0 1 17 9.75v8.5A2.75 2.75 0 0 1 14.25 21h-8.5A2.75 2.75 0 0 1 3 18.25v-8.5A2.75 2.75 0 0 1 5.75 7Z"/>
                                  </svg>
                                )}
                              </button>
                              <button
                                className="user-message-action-button user-edit-button"
                                onClick={() => { setClosingEditIndex(null); setEditingIndex(i); setEditDraft(msg.content || ""); }}
                                aria-label="Edit message"
                                title="Edit message"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M15.672 3.912a2.357 2.357 0 1 1 3.336 3.336L7.25 19.006 3 20l.994-4.25 11.678-11.838Z"/>
                                  <path d="m14.5 5.1 3.4 3.4"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <BotMessage
                    key={msg._id || `${msg.role}-${i}-${msg.answer || ""}`}
                    msg={msg}
                    darkMode={dm}
                    question={messages[i - 1]?.content}
                    onRetry={(q) => retry(q, i)}
                    onFeedback={(rating) => sendFeedback(i, rating)}
                  />
                )
              ))}

              {/* Loading indicator */}
              {loading && !messages.some(msg => msg._streaming) && (
                <ThinkingIndicator darkMode={dm} status={thinkingStatus} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* ── Input bar ───────────────────────────────────────── */}
        {!isEmpty && (
        <div style={{
          background: dm ? "linear-gradient(180deg, rgba(8,7,6,0.76), rgba(8,7,6,0.96))" : "rgba(250,246,240,0.88)",
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
          onToggleCollapse={() => setSidebarVisible(v => !v)}
        />
      )}

      <style>{`
        @keyframes chatTextShimmer {
          0% { background-position: 160% 0; }
          100% { background-position: -60% 0; }
        }
        @keyframes editQueryIn {
          0% {
            opacity: 0.35;
            transform: translateY(-4px) scaleX(0.88) scaleY(0.82);
            border-radius: 18px;
          }
          58% {
            opacity: 1;
            transform: translateY(0) scaleX(1.01) scaleY(1);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleX(1) scaleY(1);
          }
        }
        @keyframes editQueryOut {
          0% {
            opacity: 1;
            transform: translateY(0) scaleX(1) scaleY(1);
          }
          45% {
            opacity: 0.92;
            transform: translateY(-1px) scaleX(0.985) scaleY(0.965);
          }
          100% {
            opacity: 0;
            transform: translateY(-3px) scaleX(0.94) scaleY(0.9);
            border-radius: 18px;
          }
        }
        @keyframes editContentIn {
          0% { opacity: 0; transform: translateY(3px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes editContentOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(2px); }
        }
        @keyframes editControlsIn {
          0% { opacity: 0; transform: translateY(5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes editControlsOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(3px); }
        }
        .user-message-action-button {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: ${dm ? "rgba(255,255,255,0.62)" : "rgba(26,18,15,0.48)"};
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ${EASE}, color 0.15s ${EASE};
        }
        .user-message-wrap:hover .user-message-actions,
        .user-message-actions:focus-within {
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
          transform: translateY(0) !important;
          transition: opacity 0.12s ${EASE}, transform 0.12s ${EASE}, visibility 0s linear !important;
        }
        .user-message-action-button:hover,
        .user-message-action-button:focus-visible {
          background: ${dm ? "rgba(255,255,255,0.08)" : "rgba(26,18,15,0.07)"};
          color: ${p.text} !important;
          outline: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-thinking-text {
            animation: none !important;
            background-image: none !important;
            -webkit-text-fill-color: currentColor !important;
          }
          [style*="editQueryIn"],
          [style*="editQueryOut"],
          [style*="editContentIn"],
          [style*="editContentOut"],
          [style*="editControlsIn"],
          [style*="editControlsOut"] {
            animation: none !important;
          }
        }
        ::selection {
          background: lightblue;
          color: #1a1210;
        }
      `}</style>
    </div>
  );
}

function CyrusLockedScreen({ darkMode }) {
  const p = palette(darkMode);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: p.bg,
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          ...glassCard(darkMode),
          maxWidth: 440,
          width: "100%",
          padding: "40px 32px",
          borderRadius: RADIUS.lg,
        }}
      >
        <PageHeader
          dark={darkMode}
          kicker="Cyrus"
          title="Private testing right now"
          sub="Cyrus is being tested with a small group before it opens up to everyone. Public access is coming soon — check back shortly."
        />
      </div>
    </div>
  );
}

export default function ChatbotPage(props) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const hasAccess = CYRUS_PUBLIC_LAUNCHED || CYRUS_ALLOWLIST.includes(email);
  return hasAccess ? <CyrusApp {...props} /> : <CyrusLockedScreen darkMode={props.darkMode} />;
}
