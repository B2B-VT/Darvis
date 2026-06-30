// Landing Page v7 — "Observatory" · editorial futurism · treated photo hero ·
// scroll-driven SVG · light/dark
import { useState, useEffect, useRef } from "react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/clerk-react";
import { Scribble, Reveal, MONO, SERIF, SANS, ACCENT, COPPER, EASE, palette } from "../theme.jsx";

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
@keyframes lpFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-14px); }
}
@keyframes lpTwinkle {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.25; }
}
@keyframes lpNudge {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(4px); }
}
@keyframes lpStreamY {
  from { transform: translateY(-50%); }
  to   { transform: translateY(0); }
}
@keyframes lpBlink {
  0%, 55%   { opacity: 1; }
  56%, 100% { opacity: 0; }
}
@keyframes lpDotB {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-4px); opacity: 1; }
}
@keyframes lpArrowDrop {
  0%   { opacity: 0.15; transform: translateY(-3px); }
  40%  { opacity: 1; }
  100% { opacity: 0.15; transform: translateY(4px); }
}
.lp-h-clip { overflow: hidden; display: block; }
.lp-h-line { display: block; animation: lpHeroLine 1.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
.lp-h-fade { animation: lpHeroFade 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
.lp-w-clip { display: inline-block; overflow: hidden; vertical-align: bottom;
  padding-bottom: 0.32em; margin-bottom: -0.32em;
  padding-left: 0.24em; margin-left: -0.24em; }
.lp-w { display: inline-block; animation: lpHeroLine 0.95s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* ── Data marquees (fluence-style streams, hover to pause + expand) ── */
@keyframes lpMqLeft  { from { transform: translateX(0); }    to { transform: translateX(-50%); } }
@keyframes lpMqRight { from { transform: translateX(-50%); } to { transform: translateX(0); } }
.lp-mq { position: relative; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
  mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
}
.lp-mq-r { z-index: 2; }
.lp-mq-l { z-index: 1; }
.lp-mq-r:hover { z-index: 2; }
.lp-mq-l:hover { z-index: 6; }
.lp-mq-track { display: flex; width: max-content; padding: 10px 0; }
.lp-mq-r .lp-mq-track { animation: lpMqRight 48s linear infinite; }
.lp-mq-l .lp-mq-track { animation: lpMqLeft 48s linear infinite; }
.lp-mq:hover .lp-mq-track { animation-play-state: paused; }
.lp-card { position: relative; transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease; }
.lp-card:hover { transform: translateY(-5px); border-color: rgba(134,31,65,0.55) !important;
  background: var(--card-solid) !important; z-index: 10; }
.lp-card-more { max-height: 0; opacity: 0; overflow: hidden;
  transition: max-height 0.4s ease, opacity 0.35s ease, margin-top 0.35s ease; }
.lp-card:hover .lp-card-more { max-height: 150px; opacity: 1; margin-top: 12px; }

/* ── Ambient ink streaks idle drift ── */
@keyframes lpStreakDrift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@media (prefers-reduced-motion: reduce) {
  [style*="lpStreakDrift"] { animation: none !important; }
}
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
        // /0.97: complete slightly before absolute bottom so fractional scroll
        // positions and overscroll never leave the spine visibly unfinished
        const p = Math.min(doc.scrollTop / Math.max(doc.scrollHeight - doc.clientHeight, 1) / 0.97, 1);
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
      position: "fixed", right: 20, top: "16vh", bottom: "16vh",
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
function HeroPhoto({ dark }) {
  // backgroundAttachment: fixed keeps the photo stagnant while the page scrolls
  // over it. No CSS filter here — filters break fixed attachment in Chrome.
  const bg = (img, on) => (
    <div key={img} style={{
      position: "absolute", inset: 0,
      backgroundImage: `url(${img})`,
      backgroundSize: "cover", backgroundPosition: "center",
      backgroundAttachment: "fixed",
      opacity: on ? 1 : 0, transition: "opacity 0.6s ease",
    }} />
  );
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
      {bg("images/campus_day.jpg", !dark)}
      {bg("images/campus_night.jpg", dark)}
      {/* Duotone maroon wash */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark ? "rgba(134,31,65,0.12)" : "rgba(134,31,65,0.05)",
        mixBlendMode: dark ? "screen" : "multiply",
      }} />
      {/* Legibility scrim → fades into the page atmosphere at the bottom */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark
          ? "linear-gradient(180deg, rgba(10,9,8,0.50) 0%, rgba(10,9,8,0.62) 55%, #0A0908 100%)"
          : "linear-gradient(180deg, rgba(250,246,240,0.56) 0%, rgba(250,246,240,0.68) 55%, #FAF6F0 100%)",
        transition: "background 0.45s ease",
      }} />
      {/* Drifting perspective grid */}
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{
        position: "absolute", inset: 0,
        opacity: dark ? 0.055 : 0.042,
      }}>
        <defs>
          <pattern id="lp-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none"
              stroke={dark ? "#F4EFE9" : "#1A120F"} strokeWidth="1.2" />
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

// ── Scroll story — chart line draws in as features highlight one by one ───────
// Sticky section: scroll progress scrubs the grade-curve draw on the right and
// drives the feature highlight on the left.
const STORY_CHART = "M20 150 C 90 140, 130 96, 200 104 S 330 70, 400 56 S 520 40, 580 30";
const STORY_FEATURES = [
  ["01", "Grade distributions", "24 years of history. Every section, every term, every grade band."],
  ["02", "Instructor comparison", "Outcomes, ratings, and difficulty side by side."],
  ["03", "Schedule builder", "Conflict-free timetables assembled in seconds."],
  ["04", "Ask anything", "A chatbot that answers in plain English, backed by the data."],
];

function ScrollStory({ dark, t, isMobile, pad }) {
  const wrapRef = useRef(null);
  const lineRef = useRef(null);
  const [active, setActive] = useState(0);
  const faint = dark ? "rgba(244,239,233,0.10)" : "rgba(26,18,15,0.10)";
  const ink = dark ? "rgba(244,239,233,0.8)" : "rgba(26,18,15,0.75)";
  const dots = [{ x: 20, y: 150 }, { x: 200, y: 104 }, { x: 400, y: 56 }, { x: 580, y: 30 }];

  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const el = wrapRef.current, line = lineRef.current;
        if (!el || !line) return;
        const rect = el.getBoundingClientRect();
        const span = Math.max(rect.height - window.innerHeight, 1);
        const p = Math.min(Math.max(-rect.top / span, 0), 1);
        const drawP = Math.min(p / 0.94, 1);
        setActive(Math.min(Math.floor(drawP * 4), 3));
        line.style.strokeDashoffset = String(720 * (1 - drawP));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={wrapRef} style={{ height: isMobile ? "240vh" : "280vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 0, minHeight: "100vh",
        display: "flex", alignItems: "center",
        padding: pad, boxSizing: "border-box",
      }}>
        <div style={{
          maxWidth: 1150, margin: "0 auto", width: "100%",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 400px) 1fr",
          gap: isMobile ? 30 : 70, alignItems: "center",
        }}>
          <div>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
              color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 12,
            }}><KickerDot />Inside Darvis</span>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 400, margin: "0 0 18px",
              fontSize: isMobile ? 26 : 34, letterSpacing: "-0.5px",
              color: t.text, lineHeight: 1.1,
            }}>Follow <span style={{ fontStyle: "italic", color: ACCENT }}>the line.</span></h2>
            {STORY_FEATURES.map(([num, title, desc], i) => {
              const on = i === active;
              return (
                <div key={num} style={{
                  display: "flex", gap: 13, padding: "10px 0 10px 14px",
                  borderLeft: `2px solid ${on ? ACCENT : "transparent"}`,
                  opacity: on ? 1 : 0.32,
                  transform: on ? "translateX(6px)" : "none",
                  transition: "opacity 0.4s ease, transform 0.4s ease, border-color 0.4s ease",
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: on ? ACCENT : t.textMute, paddingTop: 6 }}>{num}</span>
                  <div>
                    <div style={{
                      fontFamily: SERIF, fontSize: isMobile ? 19 : 22, color: t.text, lineHeight: 1.2,
                    }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: t.textMute, lineHeight: 1.55, marginTop: 3 }}>{desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <svg viewBox="0 0 620 180" fill="none" preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
            <g>
              {[40, 80, 120, 160].map(y => (
                <line key={y} x1="20" y1={y} x2="600" y2={y} stroke={faint} strokeWidth="1" strokeDasharray="2 6" />
              ))}
              {[["4.0", 34], ["3.0", 74], ["2.0", 114], ["1.0", 154]].map(([lab, y]) => (
                <text key={lab} x="0" y={y} fill={dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)"}
                  fontSize="9" fontFamily="'JetBrains Mono', monospace">{lab}</text>
              ))}
              <text x="588" y="22" fill={ink} fontSize="11" fontFamily="'JetBrains Mono', monospace" textAnchor="end"
                style={{ opacity: active >= 3 ? 1 : 0, transition: "opacity 0.4s ease" }}>3.67 GPA</text>
            </g>
            <path ref={lineRef} d={STORY_CHART} stroke={ACCENT} strokeWidth="2.5" fill="none"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 720, strokeDashoffset: 720 }} />
            <g>
              {dots.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="5"
                  fill={dark ? "#0A0908" : "#FAF6F0"} stroke={ACCENT} strokeWidth="2.5"
                  style={{
                    opacity: active >= i ? 1 : 0,
                    transition: "opacity 0.35s ease",
                  }} />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </section>
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
      <svg viewBox="0 0 100 100" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        animation: "lpSpinSlow 30s linear infinite reverse",
      }}>
        <circle cx="50" cy="50" r="26" fill="none" stroke={ACCENT}
          strokeWidth="0.8" strokeOpacity="0.5" strokeDasharray="3 6" />
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

function InstructorsPreview({ dark, t }) {
  const profs = [
    { name: "Hamouda",   course: "CS 3114", rating: 4.6, again: 92, gpa: 3.67 },
    { name: "Farghally", course: "CS 3114", rating: 4.3, again: 88, gpa: 3.54 },
    { name: "McQuain",   course: "CS 3114", rating: 3.9, again: 71, gpa: 3.12 },
  ];
  const gpaColor = g => g >= 3.3 ? "#4ade80" : g >= 3.0 ? "#86efac" : g >= 2.7 ? "#fbbf24" : "#f87171";
  return (
    <div>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.lineSoft}` }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "1px", color: t.textMute }}>
          CS 3114 · 6 INSTRUCTORS · SORTED BY OUTCOME
        </span>
      </div>
      {profs.map((p, i) => (
        <div key={i} style={{ padding: "13px 18px", borderBottom: i < profs.length - 1 ? `1px solid ${t.lineSoft}` : "none", display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="17" fill="rgba(134,31,65,0.14)" stroke={ACCENT} strokeOpacity="0.4" strokeWidth="1" />
            <text x="18" y="23" textAnchor="middle" fill={ACCENT} fontSize="12"
              fontFamily="'Instrument Serif', Georgia, serif">{p.name.slice(0, 2).toUpperCase()}</text>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{p.name}</div>
            <div style={{ fontSize: 10.5, fontFamily: MONO, color: t.textMute, letterSpacing: "0.5px", marginTop: 2 }}>
              RATING {p.rating.toFixed(1)} · TAKE AGAIN {p.again}%
            </div>
            <svg width="100%" height="4" style={{ display: "block", borderRadius: 2, marginTop: 6, maxWidth: 180 }} aria-hidden="true">
              <rect x="0" y="0" width="100%" height="4" rx="2" fill={t.lineSoft} />
              <rect x="0" y="0" width={`${p.again}%`} height="4" rx="2" fill={ACCENT} opacity="0.7" />
            </svg>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontFamily: SERIF, color: gpaColor(p.gpa) }}>{p.gpa.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: t.textMute, fontFamily: MONO, letterSpacing: "0.5px" }}>AVG GPA</div>
          </div>
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
    { id: "instructors", label: "Instructors", C: InstructorsPreview },
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

  // rAF-driven cycle timer so the progress bar stays in sync with tab advances
  const [prog, setProg] = useState(0);
  useEffect(() => {
    if (!seen || paused) return;
    let raf, last = performance.now();
    const tick = now => {
      const dt = now - last; last = now;
      setProg(p => p + dt / 4200);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, paused]);
  useEffect(() => {
    if (prog >= 1) { setActive(a => (a + 1) % tabs.length); setProg(0); }
  }, [prog, tabs.length]);

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
        <div style={{ position: "relative", display: "flex", gap: 4, padding: "12px 14px", borderBottom: `1px solid ${t.lineSoft}`, alignItems: "center" }}>
          {/* Cycle progress — fills until the next preview swaps in */}
          <svg aria-hidden="true" width="100%" height="2" style={{ position: "absolute", left: 0, bottom: -1 }}>
            <rect x="0" y="0" width="100%" height="2" fill={ACCENT} opacity="0.8"
              style={{ transform: `scaleX(${Math.min(prog, 1)})`, transformOrigin: "left" }} />
          </svg>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", color: t.textMute, marginRight: 12 }}>DARVIS.SYS</span>
          {tabs.map((tab, i) => (
            <button key={tab.id} onClick={() => { setActive(i); setProg(0); }} style={{
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

// ── Data marquees — two counter-scrolling card streams (all data is fake) ─────
// Top row: example course cards drifting right; hover pauses the stream and the
// card unfolds its grade distribution. Bottom row (slightly overlapping):
// example instructor cards drifting left; hover pauses + reveals their stats.
const FAKE_COURSES = [
  { code: "CSX 2140", title: "Intro to Data Systems",   gpa: 3.42, profs: 5, n: "1,240", dist: [48, 31, 14, 4, 3] },
  { code: "MTH 2210", title: "Discrete Structures",     gpa: 2.91, profs: 7, n: "2,118", dist: [29, 33, 24, 8, 6] },
  { code: "PHY 1850", title: "Mechanics & Waves",       gpa: 3.05, profs: 4, n: "1,876", dist: [35, 32, 21, 7, 5] },
  { code: "ECN 2005", title: "Microeconomics",          gpa: 3.18, profs: 6, n: "2,431", dist: [40, 31, 19, 6, 4] },
  { code: "STA 3100", title: "Applied Statistics",      gpa: 3.33, profs: 3, n: "986",   dist: [45, 30, 17, 5, 3] },
  { code: "CSX 3320", title: "Algorithms II",           gpa: 2.74, profs: 6, n: "1,654", dist: [24, 31, 27, 10, 8] },
  { code: "BIO 1400", title: "Cell Biology",            gpa: 3.21, profs: 5, n: "2,044", dist: [41, 30, 19, 6, 4] },
  { code: "HUM 2200", title: "World Literature",        gpa: 3.61, profs: 2, n: "742",   dist: [58, 27, 11, 2, 2] },
];
const FAKE_PROFS = [
  { name: "Dr. Eleanor Voss",    dept: "CSX", rating: 4.6, diff: 2.8, gpa: 3.41, again: 92 },
  { name: "Prof. Marcus Hale",   dept: "MTH", rating: 4.2, diff: 3.4, gpa: 2.98, again: 81 },
  { name: "Dr. Priya Anand",     dept: "STA", rating: 4.8, diff: 2.5, gpa: 3.52, again: 95 },
  { name: "Prof. Daniel Okafor", dept: "PHY", rating: 3.9, diff: 3.8, gpa: 2.87, again: 74 },
  { name: "Dr. Sofia Marin",     dept: "ECN", rating: 4.4, diff: 2.9, gpa: 3.22, again: 88 },
  { name: "Prof. Theo Lindqvist",dept: "CSX", rating: 4.1, diff: 3.1, gpa: 3.05, again: 79 },
  { name: "Dr. Amara Diallo",    dept: "BIO", rating: 4.7, diff: 2.6, gpa: 3.44, again: 93 },
  { name: "Prof. Ivan Petrov",   dept: "HUM", rating: 4.0, diff: 2.2, gpa: 3.58, again: 85 },
];
const GRADE_COLORS = ["#4ade80", "#93c5fd", "#fbbf24", "#fb923c", "#f87171"];
const GRADE_KEYS = ["A", "B", "C", "D", "F"];

// SVG ring showing GPA out of 4.0
function GpaRing({ gpa, t }) {
  const r = 17, C = 2 * Math.PI * r;
  const col = gpa >= 3.3 ? "#4ade80" : gpa >= 3.0 ? "#86efac" : gpa >= 2.7 ? "#fbbf24" : "#f87171";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke={t.lineSoft} strokeWidth="3" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={col} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={C}
        strokeDashoffset={C * (1 - gpa / 4)}
        transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fill={t.text} fontSize="11.5"
        fontFamily="'Instrument Serif', Georgia, serif">{gpa.toFixed(2)}</text>
    </svg>
  );
}

function CourseCard({ c, t, dark }) {
  return (
    <div className="lp-card" style={{
      width: 318, minHeight: 136, flexShrink: 0, marginRight: 18,
      display: "flex", flexDirection: "column", justifyContent: "center",
      background: t.card, border: `1px solid ${t.line}`,
      "--card-solid": dark ? "#181311" : "#FFFFFF",
      borderRadius: 18, padding: "20px 22px", boxSizing: "border-box",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      boxShadow: dark ? "0 4px 18px rgba(0,0,0,0.25)" : "0 4px 18px rgba(26,18,15,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: ACCENT, letterSpacing: "0.8px" }}>{c.code}</div>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: t.text, marginTop: 5, lineHeight: 1.3 }}>{c.title}</div>
          <div style={{ fontSize: 12, color: t.textMute, marginTop: 4 }}>{c.profs} instructors · {c.n} students</div>
        </div>
        <GpaRing gpa={c.gpa} t={t} />
      </div>
      {/* Unfolds on hover — grade distribution */}
      <div className="lp-card-more">
        <svg width="100%" height="10" style={{ display: "block", borderRadius: 5, overflow: "hidden" }} aria-hidden="true">
          {c.dist.reduce((acc, pct, i) => {
            acc.els.push(
              <rect key={i} x={`${acc.x}%`} y="0" width={`${pct}%`} height="10" fill={GRADE_COLORS[i]} />
            );
            acc.x += pct;
            return acc;
          }, { x: 0, els: [] }).els}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
          {c.dist.map((pct, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 9.5, color: t.textMute }}>
              <span style={{ color: GRADE_COLORS[i] }}>{GRADE_KEYS[i]}</span> {pct}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfCard({ pr, t, dark }) {
  const initials = pr.name.split(" ").slice(-1)[0].slice(0, 2).toUpperCase();
  return (
    <div className="lp-card" style={{
      width: 318, minHeight: 136, flexShrink: 0, marginRight: 18,
      display: "flex", flexDirection: "column", justifyContent: "center",
      background: t.card, border: `1px solid ${t.line}`,
      "--card-solid": dark ? "#181311" : "#FFFFFF",
      borderRadius: 18, padding: "20px 22px", boxSizing: "border-box",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      boxShadow: dark ? "0 4px 18px rgba(0,0,0,0.25)" : "0 4px 18px rgba(26,18,15,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="52" height="52" viewBox="0 0 40 40" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="20" cy="20" r="19" fill="rgba(134,31,65,0.14)" stroke={ACCENT} strokeOpacity="0.4" strokeWidth="1" />
          <text x="20" y="25" textAnchor="middle" fill={ACCENT} fontSize="13"
            fontFamily="'Instrument Serif', Georgia, serif">{initials}</text>
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>{pr.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: t.textMute, letterSpacing: "0.8px", marginTop: 3 }}>{pr.dept} DEPT</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontFamily: SERIF, color: ACCENT }}>{pr.rating.toFixed(1)}</div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: t.textMute, letterSpacing: "0.5px" }}>RATING</div>
        </div>
      </div>
      {/* Unfolds on hover — instructor stats */}
      <div className="lp-card-more">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          {[["AVG GPA", pr.gpa.toFixed(2)], ["DIFFICULTY", pr.diff.toFixed(1)], ["TAKE AGAIN", `${pr.again}%`]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 14, fontFamily: SERIF, color: t.text }}>{v}</div>
              <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.textMute, letterSpacing: "0.5px", marginTop: 1 }}>{k}</div>
            </div>
          ))}
        </div>
        <svg width="100%" height="6" style={{ display: "block", borderRadius: 3 }} aria-hidden="true">
          <rect x="0" y="0" width="100%" height="6" rx="3" fill={t.lineSoft} />
          <rect x="0" y="0" width={`${pr.again}%`} height="6" rx="3" fill={ACCENT} opacity="0.7" />
        </svg>
      </div>
    </div>
  );
}

function DataMarquees({ dark, t }) {
  return (
    <div aria-label="Example of how Darvis displays course and instructor data (sample data)">
      {/* Courses — drift right, hover to pause + unfold grade data */}
      <div className="lp-mq lp-mq-r">
        <div className="lp-mq-track">
          {[...FAKE_COURSES, ...FAKE_COURSES].map((c, i) => (
            <CourseCard key={i} c={c} t={t} dark={dark} />
          ))}
        </div>
      </div>
      {/* Instructors — drift left, slightly overlapping the row above */}
      <div className="lp-mq lp-mq-l" style={{ marginTop: -25 }}>
        <div className="lp-mq-track">
          {[...FAKE_PROFS, ...FAKE_PROFS].map((pr, i) => (
            <ProfCard key={i} pr={pr} t={t} dark={dark} />
          ))}
        </div>
      </div>
      <div style={{
        textAlign: "center", marginTop: 18,
        fontFamily: MONO, fontSize: 9.5, letterSpacing: "1.6px",
        textTransform: "uppercase", color: t.textFaint,
      }}>
        Sample data — hover any card
      </div>
    </div>
  );
}

// ── Floating hero ornaments — plus / circle / asterisk marks (desktop only) ───
function FloatMark({ kind, size }) {
  const s = size;
  if (kind === "plus") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v16M4 12h16" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
  if (kind === "circle") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke={ACCENT} strokeWidth="2.2" />
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HeroOrnaments() {
  const marks = [
    { kind: "plus",     top: "14%", left: "6%",  size: 13, dur: 4.4, delay: 0.0, tw: 3.1 },
    { kind: "asterisk", top: "24%", left: "84%", size: 16, dur: 5.6, delay: 0.8, tw: 4.0 },
    { kind: "circle",   top: "12%", left: "58%", size: 9,  dur: 4.8, delay: 1.6, tw: 3.5 },
    { kind: "plus",     top: "62%", left: "88%", size: 11, dur: 5.2, delay: 0.4, tw: 2.8 },
    { kind: "asterisk", top: "74%", left: "10%", size: 13, dur: 4.6, delay: 2.1, tw: 3.8 },
    { kind: "circle",   top: "48%", left: "4%",  size: 7,  dur: 6.0, delay: 1.2, tw: 4.4 },
    { kind: "plus",     top: "34%", left: "70%", size: 9,  dur: 5.4, delay: 2.6, tw: 3.2 },
    { kind: "circle",   top: "82%", left: "72%", size: 10, dur: 4.2, delay: 0.6, tw: 2.6 },
    { kind: "asterisk", top: "8%",  left: "30%", size: 11, dur: 5.8, delay: 1.9, tw: 4.2 },
  ];
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
      {marks.map((m, i) => (
        <span key={i} style={{
          position: "absolute", top: m.top, left: m.left,
          animation: `lpFloat ${m.dur}s ease-in-out ${m.delay}s infinite`,
          display: "block", lineHeight: 0,
        }}>
          <span style={{ display: "block", lineHeight: 0, animation: `lpTwinkle ${m.tw}s ease-in-out ${m.delay * 0.7}s infinite` }}>
            <FloatMark kind={m.kind} size={m.size} />
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Pulsing kicker dot — solid dot + expanding ping ring ──────────────────────
function KickerDot() {
  return (
    <span aria-hidden="true" style={{
      position: "relative", display: "inline-block",
      width: 6, height: 6, marginRight: 10, verticalAlign: "middle",
    }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: ACCENT,
        animation: "lpPulse 2.2s ease-in-out infinite",
      }} />
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: `1px solid ${ACCENT}`,
        animation: "lpPing 2.2s ease-out infinite",
      }} />
    </span>
  );
}

// ── Scroll cue arrows — cascading downward chevrons, fixed on the right ───────
function ScrollArrows({ dark }) {
  const col = dark ? "rgba(244,239,233,0.5)" : "rgba(26,18,15,0.45)";
  return (
    <div aria-hidden="true" style={{
      position: "fixed", right: 27, top: "50%", transform: "translateY(-50%)",
      zIndex: 5, pointerEvents: "none",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      {[0, 1, 2].map(i => (
        <svg key={i} width="12" height="7" viewBox="0 0 12 7" fill="none"
          style={{ animation: `lpArrowDrop 1.6s ease-in-out ${i * 0.22}s infinite` }}>
          <path d="M1 1l5 5 5-5" stroke={i === 2 ? ACCENT : col}
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

// ── Drifting grid backdrop for sections (same motif as the hero) ──────────────
function SectionGrid({ dark, id }) {
  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style={{
      position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
      opacity: dark ? 0.07 : 0.055,
      WebkitMaskImage: "linear-gradient(180deg, transparent, black 18%, black 82%, transparent)",
      maskImage: "linear-gradient(180deg, transparent, black 18%, black 82%, transparent)",
    }}>
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M 56 0 L 0 0 0 56" fill="none"
            stroke={dark ? "#F4EFE9" : "#1A120F"} strokeWidth="1.2" />
        </pattern>
      </defs>
      <g style={{ animation: "lpGridDrift 7s linear infinite" }}>
        <rect x="-56" y="-56" width="200%" height="200%" fill={`url(#${id})`} />
      </g>
    </svg>
  );
}

// ── Section backdrop — still campus photo + scrim with the drifting grid on top
function SectionBackdrop({ dark, id }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
      {/* Stagnant photo — fixed attachment so content scrolls over it */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${dark ? "images/campus_night.jpg" : "images/campus_day.jpg"})`,
        backgroundSize: "cover", backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }} />
      {/* Duotone maroon wash */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark ? "rgba(134,31,65,0.12)" : "rgba(134,31,65,0.05)",
        mixBlendMode: dark ? "screen" : "multiply",
      }} />
      {/* Heavy scrim, fading to the page background at both edges */}
      <div style={{
        position: "absolute", inset: 0,
        background: dark
          ? "linear-gradient(180deg, #0A0908 0%, rgba(10,9,8,0.82) 28%, rgba(10,9,8,0.82) 72%, #0A0908 100%)"
          : "linear-gradient(180deg, #FAF6F0 0%, rgba(250,246,240,0.86) 28%, rgba(250,246,240,0.86) 72%, #FAF6F0 100%)",
      }} />
      <SectionGrid dark={dark} id={id} />
    </div>
  );
}

// ── Wavy underline that draws in (signal motif for the chat section) ──────────
function WaveLine({ active, delay = 0.2 }) {
  return (
    <svg viewBox="0 0 300 16" fill="none" preserveAspectRatio="none" aria-hidden="true"
      style={{ display: "block", width: "min(360px, 80%)", height: 16, overflow: "visible", marginTop: 16 }}>
      <path d="M2 8 Q 20 1, 38 8 T 74 8 T 110 8 T 146 8 T 182 8 T 218 8 T 254 8 T 290 8"
        stroke={ACCENT} strokeWidth="2" strokeLinecap="round"
        style={{
          strokeDasharray: 330, strokeDashoffset: active ? 0 : 330,
          transition: `stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
        }} />
    </svg>
  );
}

