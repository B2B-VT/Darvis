// Landing Page v8 — "Minimal Pro" · Linear/Vercel aesthetic · clean glass surfaces
// Professional minimal macOS-DNA — generous whitespace, strong typography hierarchy
import { useState, useEffect, useRef } from "react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/clerk-react";
import { Scribble, Reveal, MONO, SERIF, SANS, ACCENT, EASE, palette, glassCard, RADIUS, SHADOW } from "../theme.jsx";

// ── Page-scoped CSS ───────────────────────────────────────────────────────────
const LP_CSS = `
@keyframes lpHeroFade { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
@keyframes lpMqLeft { from { transform:translateX(0); } to { transform:translateX(-50%); } }
@keyframes lpMqRight { from { transform:translateX(-50%); } to { transform:translateX(0); } }
.lp-mq { position:relative; overflow:hidden; -webkit-mask-image:linear-gradient(90deg,transparent,black 7%,black 93%,transparent); mask-image:linear-gradient(90deg,transparent,black 7%,black 93%,transparent); }
.lp-mq-track { display:flex; width:max-content; padding:8px 0; }
.lp-mq-r .lp-mq-track { animation:lpMqRight 52s linear infinite; }
.lp-mq-l .lp-mq-track { animation:lpMqLeft 52s linear infinite; }
.lp-mq:hover .lp-mq-track { animation-play-state:paused; }
.lp-card { transition:transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease, border-color 0.25s ease; }
.lp-card:hover { transform:translateY(-3px); }
@media (prefers-reduced-motion:reduce) { .lp-mq-track { animation:none !important; } }
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

// ── Marquee data ──────────────────────────────────────────────────────────────
const FAKE_COURSES = [
  { code: "CS 2114",   title: "Data Structures & OO",     gpa: 3.28, term: "Sp 2025" },
  { code: "MATH 2224", title: "Multivariable Calculus",    gpa: 2.78, term: "Sp 2025" },
  { code: "PHYS 2305", title: "Foundations of Physics",    gpa: 3.05, term: "Sp 2025" },
  { code: "ECE 2504",  title: "Intro to Computer Engr",    gpa: 3.15, term: "Fa 2024" },
  { code: "CS 3114",   title: "Data Structures & Alg",     gpa: 2.91, term: "Fa 2024" },
  { code: "BIOL 2104", title: "Principles of Biology",     gpa: 3.21, term: "Sp 2025" },
  { code: "CS 4664",   title: "Capstone Machine Learning", gpa: 3.38, term: "Sp 2025" },
  { code: "STAT 3704", title: "Applied Regression",        gpa: 3.44, term: "Fa 2024" },
];

const FAKE_PROFS = [
  { name: "Dr. E. Voss",        dept: "CS",   rating: 4.6, gpa: 3.41, term: "Sp 2025" },
  { name: "Prof. M. Hale",      dept: "MATH", rating: 4.2, gpa: 2.98, term: "Fa 2024" },
  { name: "Dr. P. Anand",       dept: "STAT", rating: 4.8, gpa: 3.52, term: "Sp 2025" },
  { name: "Prof. D. Okafor",    dept: "PHYS", rating: 3.9, gpa: 2.87, term: "Fa 2024" },
  { name: "Dr. S. Marin",       dept: "ECE",  rating: 4.4, gpa: 3.22, term: "Sp 2025" },
  { name: "Prof. T. Lindqvist", dept: "CS",   rating: 4.1, gpa: 3.05, term: "Fa 2024" },
  { name: "Dr. A. Diallo",      dept: "BIOL", rating: 4.7, gpa: 3.44, term: "Sp 2025" },
  { name: "Prof. I. Petrov",    dept: "HIST", rating: 4.0, gpa: 3.58, term: "Fa 2024" },
];

// ── Clean marquee cards ───────────────────────────────────────────────────────
function CourseCard({ c, dark }) {
  const p = palette(dark);
  return (
    <div className="lp-card" style={{
      ...glassCard(dark),
      borderRadius: RADIUS.md,
      padding: "10px 14px",
      marginRight: 10,
      minWidth: 180,
      cursor: "default",
      flexShrink: 0,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 600 }}>{c.code}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: p.text, marginTop: 2, lineHeight: 1.3, maxWidth: 160 }}>{c.title}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: p.text, fontWeight: 700, marginTop: 6 }}>{c.gpa.toFixed(2)} GPA</div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: p.textMute, marginTop: 2 }}>{c.term}</div>
    </div>
  );
}

function ProfCard({ pr, dark }) {
  const p = palette(dark);
  return (
    <div className="lp-card" style={{
      ...glassCard(dark),
      borderRadius: RADIUS.md,
      padding: "10px 14px",
      marginRight: 10,
      minWidth: 180,
      cursor: "default",
      flexShrink: 0,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 600 }}>{pr.dept}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: p.text, marginTop: 2 }}>{pr.name}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: p.text, fontWeight: 700, marginTop: 6 }}>{pr.rating.toFixed(1)} rating</div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: p.textMute, marginTop: 2 }}>{pr.gpa.toFixed(2)} avg GPA</div>
    </div>
  );
}

function DataMarquees({ dark }) {
  return (
    <div aria-label="Example of how Darvis displays course and instructor data (sample data)">
      <div className="lp-mq lp-mq-r">
        <div className="lp-mq-track">
          {[...FAKE_COURSES, ...FAKE_COURSES].map((c, i) => (
            <CourseCard key={i} c={c} dark={dark} />
          ))}
        </div>
      </div>
      <div className="lp-mq lp-mq-l" style={{ marginTop: 10 }}>
        <div className="lp-mq-track">
          {[...FAKE_PROFS, ...FAKE_PROFS].map((pr, i) => (
            <ProfCard key={i} pr={pr} dark={dark} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Grade distributions",
    body: "Every section graded at VT from 2001 to present. Filter by term, professor, and course to see exactly where grades land.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Professor comparison",
    body: "Average GPA, student ratings, difficulty, and take-again percentages for every instructor — side by side.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: "Schedule builder",
    body: "Build a conflict-free Fall 2026 timetable. Add courses, swap sections, and plan your semester in seconds.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    title: "AI advisor",
    body: "Ask anything in plain English. \"Who should I take for CS 3114?\" gets a data-backed answer instantly.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
    title: "Course browser",
    body: "Search all 3,564 VT courses. Filter by department, GPA range, number of instructors, and more.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
      </svg>
    ),
    title: "Outcome trends",
    body: "See how a course's average GPA has shifted over time. Spot grade inflation, curriculum changes, and instructor effects.",
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "Is Darvis free to use?",
    a: "Yes, completely free. Grade data, professor ratings, the schedule builder, and the AI chatbot are all included with every account.",
  },
  {
    q: "Where does the grade data come from?",
    a: "Grade distributions are sourced from Virginia Tech's University Data Commons (UDC) — the same public records VT releases each semester. We parse, structure, and make them searchable.",
  },
  {
    q: "How current is the course data?",
    a: "Schedule sections are current for Fall 2026 (term 202609). Grade history covers 2001 to Spring 2025 for CS, with additional departments being added.",
  },
  {
    q: "What can the AI chatbot actually do?",
    a: "Ask it anything — \"Which professor grades easiest in CS 3114?\", \"What's the average GPA for MATH 2224?\", or \"Add CS 3114 with Hamouda to my schedule.\" It answers in plain English backed by real grade data.",
  },
  {
    q: "Is this affiliated with Virginia Tech?",
    a: "No. Darvis is an independent student-built tool using publicly available data. We are not officially affiliated with Virginia Tech or any other institution.",
  },
];

function FaqItem({ item, dark }) {
  const [open, setOpen] = useState(false);
  const p = palette(dark);
  return (
    <div style={{
      ...glassCard(dark),
      borderRadius: RADIUS.md,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none", padding: "16px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          cursor: "pointer", textAlign: "left", gap: 12,
        }}
      >
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: p.text, lineHeight: 1.4 }}>
          {item.q}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={p.textMute} strokeWidth="2" strokeLinecap="round"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.25s ease" }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 20px 16px", fontFamily: SANS, fontSize: 14, color: p.textSub, lineHeight: 1.7 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage({ onEnter, onNavigate, darkMode }) {
  const p = palette(darkMode);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  injectStyles("lp-v8", LP_CSS);

  const STATS = [
    { num: "3,564",    label: "courses indexed" },
    { num: "210",      label: "instructors" },
    { num: "Fall 2026",label: "sections ready" },
    { num: "AI",       label: "powered advisor" },
  ];

  const ctr = { maxWidth: 1080, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
  const secPadV = isMobile ? 48 : 80;

  // Primary button style + handlers
  const primaryBtn = {
    background: ACCENT, color: "#fff", border: "none",
    borderRadius: RADIUS.pill, padding: "13px 28px",
    fontFamily: SANS, fontWeight: 600, fontSize: 15, cursor: "pointer",
    boxShadow: `0 2px 18px rgba(134,31,65,0.30), ${SHADOW.md}`,
    transition: `background 0.2s ${EASE}, transform 0.2s ${EASE}, box-shadow 0.2s ease`,
  };
  const primaryHover = e => {
    e.currentTarget.style.background = "#9B2950";
    e.currentTarget.style.transform = "translateY(-1px)";
    e.currentTarget.style.boxShadow = "0 6px 24px rgba(134,31,65,0.42)";
  };
  const primaryLeave = e => {
    e.currentTarget.style.background = ACCENT;
    e.currentTarget.style.transform = "none";
    e.currentTarget.style.boxShadow = `0 2px 18px rgba(134,31,65,0.30), ${SHADOW.md}`;
  };

  const ghostBtn = {
    background: "transparent", color: p.textSub,
    border: `1px solid ${p.line}`,
    borderRadius: RADIUS.pill, padding: "13px 28px",
    fontFamily: SANS, fontWeight: 600, fontSize: 15, cursor: "pointer",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    transition: "border-color 0.2s ease, color 0.2s ease",
  };
  const ghostHover = e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = p.text; };
  const ghostLeave = e => { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = p.textSub; };

  return (
    <div style={{ position: "relative", isolation: "isolate", fontFamily: SANS, color: p.text }}>
      <ScrollProgress />

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        paddingTop: secPadV, paddingBottom: secPadV,
        position: "relative",
      }}>
        {/* Subtle ambient gradient */}
        <div aria-hidden="true" style={{
          position: "absolute", top: 0, right: 0, zIndex: 0, pointerEvents: "none",
          width: "min(640px, 65vw)", height: "min(540px, 60vh)",
          background: "radial-gradient(ellipse at 85% 15%, rgba(134,31,65,0.09), transparent 65%)",
        }} />

        <div style={{ ...ctr, position: "relative", zIndex: 1, width: "100%" }}>
          {/* Kicker badge */}
          <div style={{ animation: "lpHeroFade 0.6s cubic-bezier(0.22,1,0.36,1) 0s both", marginBottom: 20 }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 500,
              letterSpacing: "1.6px", textTransform: "uppercase", color: ACCENT,
            }}>Virginia Tech · Fall 2026</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: SERIF, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 400,
            lineHeight: 1.08, letterSpacing: "-0.5px", color: p.text,
            margin: "0 0 8px", maxWidth: 680,
            animation: "lpHeroFade 0.7s cubic-bezier(0.22,1,0.36,1) 0.07s both",
          }}>
            Master Virginia Tech&apos;s<br />grade landscape
          </h1>

          {/* Scribble underline */}
          <div style={{
            width: "min(400px, 72%)", marginBottom: 24,
            animation: "lpHeroFade 0.7s cubic-bezier(0.22,1,0.36,1) 0.10s both",
          }}>
            <Scribble delay={0.5} />
          </div>

          {/* Sub-headline */}
          <p style={{
            fontFamily: SANS, fontSize: 17, color: p.textSub, lineHeight: 1.6,
            margin: "0 0 36px", maxWidth: 520,
            animation: "lpHeroFade 0.7s cubic-bezier(0.22,1,0.36,1) 0.14s both",
          }}>
            Grade distributions, professor ratings, and a schedule builder — every VT course, in one clear place.
          </p>

          {/* CTAs */}
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
            marginBottom: 32,
            animation: "lpHeroFade 0.7s cubic-bezier(0.22,1,0.36,1) 0.21s both",
          }}>
            <SignedIn>
              <button style={primaryBtn} onMouseEnter={primaryHover} onMouseLeave={primaryLeave} onClick={onEnter}>
                Browse courses →
              </button>
            </SignedIn>
            <SignedOut>
              <SignUpButton mode="modal">
                <button style={primaryBtn} onMouseEnter={primaryHover} onMouseLeave={primaryLeave}>
                  Join the waitlist →
                </button>
              </SignUpButton>
              <button style={ghostBtn} onMouseEnter={ghostHover} onMouseLeave={ghostLeave} onClick={onEnter}>
                Browse courses
              </button>
            </SignedOut>
          </div>

          {/* Stat pills */}
          <div style={{
            fontFamily: MONO, fontSize: 12, color: p.textMute, letterSpacing: "0.3px",
            animation: "lpHeroFade 0.7s cubic-bezier(0.22,1,0.36,1) 0.28s both",
          }}>
            3,564 courses · 210 professors · 1.7M+ grade records
          </div>
        </div>
      </section>

      {/* ── MARQUEE DATA STREAMS ─────────────────────────────────────────────── */}
      <section style={{
        paddingTop: secPadV, paddingBottom: secPadV,
        background: darkMode ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.018)",
        borderTop: `1px solid ${p.lineSoft}`,
        borderBottom: `1px solid ${p.lineSoft}`,
      }}>
        <Reveal style={{ ...ctr, width: "100%", textAlign: "center", marginBottom: 32 }}>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 500,
            letterSpacing: "1.6px", textTransform: "uppercase", color: ACCENT,
            display: "block", marginBottom: 12,
          }}>Inside the catalog</span>
          <h2 style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.3px",
            color: p.text,
          }}>Every course. Every instructor.</h2>
        </Reveal>
        <DataMarquees dark={darkMode} />
        <div style={{
          textAlign: "center", marginTop: 16,
          fontFamily: MONO, fontSize: 10, letterSpacing: "1.4px",
          textTransform: "uppercase", color: p.textFaint,
        }}>Sample data · hover any card to pause</div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section style={{ paddingTop: secPadV, paddingBottom: secPadV }}>
        <div style={{ ...ctr, width: "100%" }}>
          <Reveal style={{ marginBottom: 48 }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 500,
              letterSpacing: "1.6px", textTransform: "uppercase", color: ACCENT,
              display: "block", marginBottom: 12,
            }}>What&apos;s inside</span>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 400, margin: 0,
              fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.3px",
              color: p.text, maxWidth: 520,
            }}>Built for every stage of course selection</h2>
          </Reveal>

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 16,
          }}>
            {FEATURES.map((f, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div style={{
                  ...glassCard(darkMode),
                  borderRadius: RADIUS.lg,
                  padding: 24,
                  cursor: "default",
                  height: "100%",
                  boxSizing: "border-box",
                  transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "rgba(134,31,65,0.30)";
                  e.currentTarget.style.boxShadow = SHADOW.lg;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.boxShadow = "";
                }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: RADIUS.sm,
                    background: "rgba(134,31,65,0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16, color: ACCENT, flexShrink: 0,
                  }}>
                    {f.icon}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: p.text, marginBottom: 8 }}>
                    {f.title}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: p.textSub, lineHeight: 1.6 }}>
                    {f.body}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${p.lineSoft}`,
        borderBottom: `1px solid ${p.lineSoft}`,
        paddingTop: isMobile ? 40 : 56,
        paddingBottom: isMobile ? 40 : 56,
      }}>
        <div style={{
          ...ctr, width: "100%",
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: isMobile ? 32 : 0,
        }}>
          {STATS.map((s, i) => (
            <Reveal key={i} delay={i * 0.07} style={{
              textAlign: "center",
              borderLeft: !isMobile && i > 0 ? `1px solid ${p.lineSoft}` : "none",
              padding: "0 16px",
            }}>
              <div style={{
                fontFamily: SERIF, fontSize: 28, fontWeight: 400,
                color: ACCENT, lineHeight: 1.1, marginBottom: 6,
              }}>{s.num}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: p.textMute }}>
                {s.label}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section style={{ paddingTop: secPadV, paddingBottom: secPadV }}>
        <div style={{ ...ctr, width: "100%" }}>
          <Reveal style={{ marginBottom: 40 }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 500,
              letterSpacing: "1.6px", textTransform: "uppercase", color: ACCENT,
              display: "block", marginBottom: 12,
            }}>Common questions</span>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 400, margin: 0,
              fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.15, letterSpacing: "-0.3px",
              color: p.text,
            }}>FAQ</h2>
          </Reveal>
          <div style={{ maxWidth: 680 }}>
            {FAQ_ITEMS.map((item, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <FaqItem item={item} dark={darkMode} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${p.lineSoft}`,
        paddingTop: isMobile ? 64 : 96,
        paddingBottom: isMobile ? 64 : 96,
        textAlign: "center",
        position: "relative",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 100%, rgba(134,31,65,0.08), transparent 60%)",
        }} />
        <div style={{ ...ctr, width: "100%", position: "relative", zIndex: 1 }}>
          <Reveal>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 400, margin: "0 0 16px",
              fontSize: "clamp(32px, 4vw, 52px)", lineHeight: 1.1, letterSpacing: "-0.3px",
              color: p.text,
            }}>Ready to find your advantage?</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p style={{
              fontFamily: SANS, fontSize: 16, color: p.textSub, lineHeight: 1.6,
              margin: "0 auto 36px", maxWidth: 420,
            }}>
              Join the waitlist and get early access to grade distributions, professor comparisons, and the AI advisor.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <SignedIn>
              <button style={primaryBtn} onMouseEnter={primaryHover} onMouseLeave={primaryLeave} onClick={onEnter}>
                Browse courses →
              </button>
            </SignedIn>
            <SignedOut>
              <SignUpButton mode="modal">
                <button style={primaryBtn} onMouseEnter={primaryHover} onMouseLeave={primaryLeave}>
                  Join the waitlist →
                </button>
              </SignUpButton>
            </SignedOut>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${p.lineSoft}`,
        padding: isMobile ? "48px 24px 28px" : "64px 24px 28px",
      }}>
        <div style={{
          ...ctr, width: "100%",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 0.8fr",
          gap: isMobile ? 36 : 64,
          marginBottom: isMobile ? 36 : 52,
        }}>
          <Reveal>
            <div style={{ fontFamily: SERIF, fontSize: 22, color: p.text, marginBottom: 12 }}>
              Built by a student,{" "}
              <span style={{ fontStyle: "italic", color: ACCENT }}>for students.</span>
            </div>
            <p style={{ fontSize: 13.5, color: p.textSub, lineHeight: 1.75, margin: 0, maxWidth: 380 }}>
              Darvis started as a frustration bouncing between spreadsheets, rating sites,
              and timetables just to pick classes. Grade distributions, professor insight,
              and schedule planning — in one place.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: "1.6px",
              textTransform: "uppercase", color: ACCENT, marginBottom: 16,
            }}>Data sources</div>
            {[
              ["Grade distributions", "VT University Data Commons"],
              ["Professor ratings",   "RateMyProfessors"],
              ["Sections",           "Live VT course catalog"],
            ].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{k}</div>
                <div style={{ fontSize: 12, color: p.textMute, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </Reveal>

          <Reveal delay={0.14}>
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: "1.6px",
              textTransform: "uppercase", color: ACCENT, marginBottom: 16,
            }}>Explore</div>
            {[
              ["Browse courses",    () => onEnter?.()],
              ["FAQs",             () => onNavigate?.("faqs")],
              ["Forums",           () => onNavigate?.("forums")],
              ["Schedule builder", () => onNavigate?.("schedule")],
            ].map(([label, go]) => (
              <button key={label} onClick={go} style={{
                display: "block", background: "none", border: "none", padding: "5px 0",
                fontSize: 13, fontWeight: 500, color: p.textSub, cursor: "pointer",
                fontFamily: SANS, textAlign: "left",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={e => { e.currentTarget.style.color = p.textSub; }}
              >{label}</button>
            ))}
          </Reveal>
        </div>

        {/* Bottom rail */}
        <div style={{
          ...ctr, width: "100%",
          borderTop: `1px solid ${p.lineSoft}`,
          paddingTop: 20,
          display: "flex", flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between", alignItems: "center",
          gap: isMobile ? 8 : 0,
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: p.textSub }}>Darvis</span>
          <span style={{
            fontSize: 10, color: p.textFaint, fontFamily: MONO,
            letterSpacing: "1px", textTransform: "uppercase", textAlign: "center",
          }}>
            Course intelligence · Est 2025 · Not affiliated with any university
          </span>
        </div>
      </footer>
    </div>
  );
}
