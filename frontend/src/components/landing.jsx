// Landing Page v7 — "Observatory" · editorial futurism · treated photo hero ·
// scroll-driven SVG · light/dark
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
@keyframes lpPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(0.82); }
}
@keyframes lpPing {
  0%   { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(2.4); opacity: 0; }
}
@keyframes lpGridDrift {
  from { transform: translateY(0); }
  to   { transform: translateY(28px); }
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

// ── Scroll progress hairline (top of viewport) ────────────────────────────────
function ScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const p = doc.scrollTop / Math.max(doc.scrollHeight - doc.clientHeight, 1);
        if (ref.current) ref.current.style.transform = `scaleX(${p})`;
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 300, pointerEvents: "none" }}>
      <div ref={ref} style={{
        height: "100%", background: ACCENT, transformOrigin: "left",
        transform: "scaleX(0)", boxShadow: `0 0 12px ${ACCENT}`,
      }} />
    </div>
  );
}

// ── Data spine — vertical line that fills as you scroll, nodes light up ───────
function DataSpine({ dark }) {
  const fillRef = useRef(null);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const p = doc.scrollTop / Math.max(doc.scrollHeight - doc.clientHeight, 1);
        if (fillRef.current) fillRef.current.style.transform = `scaleY(${p})`;
        setLit(Math.floor(p * 4.999));
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const track = dark ? "rgba(244,239,233,0.10)" : "rgba(26,18,15,0.12)";
  return (
    <div aria-hidden="true" style={{
      position: "fixed", left: 26, top: "16vh", bottom: "16vh",
      width: 14, zIndex: 5, pointerEvents: "none",
      display: "flex", justifyContent: "center",
    }}>
      {/* Track */}
      <div style={{ position: "absolute", top: 0, bottom: 0, width: 1, background: track }} />
      {/* Fill */}
      <div ref={fillRef} style={{
        position: "absolute", top: 0, bottom: 0, width: 1,
        background: `linear-gradient(${ACCENT}, ${ACCENT})`,
        transformOrigin: "top", transform: "scaleY(0)",
        boxShadow: `0 0 8px ${ACCENT}66`,
      }} />
      {/* Nodes */}
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          position: "absolute", top: `${i * 25}%`, left: "50%",
          width: 7, height: 7, borderRadius: "50%",
          transform: "translateX(-50%)",
          background: i <= lit ? ACCENT : "transparent",
          border: `1px solid ${i <= lit ? ACCENT : track}`,
          boxShadow: i <= lit ? `0 0 10px ${ACCENT}88` : "none",
          transition: "background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease",
        }} />
      ))}
    </div>
  );
}

// ── HUD corner brackets ───────────────────────────────────────────────────────
function Brackets({ color, size = 18, inset = 0, opacity = 1 }) {
  const s = size;
  const corner = (rotate, pos) => (
    <svg key={rotate} width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" style={{
      position: "absolute", ...pos, transform: `rotate(${rotate}deg)`, opacity,
    }}>
      <path d="M2 9 V4 a2 2 0 0 1 2-2 H9" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
  return (
    <>
      {corner(0,   { top: inset, left: inset })}
      {corner(90,  { top: inset, right: inset })}
      {corner(270, { bottom: inset, left: inset })}
      {corner(180, { bottom: inset, right: inset })}
    </>
  );
}