function TypingDots({ t }) {
  return (
    <div style={{
      display: "flex", gap: 4, alignItems: "center", width: "fit-content",
      background: t.input, border: `1px solid ${t.lineSoft}`,
      borderRadius: "14px 14px 14px 4px", padding: "12px 14px",
    }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%", background: ACCENT,
          display: "inline-block", animation: `lpDotB 1.1s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Chatbot section — scroll scrubs through three Q&A exchanges ───────────────
// Sticky section: each third of the scroll shows one exchange (question, then
// typing dots, then the answer) and highlights the matching bullet on the left.
const CHAT_EXCHANGES = [
  {
    q: "What's the GPA like in CS 3114?",
    a: "3.42 average over the last four terms, with Hamouda's sections trending highest.",
    bullet: "Trained on every grade record in the catalog",
  },
  {
    q: "Who should I take for it?",
    a: "Hamouda: 3.67 avg GPA across 459 students and a 2.1% F rate. Farghally is close behind at 3.54.",
    bullet: "Compares instructors and sections instantly",
  },
  {
    q: "Add it to my schedule.",
    a: "Done. CS 3114 with Hamouda, MWF 10:10 to 11:00, no conflicts with your other courses.",
    bullet: "Adds courses to your schedule on request",
  },
];

function ChatSection({ dark, t, isMobile, pad }) {
  const wrapRef = useRef(null);
  // stage = active*3 + phase; phase: 0 question · 1 typing · 2 answer; -1 idle
  const [stage, setStage] = useState(-1);

  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const span = Math.max(rect.height - window.innerHeight, 1);
        const p = Math.min(Math.max(-rect.top / span, 0), 1);
        if (p <= 0.001) { setStage(-1); return; }
        const active = Math.min(Math.floor(p * 3), 2);
        const sub = p * 3 - active;
        const phase = sub < 0.2 ? 0 : sub < 0.5 ? 1 : 2;
        setStage(active * 3 + phase);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const started = stage >= 0;
  const active = started ? Math.floor(stage / 3) : 0;
  const phase = started ? stage % 3 : -1;
  const ex = CHAT_EXCHANGES[active];

  const bubble = (text, role, on, typing, key) => (
    <div key={key} style={{
      display: "flex", justifyContent: role === "user" ? "flex-end" : "flex-start",
      opacity: on ? 1 : 0, transform: on ? "none" : "translateY(12px)",
      transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)",
    }}>
      {typing ? <TypingDots t={t} /> : (
        <div style={{
          maxWidth: "82%",
          background: role === "user" ? ACCENT : t.input,
          border: role === "user" ? "none" : `1px solid ${t.lineSoft}`,
          color: role === "user" ? "white" : t.text,
          borderRadius: role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          padding: "10px 14px", fontSize: 12.5, lineHeight: 1.55, fontWeight: 500,
        }}>{text}</div>
      )}
    </div>
  );

  return (
    <section ref={wrapRef} style={{ height: isMobile ? "240vh" : "280vh", position: "relative" }}>
    <div style={{
      position: "sticky", top: 0, minHeight: "100vh",
      display: "flex", alignItems: "center",
      maxWidth: 1150, margin: "0 auto", padding: pad, boxSizing: "border-box",
    }}>
      {!isMobile && (
        <div aria-hidden="true" style={{ position: "absolute", top: "8%", left: "46%", animation: "lpFloat 5.2s ease-in-out 0.5s infinite", pointerEvents: "none" }}>
          <span style={{ display: "block", lineHeight: 0, animation: "lpTwinkle 3.6s ease-in-out infinite" }}>
            <FloatMark kind="asterisk" size={13} />
          </span>
        </div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1.05fr",
        gap: isMobile ? 36 : 72, alignItems: "center",
      }}>
        <div>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
            color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 14,
          }}><KickerDot />Ask Darvis</span>
          <h2 style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(30px, 3.6vw, 48px)", letterSpacing: "-0.5px",
            color: t.text, lineHeight: 1.1,
          }}>Answers, <span style={{ fontStyle: "italic", color: ACCENT }}>not spreadsheets.</span></h2>
          <WaveLine active={started} delay={0.1} />
          <p style={{ fontSize: 15.5, color: t.textSub, lineHeight: 1.7, margin: "20px 0 6px", fontWeight: 500, maxWidth: 420 }}>
            Every grade record, instructor rating, and section time, queryable in plain
            English. Keep scrolling to watch a conversation unfold.
          </p>
          {CHAT_EXCHANGES.map((e2, i) => {
            const done = started && i <= active;
            const on = started && i === active;
            return (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "center", marginTop: 13,
                paddingLeft: 12, borderLeft: `2px solid ${on ? ACCENT : "transparent"}`,
                opacity: on ? 1 : done ? 0.6 : 0.3,
                transform: on ? "translateX(4px)" : "none",
                transition: "opacity 0.4s ease, transform 0.4s ease, border-color 0.4s ease",
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1.5" />
                  <path d="M7 12.5l3.2 3L17 9" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      strokeDasharray: 16, strokeDashoffset: done ? 0 : 16,
                      transition: "stroke-dashoffset 0.45s ease 0.1s",
                    }} />
                </svg>
                <span style={{ fontSize: 14, color: t.textSub, fontWeight: 500 }}>{e2.bullet}</span>
              </div>
            );
          })}
        </div>

        {/* Chat window in HUD frame */}
        <div style={{ position: "relative", padding: 14 }}>
          <Brackets color={ACCENT} size={20} inset={0} opacity={0.7} />
          <div style={{
            background: t.card, border: `1px solid ${t.line}`,
            borderRadius: 18, overflow: "hidden",
            boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.45)" : "0 24px 80px rgba(26,18,15,0.10)",
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${t.lineSoft}` }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "#4ade80",
                animation: "lpPulse 2s ease-in-out infinite",
              }} />
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", color: t.textMute }}>DARVIS.AI · ONLINE</span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 9.5, letterSpacing: "1px", color: t.textFaint }}>
                QUERY 0{active + 1}/03
              </span>
            </div>
            <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 190 }}>
              {bubble(ex.q, "user", started, false, `q${active}`)}
              {bubble(ex.a, "bot", started && phase >= 1, phase === 1, `a${active}`)}
            </div>
            <div style={{ borderTop: `1px solid ${t.lineSoft}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                flex: 1, display: "flex", alignItems: "center", height: 38,
                background: t.input, border: `1px solid ${t.lineSoft}`,
                borderRadius: 999, padding: "0 16px", fontSize: 12.5, color: t.textMute,
              }}>
                Ask about any course
                <span style={{ width: 1.5, height: 14, background: ACCENT, marginLeft: 6, animation: "lpBlink 1.1s steps(1) infinite" }} />
              </span>
              <span style={{ position: "relative", width: 38, height: 38, flexShrink: 0 }}>
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  border: `1px solid ${ACCENT}`, animation: "lpPing 2.6s ease-out infinite",
                }} />
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%", background: ACCENT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 19V5M6 11l6-6 6 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </section>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
// ── Ink streaks — fixed ambient field, parallax + scroll-velocity reactive ────
// Desktop-only atmospheric back layer (sits at z:-1 inside the isolated root).
// Thin maroon/copper ticks drift on scroll; fast scrolling stretches them.
// Honors prefers-reduced-motion (no JS reaction + CSS idle drift disabled).
function InkStreaks({ dark }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = ref.current;
    if (!layer) return;
    let raf = null, lastY = window.scrollY;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const y = window.scrollY;
        const vel = Math.max(-1, Math.min(1, (y - lastY) / 60));
        lastY = y;
        const kids = layer.children;
        for (let i = 0; i < kids.length; i++) {
          const depth = 0.1 + (i % 5) * 0.05;
          const ty = -((y * depth) % 260);
          const sy = (1 + Math.abs(vel) * 0.45).toFixed(3);
          kids[i].style.transform =
            `translateY(${ty.toFixed(1)}px) scaleY(${sy}) skewX(${(vel * 4).toFixed(2)}deg)`;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const cols = 7, rows = 3;
  return (
    <div ref={ref} aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden",
    }}>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const copper = i % 3 === 0;
        const c = copper
          ? (dark ? "rgba(199,123,63,0.18)" : "rgba(199,123,63,0.13)")
          : (dark ? "rgba(134,31,65,0.20)" : "rgba(134,31,65,0.12)");
        return (
          <span key={i} style={{
            position: "absolute",
            left: `${(col + 0.5) * (100 / cols)}%`,
            top: `${row * 36 + (col % 2) * 10}%`,
            width: 1, height: 34 + (i % 4) * 20,
            background: `linear-gradient(${c}, transparent)`,
            transformOrigin: "top center",
            animation: `lpStreakDrift ${7 + (i % 5)}s ease-in-out ${(i * 0.2).toFixed(1)}s infinite`,
          }} />
        );
      })}
    </div>
  );
}

// ── Topographic contour lines — parallax drift behind a section ───────────────
function TopoLines({ dark }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = ref.current;
    if (!host) return;
    const paths = host.querySelectorAll("path");
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = host.getBoundingClientRect();
        const p = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        paths.forEach((pa, i) => {
          const rate = 26 + i * 18;
          pa.style.transform =
            `translate(${((p - 0.5) * rate).toFixed(1)}px, ${((p - 0.5) * rate * 0.4).toFixed(1)}px)`;
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const s1 = dark ? "rgba(134,31,65,0.20)" : "rgba(134,31,65,0.12)";
  const s2 = dark ? "rgba(199,123,63,0.16)" : "rgba(199,123,63,0.10)";
  return (
    <div ref={ref} aria-hidden="true" style={{
      position: "absolute", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none",
    }}>
      <svg viewBox="0 0 1200 400" preserveAspectRatio="none"
        style={{ position: "absolute", inset: "-12% -7%", width: "114%", height: "124%" }}>
        <path d="M-60 120 C 200 80, 360 165, 620 110 S 1050 55, 1280 122" fill="none" stroke={s1} strokeWidth="1.2" style={{ transition: "transform 0.15s linear" }} />
        <path d="M-60 215 C 220 178, 430 262, 645 208 S 1040 168, 1280 220" fill="none" stroke={s2} strokeWidth="1.2" style={{ transition: "transform 0.15s linear" }} />
        <path d="M-60 312 C 180 286, 380 352, 665 300 S 1060 268, 1280 318" fill="none" stroke={s1} strokeWidth="1" style={{ transition: "transform 0.15s linear" }} />
      </svg>
    </div>
  );
}

// ── DataViz — sticky scroll-scrub: grade-trend line self-plots (left) and a GPA
//    gauge sweeps 0 → 4.00 (right). One scroll progress drives both via refs
//    (no per-frame React state). Honors prefers-reduced-motion (jumps to final).
const DV_TREND = "M30 165 L120 150 L210 158 L300 120 L390 132 L480 92 L570 104 L660 64 L740 72";
const DV_PTS = [[30,165],[120,150],[210,158],[300,120],[390,132],[480,92],[570,104],[660,64],[740,72]];
const DV_LEN = 780;
const DV_ARC = 293;
function DataViz({ dark, t, isMobile, pad }) {
  const wrapRef = useRef(null);
  const lineRef = useRef(null);
  const areaRef = useRef(null);
  const arcRef = useRef(null);
  const needleRef = useRef(null);
  const marksRef = useRef(null);
  const gpaRef = useRef(null);

  useEffect(() => {
    const apply = (p) => {
      if (lineRef.current) lineRef.current.style.strokeDashoffset = String(DV_LEN * (1 - p));
      if (areaRef.current) areaRef.current.style.opacity = String(Math.max(0, (p - 0.1) / 0.9));
      if (arcRef.current) arcRef.current.style.strokeDashoffset = String(DV_ARC * (1 - p));
      if (needleRef.current) needleRef.current.style.transform = `rotate(${(-120 + p * 240).toFixed(1)}deg)`;
      const mk = marksRef.current && marksRef.current.children;
      if (mk) for (let i = 0; i < mk.length; i++) mk[i].style.opacity = p >= i / (DV_PTS.length - 1) ? "1" : "0";
      if (gpaRef.current) gpaRef.current.textContent = (p * 4).toFixed(2);
    };
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(1); return;
    }
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const span = Math.max(rect.height - window.innerHeight, 1);
        const p = Math.min(Math.max(-rect.top / span, 0), 1);
        apply(Math.min(p / 0.92, 1));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const faint = dark ? "rgba(244,239,233,0.10)" : "rgba(26,18,15,0.10)";
  const axis = dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)";

  return (
    <section ref={wrapRef} style={{ height: isMobile ? "200vh" : "240vh", position: "relative" }}>
      <div style={{
        position: "sticky", top: 0, minHeight: "100vh",
        display: "flex", alignItems: "center", padding: pad, boxSizing: "border-box",
      }}>
        <div style={{ maxWidth: 1150, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 30 : 48 }}>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
              color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 14,
            }}><KickerDot />By the numbers</span>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 400, margin: 0,
              fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.5px",
              color: t.text, lineHeight: 1.1,
            }}>Watch the curve <span style={{ fontStyle: "italic", color: ACCENT }}>draw itself.</span></h2>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.35fr 1fr",
            gap: isMobile ? 44 : 64, alignItems: "center",
          }}>
            {/* Self-plotting trend chart */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", color: t.textMute, textTransform: "uppercase", marginBottom: 14 }}>
                Average GPA by year
              </div>
              <svg viewBox="0 0 780 200" fill="none" preserveAspectRatio="xMidYMid meet"
                style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
                <defs>
                  <linearGradient id="dv-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COPPER} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={COPPER} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[40, 80, 120, 160].map(y => (
                  <line key={y} x1="30" y1={y} x2="750" y2={y} stroke={faint} strokeWidth="1" strokeDasharray="2 6" />
                ))}
                {[["4.0", 44], ["3.0", 84], ["2.0", 124], ["1.0", 164]].map(([lab, y]) => (
                  <text key={lab} x="0" y={y} fill={axis} fontSize="9" fontFamily="'JetBrains Mono', monospace">{lab}</text>
                ))}
                <path ref={areaRef} d={`${DV_TREND} L740 190 L30 190 Z`} fill="url(#dv-area)" style={{ opacity: 0 }} />
                <path ref={lineRef} d={DV_TREND} stroke={ACCENT} strokeWidth="2.5" fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ strokeDasharray: DV_LEN, strokeDashoffset: DV_LEN }} />
                <g ref={marksRef}>
                  {DV_PTS.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="4.5"
                      fill={dark ? "#0A0908" : "#FAF6F0"} stroke={ACCENT} strokeWidth="2.5"
                      style={{ opacity: 0, transition: "opacity 0.3s ease" }} />
                  ))}
                </g>
              </svg>
            </div>

            {/* Scroll-scrubbed GPA gauge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px", color: t.textMute, textTransform: "uppercase", marginBottom: 6 }}>
                Typical course GPA
              </div>
              <svg viewBox="0 0 200 150" style={{ width: isMobile ? 220 : 260, maxWidth: "100%", overflow: "visible" }}>
                <defs>
                  <linearGradient id="dv-arc" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={ACCENT} />
                    <stop offset="100%" stopColor={COPPER} />
                  </linearGradient>
                </defs>
                <path d="M39.4 135 A70 70 0 1 1 160.6 135" fill="none" stroke={faint} strokeWidth="10" strokeLinecap="round" />
                <path ref={arcRef} d="M39.4 135 A70 70 0 1 1 160.6 135" fill="none"
                  stroke="url(#dv-arc)" strokeWidth="10" strokeLinecap="round"
                  style={{ strokeDasharray: DV_ARC, strokeDashoffset: DV_ARC }} />
                {[0, 1, 2, 3, 4].map(n => {
                  const a = (210 - n * 60) * Math.PI / 180;
                  return (
                    <line key={n}
                      x1={100 + 58 * Math.cos(a)} y1={100 - 58 * Math.sin(a)}
                      x2={100 + 68 * Math.cos(a)} y2={100 - 68 * Math.sin(a)}
                      stroke={axis} strokeWidth="1.4" />
                  );
                })}
                <line ref={needleRef} x1="100" y1="100" x2="100" y2="46"
                  stroke={t.text} strokeWidth="2.5" strokeLinecap="round"
                  style={{ transformBox: "view-box", transformOrigin: "100px 100px", transform: "rotate(-120deg)", transition: "transform 0.1s linear" }} />
                <circle cx="100" cy="100" r="5" fill={ACCENT} />
                <text ref={gpaRef} x="100" y="90" textAnchor="middle" fill={t.text}
                  fontFamily="'Instrument Serif', Georgia, serif" fontSize="34">0.00</text>
                <text x="100" y="114" textAnchor="middle" fill={t.textMute}
                  fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.5">/ 4.00</text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage({ onEnter, onNavigate, darkMode }) {
  const t = palette(darkMode);
  const statsRef = useRef(null);
  const [statsActive, setStatsActive] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  injectStyles("lp-v7", LP_CSS);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsActive(true); }, { threshold: 0.3 });
    if (statsRef.current) obs.observe(statsRef.current);
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

  const Btn = ({ label, primary, onClick }) => {
    const hasArrow = label.endsWith("→");
    const text = hasArrow ? label.slice(0, -1).trimEnd() : label;
    return (
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
    >{hasArrow ? (
      <>
        {text}{" "}
        <span style={{ display: "inline-block", animation: "lpNudge 1.5s ease-in-out infinite" }}>→</span>
      </>
    ) : label}</button>
    );
  };

  const pad = isMobile ? "0 22px" : "0 64px";

  return (
    <div style={{ position: "relative", isolation: "isolate", fontFamily: SANS, color: t.text }}>

      {/* Scroll-driven chrome */}
      <ScrollProgress />
      {!isMobile && <InkStreaks dark={darkMode} />}
      {!isMobile && <DataSpine dark={darkMode} />}
      {!isMobile && <ScrollArrows dark={darkMode} />}

      {/* ── HERO (treated campus photo · parallax · HUD) ─────────────────────── */}
      <section style={{
        minHeight: "calc(100vh - 80px)",
        position: "relative",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <HeroPhoto dark={darkMode} />
        {!isMobile && <HeroOrnaments />}

        <div style={{
          position: "relative", zIndex: 1,
          maxWidth: 1150, margin: "0 auto", padding: pad, width: "100%",
          boxSizing: "border-box",
        }}>
          {/* Headline — words rise one by one */}
          <div style={{ marginBottom: 26 }}>
            <span style={{
              display: "block",
              fontSize: "clamp(56px, 9vw, 124px)", fontWeight: 400,
              fontFamily: SERIF, lineHeight: 1.0, letterSpacing: "-2px", color: t.text,
            }}>
              {"The data behind".split(" ").map((w, i) => (
                <span key={i} className="lp-w-clip">
                  <span className="lp-w" style={{ animationDelay: `${i * 0.08}s` }}>{w}&nbsp;</span>
                </span>
              ))}
            </span>
            <span style={{
              display: "block",
              fontSize: "clamp(56px, 9vw, 124px)", fontWeight: 400,
              fontFamily: SERIF, fontStyle: "italic",
              lineHeight: 1.0, letterSpacing: "-2px", color: ACCENT,
            }}>
              {"every grade.".split(" ").map((w, i) => (
                <span key={i} className="lp-w-clip">
                  <span className="lp-w" style={{ animationDelay: `${(i + 3) * 0.08}s` }}>{w}&nbsp;</span>
                </span>
              ))}
            </span>
            {/* Tech baseline draws in under the headline */}
            <span aria-hidden="true" style={{ display: "block", width: "min(520px, 78%)", marginTop: 28 }}>
              <TechLine delay={1.0} />
            </span>
          </div>

          {/* Sub + CTA */}
          <p className="lp-h-fade dv-d2" style={{
            fontSize: 17, color: t.textSub, lineHeight: 1.7,
            margin: "0 0 38px", fontWeight: 500, maxWidth: 440,
          }}>
            Grade distributions, professor ratings, and a schedule builder, every course, in one quiet place.
          </p>

          <div className="lp-h-fade dv-d3">
            <SignedIn>
              <Btn label="Browse courses →" primary onClick={onEnter} />
            </SignedIn>
            <SignedOut>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <SignUpButton mode="modal">
                  <Btn label="Join the waitlist →" primary />
                </SignUpButton>
                <Btn label="Browse courses" onClick={onEnter} />
              </div>
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

      {/* ── DATA MARQUEES — counter-scrolling course + instructor streams ────── */}
      <section style={{ paddingTop: isMobile ? 40 : 64, paddingBottom: isMobile ? 48 : 72, position: "relative" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 30, padding: pad }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
            color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 14,
          }}><KickerDot />Inside the catalog</span>
          <h2 style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(28px, 3.2vw, 42px)", letterSpacing: "-0.5px",
            color: t.text, lineHeight: 1.1,
          }}>Every course. Every instructor. <span style={{ fontStyle: "italic", color: ACCENT }}>One glance.</span></h2>
        </Reveal>
        <DataMarquees dark={darkMode} t={t} />
      </section>

      {/* ── SCROLL STORY — features + chart line that morphs into DARVIS ─────── */}
      <ScrollStory dark={darkMode} t={t} isMobile={isMobile} pad={pad} />

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
        maxWidth: 1150, margin: "0 auto", position: "relative",
        padding: pad, boxSizing: "border-box",
        paddingTop: isMobile ? 56 : 90, paddingBottom: isMobile ? 56 : 90,
      }}>
        {!isMobile && <TopoLines dark={darkMode} />}
        <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 36 : 0 }}>
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

      {/* ── DATA VIZ — sticky scrub: trend line self-plots + GPA gauge sweeps ─── */}
      <DataViz dark={darkMode} t={t} isMobile={isMobile} pad={pad} />

      {/* ── SHOWCASE ──────────────────────────────────────────────────────────── */}
      <section style={{
        padding: pad, boxSizing: "border-box",
        paddingTop: isMobile ? 48 : 72,
        paddingBottom: isMobile ? 72 : 120, position: "relative",
      }}>
        <SectionBackdrop dark={darkMode} id="lp-grid-sc" />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1150, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 44 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", fontFamily: MONO,
            color: ACCENT, textTransform: "uppercase", display: "block", marginBottom: 16,
          }}><KickerDot />One quiet workspace</span>
          <h2 style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(30px, 3.6vw, 48px)", letterSpacing: "-0.5px",
            color: t.text, lineHeight: 1.1,
          }}>Courses, schedule, <span style={{ fontStyle: "italic", color: ACCENT }}>instructors.</span></h2>
        </Reveal>
        <Reveal delay={0.12}>
          <Showcase dark={darkMode} t={t} />
        </Reveal>
        </div>
      </section>

      {/* ── CHATBOT — scripted conversation plays on scroll ──────────────────── */}
      <ChatSection dark={darkMode} t={t} isMobile={isMobile} pad={pad} />

      {/* ── MANIFESTO / CTA ───────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${t.lineSoft}`,
        padding: isMobile ? "88px 22px" : "150px 64px",
        textAlign: "center", position: "relative",
      }}>
        <SectionBackdrop dark={darkMode} id="lp-grid-cta" />
        <div style={{ position: "relative", zIndex: 1 }}>
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
              <SignUpButton mode="modal">
                <Btn label="Join the waitlist →" primary />
              </SignUpButton>
            )}
          </SignedOut>
        </Reveal>
        </div>
      </section>

      {/* ── FOOTER (carries the former About page) ────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${t.lineSoft}`, padding: isMobile ? "48px 22px 26px" : "72px 64px 30px" }}>
        <div style={{
          maxWidth: 1150, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 0.8fr",
          gap: isMobile ? 36 : 72,
        }}>
          {/* About */}
          <Reveal>
            <div style={{ fontFamily: SERIF, fontSize: 26, color: t.text, marginBottom: 14 }}>
              Built by a student, <span style={{ fontStyle: "italic", color: ACCENT }}>for students.</span>
            </div>
            <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.75, margin: 0, fontWeight: 500, maxWidth: 420 }}>
              Darvis started as a frustration, bouncing between spreadsheets, rating
              sites, and timetables just to pick classes. It pulls historical grade
              distributions, professor insight, and schedule planning into one quiet
              place, so course decisions come from evidence instead of guesswork.
            </p>
          </Reveal>

          {/* Data sources */}
          <Reveal delay={0.08}>
            <div style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: "1.8px",
              textTransform: "uppercase", color: ACCENT, marginBottom: 16,
            }}>Data sources</div>
            {[
              ["Grade distributions", "Publicly released university grade records"],
              ["Professor ratings", "Aggregated student review platforms"],
              ["Timetable & sections", "Live course catalog each semester"],
            ].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 13 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{k}</div>
                <div style={{ fontSize: 12, color: t.textMute, marginTop: 2, lineHeight: 1.5 }}>{v}</div>
              </div>
            ))}
          </Reveal>

          {/* Explore */}
          <Reveal delay={0.16}>
            <div style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: "1.8px",
              textTransform: "uppercase", color: ACCENT, marginBottom: 16,
            }}>Explore</div>
            {[
              ["Browse courses", () => onEnter?.()],
              ["FAQs", () => onNavigate?.("faqs")],
              ["Forums", () => onNavigate?.("forums")],
              ["Schedule builder", () => onNavigate?.("schedule")],
            ].map(([label, go]) => (
              <button key={label} onClick={go} style={{
                display: "block", background: "none", border: "none", padding: "5px 0",
                fontSize: 13.5, fontWeight: 500, color: t.textSub, cursor: "pointer",
                fontFamily: SANS, textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={e => { e.currentTarget.style.color = t.textSub; }}
              >{label} →</button>
            ))}
          </Reveal>
        </div>

        {/* Bottom rail */}
        <div style={{
          maxWidth: 1150, margin: "0 auto",
          borderTop: `1px solid ${t.lineSoft}`,
          marginTop: isMobile ? 36 : 56, paddingTop: 22,
          display: "flex", flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between", alignItems: "center", gap: isMobile ? 8 : 0,
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 16, color: t.textSub }}>Darvis</span>
          <span style={{ fontSize: 10, color: t.textFaint, fontFamily: MONO, letterSpacing: "1px", textTransform: "uppercase", textAlign: "center" }}>
            Course intelligence · EST 2025 · Not affiliated with any university
          </span>
        </div>
      </footer>
    </div>
  );
}
