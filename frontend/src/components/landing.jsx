// Landing Page v6 — "The Transcript" · ink-line SVG editorial · light/dark
import { useState, useEffect, useRef } from "react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { db } from "../supabase.js";
import { Scribble, Reveal, MONO, SERIF, SANS, ACCENT, EASE, palette } from "../theme.jsx";

// ── Page-scoped CSS ───────────────────────────────────────────────────────────
const LP_CSS = `
@keyframes lpSpinSlow { to { transform: rotate(360deg); } }
@keyframes lpMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes lpHeroLine {
  from { transform: translateY(110%); }
  to   { transform: translateY(0); }
}
@keyframes lpHeroFade {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lp-h-clip { overflow: hidden; display: block; }
.lp-h-line { display: block; animation: lpHeroLine 1.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
.lp-h-fade { animation: lpHeroFade 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

function injectStyles(id, css) {
  if (!document.getElementById(id)) {
    const el = document.createElement("style");
    el.id = id; el.textContent = css;
    document.head.appendChild(el);
  }
}

// ── CampusBackground kept as an export for compatibility (no longer rendered) ─
export function CampusBackground({ darkMode }) {
  return null;
}

// ── Self-drawing grade curve (drafting-table chart) ───────────────────────────
function DrawnChart({ dark, active }) {
  const ink   = dark ? "rgba(244,239,233,0.8)" : "rgba(26,18,15,0.75)";
  const faint = dark ? "rgba(244,239,233,0.10)" : "rgba(26,18,15,0.10)";
  const PATH = "M20 150 C 90 140, 130 96, 200 104 S 330 70, 400 56 S 520 40, 580 30";
  const points = [
    { x: 20,  y: 150 }, { x: 200, y: 104 }, { x: 400, y: 56 }, { x: 580, y: 30 },
  ];
  return (
    <svg viewBox="0 0 620 180" fill="none" preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
      {/* Dashed drafting grid */}
      {[40, 80, 120, 160].map((y, i) => (
        <line key={y} x1="20" y1={y} x2="600" y2={y}
          stroke={faint} strokeWidth="1" strokeDasharray="2 6"
          style={{ opacity: active ? 1 : 0, transition: `opacity 0.8s ease ${0.1 * i}s` }} />
      ))}
      {/* Axis labels */}
      {[["4.0", 34], ["3.0", 74], ["2.0", 114], ["1.0", 154]].map(([t, y], i) => (
        <text key={t} x="0" y={y} fill={dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)"}
          fontSize="9" fontFamily="'JetBrains Mono', monospace"
          style={{ opacity: active ? 1 : 0, transition: `opacity 0.8s ease ${0.1 * i + 0.2}s` }}>{t}</text>
      ))}
      {/* The curve draws itself */}
      <path d={PATH} stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round"
        style={{
          strokeDasharray: 720, strokeDashoffset: active ? 0 : 720,
          transition: "stroke-dashoffset 2.2s cubic-bezier(0.45, 0, 0.2, 1) 0.5s",
        }} />
      {/* Plotted points pop in as the line passes */}
      {points.map((pt, i) => (
        <g key={i} style={{
          opacity: active ? 1 : 0,
          transform: active ? "scale(1)" : "scale(0)",
          transformOrigin: `${pt.x}px ${pt.y}px`,
          transition: `opacity 0.3s ease ${0.7 + i * 0.5}s, transform 0.45s cubic-bezier(0.34,1.4,0.64,1) ${0.7 + i * 0.5}s`,
        }}>
          <circle cx={pt.x} cy={pt.y} r="5" fill={dark ? "#0A0908" : "#FAF6F0"} stroke={ACCENT} strokeWidth="2.5" />
        </g>
      ))}
      {/* End label */}
      <g style={{ opacity: active ? 1 : 0, transition: "opacity 0.6s ease 2.5s" }}>
        <text x="588" y="22" fill={ink} fontSize="11" fontFamily="'JetBrains Mono', monospace" textAnchor="end">3.67 GPA</text>
      </g>
    </svg>
  );
}

// ── Rotating registrar stamp (circular SVG text) ──────────────────────────────
function RotatingStamp({ dark }) {
  const ink = dark ? "rgba(244,239,233,0.4)" : "rgba(26,18,15,0.4)";
  return (
    <div aria-hidden="true" style={{ width: 110, height: 110, position: "relative" }}>
      <svg viewBox="0 0 100 100" style={{
        width: "100%", height: "100%",
        animation: "lpSpinSlow 22s linear infinite",
      }}>
        <defs>
          <path id="lp-circle" d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" />
        </defs>
        <text fill={ink} fontSize="8.2" fontFamily="'JetBrains Mono', monospace" letterSpacing="2.2">
          <textPath href="#lp-circle">VIRGINIA TECH · GRADE DATA · EST 2025 ·</textPath>
        </text>
      </svg>
      {/* Center asterisk */}
      <svg viewBox="0 0 24 24" style={{
        position: "absolute", top: "50%", left: "50%",
        width: 22, height: 22, transform: "translate(-50%, -50%)",
      }}>
        <path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── Ink asterisk separator for the marquee ────────────────────────────────────
function InkStar() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" style={{ flexShrink: 0, margin: "0 26px" }}>
      <path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9"
        stroke={ACCENT} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimCounter({ target, suffix = "", duration = 1600, active }) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, target, duration]);
  return <span>{val.toLocaleString()}{suffix}</span>;
}

// ── Product previews (live inside the showcase window) ────────────────────────
function CoursesPreview({ dark, t }) {
  const courses = [
    { code: "CS 3114",   name: "Data Structures & Algorithms", gpa: 2.87, profs: 6 },
    { code: "CS 4664",   name: "Machine Learning",             gpa: 3.38, profs: 3 },
    { code: "MATH 2224", name: "Multivariable Calculus",       gpa: 2.78, profs: 8 },
  ];
  const gpaColor = g => g >= 3.3 ? "#4ade80" : g >= 3.0 ? "#86efac" : g >= 2.7 ? "#fbbf24" : "#f87171";
  return (
    <div>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.lineSoft}`, display: "flex", gap: 8 }}>
        <div style={{ flex: 1, background: t.input, border: `1px solid ${t.lineSoft}`, borderRadius: 999, height: 32, display: "flex", alignItems: "center", padding: "0 14px" }}>
          <span style={{ fontSize: 12, color: t.textMute }}>Search courses…</span>
        </div>
      </div>
      {courses.map((c, i) => (
        <div key={i} style={{ padding: "14px 18px", borderBottom: i < courses.length - 1 ? `1px solid ${t.lineSoft}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 500, fontFamily: MONO, color: ACCENT, letterSpacing: "0.5px" }}>{c.code}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, marginTop: 3 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: t.textMute, marginTop: 2 }}>{c.profs} instructors</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontFamily: SERIF, color: gpaColor(c.gpa) }}>{c.gpa.toFixed(2)}</div>
            <div style={{ fontSize: 9.5, color: t.textMute, fontFamily: MONO, letterSpacing: "0.5px" }}>AVG GPA</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SchedulePreview({ dark, t }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const blocks = [
    { day: 0, start: 1, span: 2, label: "CS 3114",   color: ACCENT },
    { day: 2, start: 1, span: 2, label: "CS 3114",   color: ACCENT },
    { day: 4, start: 1, span: 2, label: "CS 3114",   color: ACCENT },
    { day: 1, start: 3, span: 2, label: "MATH 2224", color: "#2563eb" },
    { day: 3, start: 3, span: 2, label: "MATH 2224", color: "#2563eb" },
    { day: 0, start: 5, span: 1, label: "CS 4664",   color: "#059669" },
    { day: 2, start: 5, span: 1, label: "CS 4664",   color: "#059669" },
  ];
  const rows = 7;
  const times = ["8am", "9am", "10am", "11am", "12pm", "1pm", "2pm"];
  return (
    <div style={{ padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "30px repeat(5, 1fr)", gap: 4 }}>
        <div />
        {days.map(d => (
          <div key={d} style={{ fontSize: 9.5, fontFamily: MONO, color: t.textMute, textAlign: "center", paddingBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{d}</div>
        ))}
        {Array.from({ length: rows }).map((_, row) => (
          [
            <div key={`t${row}`} style={{ fontSize: 8.5, fontFamily: MONO, color: t.textFaint, paddingTop: 3, textAlign: "right", paddingRight: 5 }}>{times[row]}</div>,
            ...days.map((_, col) => {
              const block = blocks.find(b => b.day === col && b.start === row);
              const covered = blocks.some(b => b.day === col && b.start < row && b.start + b.span > row);
              if (covered) return null;
              if (block) return (
                <div key={`c${col}`} style={{
                  gridRow: `span ${block.span}`,
                  background: block.color + "1f",
                  border: `1px solid ${block.color}55`,
                  borderRadius: 7, padding: "4px 6px",
                  fontSize: 8.5, fontWeight: 600, fontFamily: MONO, color: block.color,
                  overflow: "hidden",
                }}>{block.label}</div>
              );
              return <div key={`e${col}`} style={{ height: 24, background: t.lineSoft, opacity: 0.4, borderRadius: 5 }} />;
            })
          ]
        ))}
      </div>
    </div>
  );
}

function ChatPreview({ dark, t }) {
  const messages = [
    { role: "user", text: "Who's the best prof for CS 3114?" },
    { role: "bot",  text: "Hamouda has the strongest outcomes — 3.67 avg GPA across 459 students over 4 terms. Farghally is close behind at 3.54." },
    { role: "user", text: "What about the F rate?" },
    { role: "bot",  text: "Hamouda's F rate is 2.1%, on the low end for this course." },
  ];
  return (
    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
          <div style={{
            maxWidth: "80%",
            background: m.role === "user" ? ACCENT : t.input,
            border: m.role === "user" ? "none" : `1px solid ${t.lineSoft}`,
            color: m.role === "user" ? "white" : t.text,
            borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            padding: "9px 13px", fontSize: 12, lineHeight: 1.55, fontWeight: 500,
          }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}

// ── Auto-cycling product showcase ─────────────────────────────────────────────
function Showcase({ dark, t }) {
  const tabs = [
    { id: "courses",  label: "Courses",  C: CoursesPreview },
    { id: "schedule", label: "Schedule", C: SchedulePreview },
    { id: "chat",     label: "Chatbot",  C: ChatPreview },
  ];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || paused) return;
    const id = setInterval(() => setActive(a => (a + 1) % tabs.length), 4200);
    return () => clearInterval(id);
  }, [seen, paused, tabs.length]);

  const Active = tabs[active].C;

  return (
    <div ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        maxWidth: 640, margin: "0 auto", width: "100%",
        background: t.card,
        border: `1px solid ${t.line}`,
        borderRadius: 20, overflow: "hidden",
        boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.45)" : "0 24px 80px rgba(26,18,15,0.10)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "12px 14px", borderBottom: `1px solid ${t.lineSoft}`, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5, marginRight: 12 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: t.lineSoft, border: `1px solid ${t.line}` }} />
          ))}
        </div>
        {tabs.map((tab, i) => (
          <button key={tab.id} onClick={() => setActive(i)} style={{
            background: i === active ? (dark ? "rgba(134,31,65,0.25)" : "rgba(134,31,65,0.10)") : "transparent",
            border: `1px solid ${i === active ? "rgba(134,31,65,0.4)" : "transparent"}`,
            color: i === active ? (dark ? "#fff" : ACCENT) : t.textMute,
            borderRadius: 999, padding: "5px 14px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: SANS,
            transition: `all 0.3s ${EASE}`,
          }}>{tab.label}</button>
        ))}
        {/* Progress dashes */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {tabs.map((_, i) => (
            <span key={i} style={{
              width: i === active ? 18 : 5, height: 5, borderRadius: 999,
              background: i === active ? ACCENT : t.lineSoft,
              transition: `all 0.4s ${EASE}`,
            }} />
          ))}
        </div>
      </div>
      {/* Crossfading panel */}
      <div key={active} style={{ animation: `lpHeroFade 0.5s ${EASE} both`, minHeight: 270 }}>
        <Active dark={dark} t={t} />
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage({ onEnter, darkMode }) {
  const t = palette(darkMode);
  const statsRef = useRef(null);
  const chartRef = useRef(null);
  const [statsActive, setStatsActive] = useState(false);
  const [chartActive, setChartActive] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  // Waitlist form
  const [wlEmail, setWlEmail] = useState("");
  const [wlOpen, setWlOpen] = useState(false);
  const [wlStep, setWlStep] = useState("idle"); // idle | loading | success | error
  const [wlError, setWlError] = useState("");

  const handleWaitlist = async (e) => {
    e.preventDefault();
    if (!wlEmail.trim()) return;
    setWlStep("loading");
    try {
      const { error } = await db.from("waitlist").insert({ email: wlEmail.trim().toLowerCase() });
      if (error && error.code !== "23505") throw error; // 23505 = duplicate email, still show success
      setWlStep("success");
    } catch {
      setWlStep("error");
      setWlError("Something went wrong. Try again.");
    }
  };

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  injectStyles("lp-v6", LP_CSS);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsActive(true); }, { threshold: 0.3 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setChartActive(true); }, { threshold: 0.4 });
    if (chartRef.current) obs.observe(chartRef.current);
    return () => obs.disconnect();
  }, []);

  const stats = [
    { val: 790,  suffix: "",     label: "Courses indexed" },
    { val: 24,   suffix: " yrs", label: "Grade history" },
    { val: 3968, suffix: "+",    label: "Grade records" },
    { val: 100,  suffix: "%",    label: "Free to use" },
  ];

  const marqueeItems = [
    "CS 2114", "MATH 2224", "PHYS 2305", "ECE 2504", "CS 3114",
    "BIOL 2104", "HIST 1015", "CS 4664", "PSYC 1004", "MATH 2114",
  ];

  const Btn = ({ label, primary, onClick }) => (
    <button onClick={onClick} style={{
      background: primary ? ACCENT : "transparent",
      color: primary ? "white" : t.textSub,
      border: primary ? "none" : `1px solid ${t.line}`,
      borderRadius: 999, padding: "14px 32px",
      fontWeight: 600, fontSize: 15, cursor: "pointer",
      fontFamily: SANS, letterSpacing: "0.1px",
      boxShadow: primary ? "0 2px 18px rgba(134,31,65,0.3)" : "none",
    }}
    onMouseEnter={e => {
      if (primary) {
        e.currentTarget.style.background = "#9B2950";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(134,31,65,0.4)";
      } else {
        e.currentTarget.style.borderColor = ACCENT;
        e.currentTarget.style.color = t.text;
      }
    }}
    onMouseLeave={e => {
      if (primary) {
        e.currentTarget.style.background = ACCENT;
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 2px 18px rgba(134,31,65,0.3)";
      } else {
        e.currentTarget.style.borderColor = t.line;
        e.currentTarget.style.color = t.textSub;
      }
    }}
    >{label}</button>
  );

  const pad = isMobile ? "0 22px" : "0 64px";

  return (
    <div style={{ position: "relative", fontFamily: SANS, color: t.text }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "calc(100vh - 80px)",
        maxWidth: 1150, margin: "0 auto", padding: pad,
        boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "center",
        position: "relative",
      }}>
        {/* Kicker */}
        <div className="lp-h-fade" style={{ marginBottom: 30 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "2px", fontFamily: MONO,
            color: ACCENT, textTransform: "uppercase",
          }}>Virginia Tech · Course Intelligence</span>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: 30 }}>
          <span className="lp-h-clip">
            <span className="lp-h-line" style={{
              fontSize: "clamp(56px, 9vw, 124px)", fontWeight: 400,
              fontFamily: SERIF, lineHeight: 1.0, letterSpacing: "-2px", color: t.text,
            }}>The data behind</span>
          </span>
          <span className="lp-h-clip">
            <span className="lp-h-line dv-d1" style={{
              fontSize: "clamp(56px, 9vw, 124px)", fontWeight: 400,
              fontFamily: SERIF, fontStyle: "italic",
              lineHeight: 1.0, letterSpacing: "-2px", color: ACCENT,
            }}>every grade.</span>
          </span>
          <span aria-hidden="true" style={{
            display: "block", fontSize: "clamp(56px, 9vw, 124px)",
            width: "min(4.9em, 80%)", marginTop: "0.05em",
          }}>
            <Scribble delay={1.0} />
          </span>
        </div>

        {/* Sub + CTA */}
        <p className="lp-h-fade dv-d2" style={{
          fontSize: 17, color: t.textSub, lineHeight: 1.7,
          margin: "0 0 38px", fontWeight: 500, maxWidth: 440,
        }}>
          Grade distributions, professor ratings, and a schedule builder — every VT course, in one quiet place.
        </p>

        <div className="lp-h-fade dv-d3">
          <SignedIn>
            <Btn label="Browse courses →" primary onClick={onEnter} />
          </SignedIn>
          <SignedOut>
            {wlStep === "success" ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                border: "1px solid rgba(74,222,128,0.35)",
                borderRadius: 999, padding: "13px 24px",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12.5l5 5L20 6.5" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#4ade80" }}>
                  You're on the list — we'll email you.
                </span>
              </div>
            ) : wlOpen ? (
              <div>
                <form onSubmit={handleWaitlist} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="email" placeholder="your@email.com" value={wlEmail}
                    onChange={e => setWlEmail(e.target.value)} autoFocus required
                    style={{
                      height: 48, padding: "0 20px", fontSize: 14, fontWeight: 500,
                      background: t.input,
                      border: `1px solid ${t.line}`,
                      borderRadius: 999, color: t.text, outline: "none", minWidth: 235,
                      fontFamily: SANS, transition: "border-color 0.2s ease",
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(134,31,65,0.6)"}
                    onBlur={e => e.currentTarget.style.borderColor = t.line}
                  />
                  <button type="submit" disabled={wlStep === "loading"} style={{
                    height: 48, padding: "0 26px",
                    background: ACCENT, color: "white", border: "none",
                    borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
                    fontFamily: SANS, opacity: wlStep === "loading" ? 0.7 : 1,
                    boxShadow: "0 2px 18px rgba(134,31,65,0.3)",
                  }}>
                    {wlStep === "loading" ? "Joining…" : "Join →"}
                  </button>
                  <button type="button" onClick={() => { setWlOpen(false); setWlStep("idle"); }} style={{
                    height: 48, padding: "0 20px", background: "transparent",
                    border: `1px solid ${t.line}`, borderRadius: 999,
                    color: t.textSub, fontWeight: 600, fontSize: 13, cursor: "pointer",
                    fontFamily: SANS,
                  }}>Cancel</button>
                </form>
                {wlStep === "error" && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "#f87171", fontWeight: 600 }}>{wlError}</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Btn label="Join the waitlist →" primary onClick={() => setWlOpen(true)} />
                <Btn label="Browse courses" onClick={onEnter} />
              </div>
            )}
          </SignedOut>
        </div>

        {/* Rotating stamp — bottom right of hero */}
        {!isMobile && (
          <div className="lp-h-fade dv-d4" style={{ position: "absolute", right: 64, bottom: 48 }}>
            <RotatingStamp dark={darkMode} />
          </div>
        )}
      </section>

      {/* ── DRAWN CHART STRIP ─────────────────────────────────────────────────── */}
      <section ref={chartRef} style={{
        maxWidth: 1150, margin: "0 auto", padding: pad,
        boxSizing: "border-box", paddingBottom: isMobile ? 56 : 90,
      }}>
        <div style={{
          borderTop: `1px solid ${t.lineSoft}`,
          paddingTop: isMobile ? 36 : 54,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "240px 1fr",
          gap: isMobile ? 28 : 64, alignItems: "center",
        }}>
          <div>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
              color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 14,
            }}>CS 3114 · Hamouda</span>
            <p style={{
              fontFamily: SERIF, fontSize: isMobile ? 24 : 30, lineHeight: 1.25,
              color: t.text, margin: 0,
            }}>
              Four terms of grades, <span style={{ fontStyle: "italic", color: ACCENT }}>one clear trend.</span>
            </p>
          </div>
          <DrawnChart dark={darkMode} active={chartActive} />
        </div>
      </section>

      {/* ── MARQUEE ───────────────────────────────────────────────────────────── */}
      <div style={{
        overflow: "hidden",
        borderTop: `1px solid ${t.lineSoft}`,
        borderBottom: `1px solid ${t.lineSoft}`,
        padding: "18px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", animation: "lpMarquee 36s linear infinite", width: "max-content" }}>
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center" }}>
              <span style={{
                fontFamily: SERIF, fontStyle: "italic", fontSize: 19,
                color: t.textMute, whiteSpace: "nowrap",
              }}>{item}</span>
              <InkStar />
            </span>
          ))}
        </div>
      </div>

      {/* ── STATS ─────────────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{
        maxWidth: 1150, margin: "0 auto",
        padding: pad, boxSizing: "border-box",
        paddingTop: isMobile ? 56 : 90, paddingBottom: isMobile ? 56 : 90,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 36 : 0 }}>
          {stats.map((s, i) => (
            <Reveal key={i} delay={i * 0.08} style={{
              borderLeft: !isMobile && i > 0 ? `1px solid ${t.lineSoft}` : "none",
              paddingLeft: !isMobile && i > 0 ? 40 : 0,
            }}>
              <div style={{
                fontSize: "clamp(44px, 5vw, 72px)", fontFamily: SERIF,
                color: t.text, lineHeight: 1, letterSpacing: "-1px",
              }}>
                <AnimCounter target={s.val} suffix={s.suffix} active={statsActive} />
              </div>
              <div style={{
                fontSize: 10.5, color: t.textMute, fontFamily: MONO,
                fontWeight: 500, marginTop: 12,
                textTransform: "uppercase", letterSpacing: "1.4px",
              }}>{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── SHOWCASE ──────────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1150, margin: "0 auto", padding: pad, boxSizing: "border-box",
        paddingBottom: isMobile ? 72 : 120,
      }}>
        <Reveal style={{ textAlign: "center", marginBottom: 44 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
            color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 16,
          }}>One quiet workspace</span>
          <h2 style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(30px, 3.6vw, 48px)", letterSpacing: "-0.5px",
            color: t.text, lineHeight: 1.1,
          }}>Courses, schedule, <span style={{ fontStyle: "italic", color: ACCENT }}>answers.</span></h2>
        </Reveal>
        <Reveal delay={0.12}>
          <Showcase dark={darkMode} t={t} />
        </Reveal>
      </section>

      {/* ── MANIFESTO / CTA ───────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${t.lineSoft}`,
        padding: isMobile ? "88px 22px" : "150px 64px",
        textAlign: "center",
      }}>
        <Reveal>
          <p style={{
            fontFamily: SERIF, fontWeight: 400,
            fontSize: "clamp(38px, 6vw, 84px)", lineHeight: 1.08,
            letterSpacing: "-1px", color: t.text, margin: "0 0 18px",
          }}>
            Stop guessing.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <p style={{
            fontFamily: SERIF, fontWeight: 400, fontStyle: "italic",
            fontSize: "clamp(38px, 6vw, 84px)", lineHeight: 1.08,
            letterSpacing: "-1px", color: ACCENT, margin: "0 0 22px",
          }}>
            Start knowing.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div style={{ maxWidth: 230, margin: "0 auto 44px" }}>
            <Scribble delay={0.3} />
          </div>
        </Reveal>
        <Reveal delay={0.25}>
          <SignedIn>
            <Btn label="Browse courses →" primary onClick={onEnter} />
          </SignedIn>
          <SignedOut>
            {wlStep === "success" ? (
              <div style={{ fontSize: 14.5, fontWeight: 600, color: "#4ade80" }}>You're on the list.</div>
            ) : (
              <Btn label="Join the waitlist →" primary onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => setWlOpen(true), 500); }} />
            )}
          </SignedOut>
        </Reveal>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${t.lineSoft}`,
        padding: isMobile ? "22px 22px" : "26px 64px",
        display: "flex", flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", alignItems: "center", gap: isMobile ? 8 : 0,
      }}>
        <span style={{ fontFamily: SERIF, fontSize: 16, color: t.textSub }}>Darvis</span>
        <span style={{ fontSize: 10.5, color: t.textFaint, fontFamily: MONO, letterSpacing: "1px", textTransform: "uppercase" }}>
          Blacksburg, VA · Not affiliated with Virginia Tech
        </span>
      </footer>
    </div>
  );
}