// ── Treated photo hero backdrop (campus imagery, recon-style) ─────────────────
function HeroPhoto({ dark, parallaxRef }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
      <div ref={parallaxRef} style={{ position: "absolute", inset: "-12% 0", willChange: "transform" }}>
        <img src="images/campus_day.jpg" alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover",
          filter: "grayscale(0.65) contrast(1.06) brightness(1.04)",
          opacity: dark ? 0 : 1, transition: "opacity 0.6s ease",
        }} />
        <img src="images/campus_night.jpg" alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover",
          filter: "grayscale(0.5) contrast(1.1) brightness(0.9)",
          opacity: dark ? 1 : 0, transition: "opacity 0.6s ease",
        }} />
      </div>
      {/* Duotone maroon wash */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.07)",
        mixBlendMode: dark ? "screen" : "multiply",
      }} />
      {/* Legibility scrim → fades into the page atmosphere at the bottom */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark
          ? "linear-gradient(180deg, rgba(10,9,8,0.58) 0%, rgba(10,9,8,0.70) 55%, #0A0908 100%)"
          : "linear-gradient(180deg, rgba(250,246,240,0.64) 0%, rgba(250,246,240,0.76) 55%, #FAF6F0 100%)",
        transition: "background 0.45s ease",
      }} />
      {/* Drifting perspective grid */}
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{
        position: "absolute", inset: 0,
        opacity: dark ? 0.07 : 0.05,
      }}>
        <defs>
          <pattern id="lp-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none"
              stroke={dark ? "#F4EFE9" : "#1A120F"} strokeWidth="0.5" />
          </pattern>
        </defs>
        <g style={{ animation: "lpGridDrift 7s linear infinite" }}>
          <rect x="-56" y="-56" width="200%" height="200%" fill="url(#lp-grid)" />
        </g>
      </svg>
    </div>
  );
}

// ── Tech baseline — straight line draws in, node pings at the end ─────────────
function TechLine({ delay = 1.0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <svg ref={ref} viewBox="0 0 300 12" fill="none" preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: 12, overflow: "visible" }}>
      <line x1="2" y1="6" x2="284" y2="6" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"
        style={{
          strokeDasharray: 282, strokeDashoffset: on ? 0 : 282,
          transition: `stroke-dashoffset 1.3s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
        }} />
      <circle cx="292" cy="6" r="4" fill={ACCENT}
        style={{ opacity: on ? 1 : 0, transition: `opacity 0.3s ease ${delay + 1.1}s` }} />
      <circle cx="292" cy="6" r="4" fill="none" stroke={ACCENT} strokeWidth="1"
        style={{
          opacity: on ? 1 : 0,
          transformOrigin: "292px 6px",
          animation: on ? "lpPing 2.4s ease-out infinite" : "none",
          animationDelay: `${delay + 1.2}s`,
        }} />
    </svg>
  );
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
      {[40, 80, 120, 160].map((y, i) => (
        <line key={y} x1="20" y1={y} x2="600" y2={y}
          stroke={faint} strokeWidth="1" strokeDasharray="2 6"
          style={{ opacity: active ? 1 : 0, transition: `opacity 0.8s ease ${0.1 * i}s` }} />
      ))}
      {[["4.0", 34], ["3.0", 74], ["2.0", 114], ["1.0", 154]].map(([t, y], i) => (
        <text key={t} x="0" y={y} fill={dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)"}
          fontSize="9" fontFamily="'JetBrains Mono', monospace"
          style={{ opacity: active ? 1 : 0, transition: `opacity 0.8s ease ${0.1 * i + 0.2}s` }}>{t}</text>
      ))}
      <path d={PATH} stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round"
        style={{
          strokeDasharray: 720, strokeDashoffset: active ? 0 : 720,
          transition: "stroke-dashoffset 2.2s cubic-bezier(0.45, 0, 0.2, 1) 0.5s",
        }} />
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
      <g style={{ opacity: active ? 1 : 0, transition: "opacity 0.6s ease 2.5s" }}>
        <text x="588" y="22" fill={ink} fontSize="11" fontFamily="'JetBrains Mono', monospace" textAnchor="end">3.67 GPA</text>
      </g>
    </svg>
  );
}

// ── Rotating stamp (circular SVG text — de-branded) ───────────────────────────
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
          <textPath href="#lp-circle">DARVIS · COURSE INTELLIGENCE · EST 2025 ·</textPath>
        </text>
      </svg>
      <svg viewBox="0 0 24 24" style={{
        position: "absolute", top: "50%", left: "50%",
        width: 22, height: 22, transform: "translate(-50%, -50%)",
      }}>
        <path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
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

// ── Product previews (inside the showcase window) ─────────────────────────────
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

// ── Auto-cycling product showcase (HUD window) ────────────────────────────────
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
    <div style={{ position: "relative", maxWidth: 680, margin: "0 auto", padding: 14 }}>
      {/* HUD brackets around the window */}
      <Brackets color={ACCENT} size={20} inset={0} opacity={0.7} />
      <div ref={ref}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          width: "100%",
          background: t.card,
          border: `1px solid ${t.line}`,
          borderRadius: 18, overflow: "hidden",
          boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.45)" : "0 24px 80px rgba(26,18,15,0.10)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          boxSizing: "border-box",
        }}>
        {/* Title bar */}
        <div style={{ display: "flex", gap: 4, padding: "12px 14px", borderBottom: `1px solid ${t.lineSoft}`, alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", color: t.textMute, marginRight: 12 }}>DARVIS.SYS</span>
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
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage({ onEnter, darkMode }) {
  const t = palette(darkMode);
  const statsRef = useRef(null);
  const chartRef = useRef(null);
  const parallaxRef = useRef(null);
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

  injectStyles("lp-v7", LP_CSS);

  // Hero photo parallax — photo drifts at 30% of scroll speed
  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        if (parallaxRef.current) {
          parallaxRef.current.style.transform = `translateY(${window.scrollY * 0.28}px)`;
        }
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

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
      backdropFilter: primary ? "none" : "blur(8px)",
      WebkitBackdropFilter: primary ? "none" : "blur(8px)",
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

      {/* Scroll-driven chrome */}
      <ScrollProgress />
      {!isMobile && <DataSpine dark={darkMode} />}

      {/* ── HERO (treated campus photo · parallax · HUD) ─────────────────────── */}
      <section style={{
        minHeight: "calc(100vh - 80px)",
        position: "relative",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <HeroPhoto dark={darkMode} parallaxRef={parallaxRef} />

        <div style={{
          position: "relative", zIndex: 1,
          maxWidth: 1150, margin: "0 auto", padding: pad, width: "100%",
          boxSizing: "border-box",
        }}>
          {/* Headline */}
          <div style={{ marginBottom: 26 }}>
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
            {/* Tech baseline draws in under the headline */}
            <span aria-hidden="true" style={{ display: "block", width: "min(520px, 78%)", marginTop: 18 }}>
              <TechLine delay={1.0} />
            </span>
          </div>

          {/* Sub + CTA */}
          <p className="lp-h-fade dv-d2" style={{
            fontSize: 17, color: t.textSub, lineHeight: 1.7,
            margin: "0 0 38px", fontWeight: 500, maxWidth: 440,
          }}>
            Grade distributions, professor ratings, and a schedule builder — every course, in one quiet place.
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
        </div>

        {/* Rotating stamp — bottom right */}
        {!isMobile && (
          <div className="lp-h-fade dv-d4" style={{ position: "absolute", right: 64, bottom: 48, zIndex: 1 }}>
            <RotatingStamp dark={darkMode} />
          </div>
        )}

        {/* Scroll cue */}
        <div className="lp-h-fade dv-d5" style={{
          position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)",
          zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "2px", color: t.textFaint }}>SCROLL</span>
          <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
            <rect x="1" y="1" width="12" height="20" rx="6" stroke={t.textFaint} strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2" fill={ACCENT}>
              <animate attributeName="cy" values="6;13;6" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
      </section>

      {/* ── DRAWN CHART STRIP ─────────────────────────────────────────────────── */}
      <section ref={chartRef} style={{
        maxWidth: 1150, margin: "0 auto", padding: pad,
        boxSizing: "border-box",
        paddingTop: isMobile ? 48 : 70, paddingBottom: isMobile ? 56 : 90,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "240px 1fr",
          gap: isMobile ? 28 : 64, alignItems: "center",
        }}>
          <div>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
              color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 14,
            }}>CS 3114 · Instructor A</span>
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

      {/* ── MARQUEE (mono HUD strip) ──────────────────────────────────────────── */}
      <div style={{
        overflow: "hidden",
        borderTop: `1px solid ${t.lineSoft}`,
        borderBottom: `1px solid ${t.lineSoft}`,
        padding: "16px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", animation: "lpMarquee 38s linear infinite", width: "max-content" }}>
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center" }}>
              <span style={{
                fontFamily: MONO, fontSize: 12, letterSpacing: "1.5px",
                color: t.textMute, whiteSpace: "nowrap",
              }}>{item}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT, opacity: 0.65, margin: "0 22px" }}>/</span>
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
          Course intelligence · EST 2025
        </span>
      </footer>
    </div>
  );
}
