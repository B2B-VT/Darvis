// Landing Page v4 — VT Campus panorama · scroll-pan · light/dark
import { useState, useEffect, useRef } from "react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { db } from "../supabase.js";

// ── Styles ────────────────────────────────────────────────────────────────────
const LP_CSS = `
/* Smooth theme transition. Applies to every element that doesn't already
   declare its own transition — inline transitions (cards, buttons, nav)
   override this, so hover snappiness stays intact. */
body, body * {
  transition:
    background-color 0.5s ease,
    color 0.5s ease,
    border-color 0.5s ease,
    fill 0.5s ease,
    stroke 0.5s ease;
}
@keyframes lp-ticker {
  from { transform: translateX(0) }
  to   { transform: translateX(-50%) }
}
@keyframes lp-breathe {
  0%, 100% { transform: scale(1);    opacity: 0.5 }
  50%       { transform: scale(1.08); opacity: 0.7 }
}
@keyframes lp-rise {
  from { transform: translateY(108%); }
  to   { transform: translateY(0); }
}
@keyframes lp-appear {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lp-hero-clip { overflow: hidden; display: block; }
.lp-hero-line {
  display: block;
  animation: lp-rise 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lp-hero-fade { animation: lp-appear 0.9s ease both; }
.lp-clip  { overflow: hidden; display: block; }
.lp-line  { display: block; transform: translateY(108%); transition: transform 1.1s cubic-bezier(0.16, 1, 0.3, 1); }
.lp-line.in  { transform: translateY(0); }
.lp-fade  { opacity: 0; transform: translateY(28px); transition: opacity 0.9s ease, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
.lp-fade.in  { opacity: 1; transform: translateY(0); }
.lp-grow  { width: 0 !important; transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1); }
.lp-grow.in  { width: 100% !important; }
.d1 { transition-delay: 0.08s !important; animation-delay: 0.08s !important; }
.d2 { transition-delay: 0.16s !important; animation-delay: 0.16s !important; }
.d3 { transition-delay: 0.24s !important; animation-delay: 0.24s !important; }
.d4 { transition-delay: 0.32s !important; animation-delay: 0.32s !important; }
.d5 { transition-delay: 0.40s !important; animation-delay: 0.40s !important; }
.d6 { transition-delay: 0.48s !important; animation-delay: 0.48s !important; }
.d7 { transition-delay: 0.56s !important; animation-delay: 0.56s !important; }
.d8 { transition-delay: 0.64s !important; animation-delay: 0.64s !important; }
`;

function injectStyles(id, css) {
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id; el.textContent = css;
    document.head.appendChild(el);
  }
}

// ── Campus photo background ──────────────────────────────────────────────────
// Fixed-position layer with the day photo, night photo, and matching overlays.
// Both photos and both overlays are always mounted; opacity crossfades on
// darkMode. Used by the landing page AND any other page that wants the same
// backdrop (e.g. Browse Courses).
export function CampusBackground({ darkMode }) {
  // Make sure the global theme-transition CSS is present even if the landing
  // page hasn't rendered yet (e.g. user lands directly on Browse Courses).
  injectStyles('lp-v4', LP_CSS);
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0,
      width: '100vw', height: '100vh',
      zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
      background: darkMode ? '#080808' : '#f5f1ec',
    }}>
      <img
        src="images/campus_day.jpg"
        alt=""
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: darkMode ? 0 : 1,
          transition: 'opacity 0.5s ease',
        }}
      />
      <img
        src="images/campus_night.jpg"
        alt=""
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: darkMode ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />
      {/* Light overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.74) 100%)',
        opacity: darkMode ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }} />
      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,10,12,0.66) 0%, rgba(6,6,8,0.78) 100%)',
        opacity: darkMode ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }} />
    </div>
  );
}

function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }),
      { threshold: 0.12 }
    );
    ['.lp-line', '.lp-fade', '.lp-grow'].forEach(sel =>
      document.querySelectorAll(sel).forEach(el => obs.observe(el))
    );
    return () => obs.disconnect();
  });
}

// ── Animated counter ─────────────────────────────────────────────────────────
function AnimCounter({ target, suffix = '', duration = 1600, active }) {
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

// ── Course ticker ─────────────────────────────────────────────────────────────
function Ticker({ darkMode }) {
  const items = [
    'CS 2114 · Software Design', 'MATH 2224 · Multivariable Calc',
    'PHYS 2305 · Foundations of Physics', 'ECE 2504 · Intro Computer Engineering',
    'CS 3114 · Data Structures', 'BIOL 2104 · Biology Principles',
    'HIST 1015 · World History to 1500', 'CS 4664 · Machine Learning',
    'PSYC 1004 · Intro Psychology', 'MATH 2114 · Linear Algebra',
    'CS 4234 · Algorithms & Data Structures', 'ECE 3544 · Digital Design',
  ];
  const doubled = [...items, ...items];
  const tickerBg     = darkMode ? 'rgba(8,8,8,0.78)'         : 'rgba(255,250,243,0.85)';
  const tickerBorder = darkMode ? 'rgba(255,255,255,0.05)'   : 'rgba(0,0,0,0.08)';
  const tickerSub    = darkMode ? 'rgba(255,255,255,0.18)'   : 'rgba(20,16,12,0.45)';
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: `1px solid ${tickerBorder}`,
      borderBottom: `1px solid ${tickerBorder}`,
      padding: '14px 0', background: tickerBg,
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ display: 'flex', animation: 'lp-ticker 42s linear infinite', width: 'max-content' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{
            padding: '0 36px', fontSize: 11, fontWeight: 700,
            letterSpacing: '1px', textTransform: 'uppercase', whiteSpace: 'nowrap',
            color: i % 5 === 0 ? '#861F41' : tickerSub,
          }}>
            {i % 2 === 0 ? '◆' : '·'} &nbsp;{item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grade showcase (scroll-triggered bars) ────────────────────────────────────
function GradeShowcase({ darkMode }) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const bars = [
    { grade: 'A',  pct: 28, color: '#4ade80' },
    { grade: 'A−', pct: 15, color: '#86efac' },
    { grade: 'B+', pct: 14, color: '#60a5fa' },
    { grade: 'B',  pct: 13, color: '#93c5fd' },
    { grade: 'B−', pct:  8, color: '#a5b4fc' },
    { grade: 'C+', pct:  7, color: '#fbbf24' },
    { grade: 'C',  pct:  6, color: '#fde68a' },
    { grade: 'F',  pct:  2, color: '#f87171' },
  ];

  const surface       = darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.92)';
  const surfaceBorder = darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(20,16,12,0.10)';
  const titleText     = darkMode ? 'white'                  : '#1a1210';
  const subtitleText  = darkMode ? 'rgba(255,255,255,0.28)' : 'rgba(20,16,12,0.45)';
  const labelText     = darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(20,16,12,0.55)';
  const trackBg       = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(20,16,12,0.06)';
  const pctText       = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(20,16,12,0.40)';

  return (
    <div ref={ref} style={{
      background: surface,
      border: `1px solid ${surfaceBorder}`,
      borderRadius: 16, padding: '28px 24px',
      boxShadow: darkMode ? 'none' : '0 4px 24px rgba(20,16,12,0.06)',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#861F41', letterSpacing: '1.5px', textTransform: 'uppercase' }}>CS 2114</span>
        <div style={{ fontSize: 16, fontWeight: 800, color: titleText, marginTop: 6 }}>Software Design &amp; Data Structures</div>
        <div style={{ fontSize: 12, color: subtitleText, marginTop: 4 }}>Avg GPA 3.01 · All sections · 2001–2026</div>
      </div>
      {bars.map((b, i) => (
        <div key={b.grade} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
          <span style={{ width: 22, fontSize: 10, fontWeight: 800, color: labelText, textAlign: 'right', flexShrink: 0 }}>{b.grade}</span>
          <div style={{ flex: 1, height: 16, background: trackBg, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: active ? `${Math.min(b.pct * 3, 100)}%` : '0%',
              background: b.color, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
              transition: `width 0.95s cubic-bezier(0.34, 1.1, 0.64, 1) ${i * 0.07}s`,
            }}>
              {b.pct >= 8 && <span style={{ fontSize: 8, fontWeight: 900, color: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap' }}>{b.pct}%</span>}
            </div>
          </div>
          <span style={{ width: 26, fontSize: 10, fontWeight: 700, color: pctText, textAlign: 'right', flexShrink: 0 }}>{b.pct}%</span>
        </div>
      ))}
    </div>
  );
}


// ── Product preview panels ────────────────────────────────────────────────────
function CoursesPreview({ darkMode, t }) {
  const courses = [
    { code: 'CS 3114', name: 'Data Structures & Algorithms', gpa: 2.87, profs: 6 },
    { code: 'CS 4664', name: 'Machine Learning',             gpa: 3.38, profs: 3 },
    { code: 'MATH 2224', name: 'Multivariable Calculus',     gpa: 2.78, profs: 8 },
  ];
  const gpaColor = g => g >= 3.3 ? '#4ade80' : g >= 3.0 ? '#86efac' : g >= 2.7 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* Mock top bar */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.cardBorder}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 7, height: 28, display: 'flex', alignItems: 'center', padding: '0 10px' }}>
          <span style={{ fontSize: 11, color: t.textMute }}>Search courses…</span>
        </div>
        <div style={{ background: 'rgba(134,31,65,0.15)', borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#861F41' }}>Filters</span>
        </div>
      </div>
      {courses.map((c, i) => (
        <div key={i} style={{ padding: '11px 14px', borderBottom: i < courses.length - 1 ? `1px solid ${t.cardBorder}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#861F41', letterSpacing: '0.5px' }}>{c.code}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginTop: 2 }}>{c.name}</div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 2 }}>{c.profs} instructors</div>
          </div>
          <div style={{ background: gpaColor(c.gpa) + '22', border: `1px solid ${gpaColor(c.gpa)}44`, borderRadius: 7, padding: '4px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: gpaColor(c.gpa) }}>{c.gpa.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: t.textMute, fontWeight: 600 }}>Avg GPA</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SchedulePreview({ darkMode, t }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const blocks = [
    { day: 0, start: 1, span: 2, label: 'CS 3114', color: '#861F41' },
    { day: 2, start: 1, span: 2, label: 'CS 3114', color: '#861F41' },
    { day: 4, start: 1, span: 2, label: 'CS 3114', color: '#861F41' },
    { day: 1, start: 3, span: 2, label: 'MATH 2224', color: '#2563eb' },
    { day: 3, start: 3, span: 2, label: 'MATH 2224', color: '#2563eb' },
    { day: 0, start: 5, span: 1, label: 'CS 4664', color: '#059669' },
    { day: 2, start: 5, span: 1, label: 'CS 4664', color: '#059669' },
  ];
  const rows = 7;
  const times = ['8am','9am','10am','11am','12pm','1pm','2pm'];
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.cardBorder}` }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: t.text }}>Weekly Schedule</span>
        <span style={{ fontSize: 10, color: t.textMute, marginLeft: 8 }}>3 classes added</span>
      </div>
      <div style={{ padding: '10px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(5, 1fr)', gap: 3, minWidth: 220 }}>
          {/* Header */}
          <div />
          {days.map(d => (
            <div key={d} style={{ fontSize: 9, fontWeight: 800, color: t.textMute, textAlign: 'center', paddingBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
          ))}
          {/* Grid rows */}
          {Array.from({ length: rows }).map((_, row) => (
            [
              <div key={`t${row}`} style={{ fontSize: 8, color: t.textFaint, paddingTop: 2, textAlign: 'right', paddingRight: 4 }}>{times[row]}</div>,
              ...days.map((_, col) => {
                const block = blocks.find(b => b.day === col && b.start === row);
                const covered = blocks.some(b => b.day === col && b.start < row && b.start + b.span > row);
                if (covered) return null;
                if (block) return (
                  <div key={`c${col}`} style={{
                    gridRow: `span ${block.span}`,
                    background: block.color + '25',
                    border: `1px solid ${block.color}55`,
                    borderRadius: 5,
                    padding: '3px 5px',
                    fontSize: 8, fontWeight: 800, color: block.color,
                    overflow: 'hidden',
                  }}>{block.label}</div>
                );
                return <div key={`e${col}`} style={{ height: 22, background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 4 }} />;
              })
            ]
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatbotPreview({ darkMode, t }) {
  const messages = [
    { role: 'user', text: "Who's the best prof for CS 3114?" },
    { role: 'bot',  text: 'For CS 3114, Hamouda has the strongest grade outcomes — 3.67 avg GPA across 459 students over 4 terms. Farghally is worth considering too at 3.54.' },
    { role: 'user', text: 'What about the F rate?' },
    { role: 'bot',  text: "Hamouda's F rate sits at 2.1%, which is on the lower end for that course. Grade distributions show outcomes, not what the class actually feels like." },
  ];
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg, #6b1833, #861F41)' }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: t.text }}>Darvis AI</span>
        <span style={{ fontSize: 9, background: 'rgba(134,31,65,0.15)', color: '#861F41', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>Beta</span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '82%',
              background: m.role === 'user' ? '#861F41' : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
              color: m.role === 'user' ? 'white' : t.text,
              borderRadius: m.role === 'user' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
              padding: '7px 10px', fontSize: 10.5, lineHeight: 1.5, fontWeight: 500,
            }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${t.cardBorder}` }}>
        <div style={{ background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 8, height: 28, display: 'flex', alignItems: 'center', padding: '0 10px' }}>
          <span style={{ fontSize: 10, color: t.textMute }}>Ask about any course or professor…</span>
        </div>
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage({ onEnter, darkMode }) {
  const statsRef  = useRef(null);
  const heroBgRef = useRef(null);
  const [statsActive, setStatsActive] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  // Waitlist form
  const [wlEmail, setWlEmail]   = useState('');
  const [wlOpen,  setWlOpen]    = useState(false);
  const [wlStep,  setWlStep]    = useState('idle'); // idle | loading | success | error
  const [wlError, setWlError]   = useState('');

  const handleWaitlist = async (e) => {
    e.preventDefault();
    if (!wlEmail.trim()) return;
    setWlStep('loading');
    try {
      const { error } = await db.from('waitlist').insert({ email: wlEmail.trim().toLowerCase() });
      if (error && error.code !== '23505') throw error; // 23505 = duplicate email, still show success
      setWlStep('success');
    } catch (err) {
      setWlStep('error');
      setWlError('Something went wrong. Try again.');
    }
  };

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  injectStyles('lp-v4', LP_CSS);
  useReveal();

  // Stats intersection trigger
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setStatsActive(true); },
      { threshold: 0.3 }
    );
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  // Cursor-tracking glow on hero
  useEffect(() => {
    const el = heroBgRef.current;
    if (!el) return;
    const move = e => {
      el.style.setProperty('--mx', `${e.clientX}px`);
      el.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);


  const stats = [
    { val: 790,  suffix: '',     label: 'Courses indexed'   },
    { val: 5,    suffix: ' yrs', label: 'Grade history'     },
    { val: 3968, suffix: '+',    label: 'Grade records'     },
    { val: 100,  suffix: '%',    label: 'Free to use'       },
  ];

  const features = [
    {
      n: '01', title: 'Real grade distributions',
      desc: 'Every grade per professor and semester, going back to 2020. The numbers come straight from institutional records.',
    },
    {
      n: '02', title: 'RateMyProfessor built in',
      desc: 'Ratings, difficulty scores, and student tags appear on each section listing. No separate tab needed.',
    },
    {
      n: '03', title: 'Smart filters',
      desc: 'Filter by GPA range, credits, days offered, and Pathways concept. Find what fits your schedule and degree plan.',
    },
    {
      n: '04', title: 'Visual schedule builder',
      desc: 'Add sections to a weekly grid, catch time conflicts instantly, and finalize your schedule before registration opens.',
    },
  ];

  const previewCourses = [
    { subj: 'CS',   num: '4664', title: 'Machine Learning',             gpa: 3.38 },
    { subj: 'CS',   num: '3114', title: 'Data Structures & Algorithms', gpa: 2.87 },
    { subj: 'MATH', num: '2224', title: 'Multivariable Calculus',       gpa: 2.78 },
    { subj: 'ECE',  num: '2504', title: 'Intro Computer Engineering',   gpa: 2.81 },
    { subj: 'PHYS', num: '2305', title: 'Foundations of Physics I',     gpa: 2.74 },
    { subj: 'CS',   num: '2114', title: 'Software Design',              gpa: 3.01 },
  ];

  // ── Theme palette ──────────────────────────────────────────────────────────
  // Centralizes the dark/light values so each section can read them by key.
  const t = darkMode ? {
    text:        'white',
    textSub:     'rgba(255,255,255,0.38)',
    textMute:    'rgba(255,255,255,0.28)',
    textFaint:   'rgba(255,255,255,0.18)',
    cardBg:      'rgba(255,255,255,0.03)',
    cardBgHov:   'rgba(134,31,65,0.06)',
    cardBorder:  'rgba(255,255,255,0.07)',
    sectionLine: 'rgba(255,255,255,0.08)',
    sectionLineSoft: 'rgba(255,255,255,0.06)',
    gradeBg:     '#0c0c0c',
    footerBg:    '#080808',
    btnGhostText:   'rgba(255,255,255,0.45)',
    btnGhostBorder: 'rgba(255,255,255,0.12)',
    btnGhostHovBd:  'rgba(255,255,255,0.30)',
    btnGhostHovTxt: 'white',
  } : {
    text:        '#1a1210',
    textSub:     'rgba(20,16,12,0.55)',
    textMute:    'rgba(20,16,12,0.45)',
    textFaint:   'rgba(20,16,12,0.35)',
    cardBg:      'rgba(255,255,255,0.85)',
    cardBgHov:   'rgba(134,31,65,0.08)',
    cardBorder:  'rgba(20,16,12,0.10)',
    sectionLine: 'rgba(20,16,12,0.12)',
    sectionLineSoft: 'rgba(20,16,12,0.08)',
    gradeBg:     'rgba(255,250,243,0.92)',
    footerBg:    'rgba(255,250,243,0.95)',
    btnGhostText:   'rgba(20,16,12,0.55)',
    btnGhostBorder: 'rgba(20,16,12,0.18)',
    btnGhostHovBd:  'rgba(20,16,12,0.40)',
    btnGhostHovTxt: '#1a1210',
  };

  const Btn = ({ label, primary, onClick }) => (
    <button onClick={onClick} style={{
      background: primary ? '#861F41' : 'transparent',
      color: primary ? 'white' : t.btnGhostText,
      border: primary ? 'none' : `1px solid ${t.btnGhostBorder}`,
      borderRadius: 9, padding: '13px 30px',
      fontWeight: 800, fontSize: 14, cursor: 'pointer',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      transition: 'all 0.2s', letterSpacing: '0.2px',
    }}
    onMouseEnter={e => {
      if (primary) { e.currentTarget.style.background = '#a02450'; e.currentTarget.style.transform = 'translateY(-2px)'; }
      else { e.currentTarget.style.borderColor = t.btnGhostHovBd; e.currentTarget.style.color = t.btnGhostHovTxt; }
    }}
    onMouseLeave={e => {
      if (primary) { e.currentTarget.style.background = '#861F41'; e.currentTarget.style.transform = 'none'; }
      else { e.currentTarget.style.borderColor = t.btnGhostBorder; e.currentTarget.style.color = t.btnGhostText; }
    }}
    >{label}</button>
  );

  // Section background colors that shift with mode
  const gradeBg  = t.gradeBg;
  const footerBg = t.footerBg;

  return (
    <div style={{ position: 'relative', background: 'transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", color: t.text }}>

      {/* ── PHOTO BACKGROUND (fixed) ─────────────────────────────────────────── */}
      <CampusBackground darkMode={darkMode} />

      {/* ── ALL CONTENT (above background) ── */}
      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── TOP TICKER ───────────────────────────────────────────────────────── */}
      <Ticker darkMode={darkMode} />

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section ref={heroBgRef} style={{
        minHeight: '100vh', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        '--mx': '50%', '--my': '40%',
      }}>
        {/* Cursor glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(700px circle at var(--mx) var(--my), rgba(134,31,65,0.09) 0%, transparent 65%)',
        }} />
        {/* Subtle maroon ambient */}
        <div style={{
          position: 'absolute', top: '-15%', right: '-8%',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(134,31,65,0.12) 0%, transparent 60%)',
          filter: 'blur(80px)', pointerEvents: 'none',
          animation: 'lp-breathe 9s ease-in-out infinite',
        }} />

        {/* Main hero text */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          maxWidth: 1200, margin: '0 auto', padding: isMobile ? '48px 20px 32px' : '60px 64px 40px',
          width: '100%', boxSizing: 'border-box', position: 'relative', zIndex: 2,
        }}>
          {/* Label */}
          <div className="lp-hero-fade" style={{ marginBottom: 36 }}>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '2.5px',
              color: '#861F41', textTransform: 'uppercase',
            }}>Course Planning · Grade Data</span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 36 }}>
            <span className="lp-hero-clip">
              <span className="lp-hero-line d1" style={{
                fontSize: 'clamp(52px, 7.5vw, 104px)', fontWeight: 900,
                lineHeight: 0.98, letterSpacing: '-4px', color: t.text,
              }}>Pick classes</span>
            </span>
            <span className="lp-hero-clip">
              <span className="lp-hero-line d2" style={{
                fontSize: 'clamp(52px, 7.5vw, 104px)', fontWeight: 900,
                lineHeight: 0.98, letterSpacing: '-4px', color: '#861F41',
              }}>with real data.</span>
            </span>
          </div>

          {/* Subtitle */}
          <p className="lp-hero-fade d3" style={{
            fontSize: 17, color: t.textSub,
            lineHeight: 1.72, margin: '0 0 44px', fontWeight: 500, maxWidth: 460,
          }}>
            Grade distributions, professor ratings, and a visual schedule builder, in one place.
          </p>

          {/* CTA */}
          <div className="lp-hero-fade d4">
            <SignedIn>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Btn label="Browse courses →" primary onClick={onEnter} />
              </div>
            </SignedIn>
            <SignedOut>
              {wlStep === 'success' ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.25)',
                  borderRadius: 10, padding: '12px 20px',
                }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>
                    You're on the list. We'll email you when you're approved.
                  </span>
                </div>
              ) : wlOpen ? (
                <div>
                  <form onSubmit={handleWaitlist} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={wlEmail}
                      onChange={e => setWlEmail(e.target.value)}
                      autoFocus
                      required
                      style={{
                        height: 44, padding: '0 16px', fontSize: 14, fontWeight: 500,
                        background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)'}`,
                        borderRadius: 9, color: t.text, outline: 'none', minWidth: 220,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }}
                    />
                    <button type="submit" disabled={wlStep === 'loading'} style={{
                      height: 44, padding: '0 22px',
                      background: '#861F41', color: 'white', border: 'none',
                      borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      opacity: wlStep === 'loading' ? 0.7 : 1,
                    }}>
                      {wlStep === 'loading' ? 'Joining…' : 'Join →'}
                    </button>
                    <button type="button" onClick={() => { setWlOpen(false); setWlStep('idle'); }} style={{
                      height: 44, padding: '0 16px', background: 'transparent',
                      border: `1px solid ${t.btnGhostBorder}`, borderRadius: 9,
                      color: t.btnGhostText, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>Cancel</button>
                  </form>
                  {wlStep === 'error' && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#f87171', fontWeight: 600 }}>{wlError}</div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn label="Join the waitlist →" primary onClick={() => setWlOpen(true)} />
                  <Btn label="Browse courses" onClick={onEnter} />
                </div>
              )}
            </SignedOut>
          </div>

          {/* Trust line */}
          <div className="lp-hero-fade d5" style={{
            marginTop: 28, fontSize: 12, color: t.textFaint,
            fontWeight: 600, display: 'flex', gap: 20, flexWrap: 'wrap',
          }}>
            <SignedOut>
              <span>✓ Private beta</span>
              <span>✓ Built by VT students</span>
              <span>✓ Free forever</span>
            </SignedOut>
            <SignedIn>
              <span>✓ Real institutional grade data</span>
              <span>✓ Free forever</span>
            </SignedIn>
          </div>
        </div>

        {/* Course preview grid */}
        <div style={{
          position: 'relative', zIndex: 2,
          maxWidth: 1200, margin: '0 auto', width: '100%',
          padding: isMobile ? '0 20px 48px' : '0 64px 72px', boxSizing: 'border-box',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 8 }}>
            {previewCourses.map((c, i) => {
              const gpaCol = c.gpa >= 3.3 ? '#4ade80' : c.gpa >= 3.0 ? '#86efac' : c.gpa >= 2.7 ? '#fbbf24' : '#f87171';
              return (
                <div key={i} className={`lp-fade d${i + 1}`} style={{
                  background: t.cardBg,
                  border: `1px solid ${t.cardBorder}`,
                  borderRadius: 10, padding: '14px 14px',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(134,31,65,0.5)'; e.currentTarget.style.background = t.cardBgHov; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.cardBorder; e.currentTarget.style.background = t.cardBg; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#861F41', letterSpacing: '0.8px' }}>{c.subj} {c.num}</span>
                    <span style={{ fontSize: 10, fontWeight: 900, color: gpaCol }}>{c.gpa.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(255,255,255,0.75)' : 'rgba(20,16,12,0.80)', lineHeight: 1.35 }}>{c.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{ padding: isMobile ? '48px 20px' : '80px 64px', maxWidth: 1200, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 0 }}>
          {stats.map((s, i) => (
            <div key={i} className={`lp-fade d${i + 1}`} style={{
              borderTop: `1px solid ${t.sectionLine}`,
              borderRight: i < 3 ? `1px solid ${t.sectionLineSoft}` : 'none',
              padding: '32px 36px 28px',
            }}>
              <div style={{
                fontSize: 'clamp(38px, 4.5vw, 62px)', fontWeight: 900,
                color: t.text, letterSpacing: '-2.5px', lineHeight: 1,
              }}>
                <AnimCounter target={s.val} suffix={s.suffix} active={statsActive} />
              </div>
              <div style={{
                fontSize: 11, color: t.textMute,
                fontWeight: 700, marginTop: 10,
                textTransform: 'uppercase', letterSpacing: '1px',
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CINEMATIC VIDEO ──────────────────────────────────────────────────── */}
      <section style={{ width: '100%', lineHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_3Dp4WEkcgeJOAWsT2tOR79izVMk/hf_20260520_215217_fdd07390-9b15-4d8b-9a8d-a7e523f87d61.mp4"
          autoPlay
          muted
          loop
          playsInline
          style={{
            width: '100%',
            height: isMobile ? 260 : 480,
            objectFit: 'cover',
            display: 'block',
            filter: 'brightness(0.88)',
          }}
        />
      </section>

      {/* ── PRODUCT PREVIEW ──────────────────────────────────────────────────── */}
      <section style={{ background: gradeBg, padding: isMobile ? '60px 20px 72px' : '80px 64px 100px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 52 }}>
            <span className="lp-clip">
              <span className="lp-line" style={{
                display: 'block', fontSize: 10, fontWeight: 900,
                color: '#861F41', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 18,
              }}>See inside</span>
            </span>
            <span className="lp-clip">
              <span className="lp-line d1" style={{
                display: 'block', fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900,
                color: t.text, lineHeight: 1.1, letterSpacing: '-1.5px',
              }}>Everything in one place.</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
            <div className="lp-fade d1">
              <div style={{ fontSize: 10, fontWeight: 800, color: t.textMute, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>Browse courses</div>
              <CoursesPreview darkMode={darkMode} t={t} />
            </div>
            <div className="lp-fade d2">
              <div style={{ fontSize: 10, fontWeight: 800, color: t.textMute, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>Schedule builder</div>
              <SchedulePreview darkMode={darkMode} t={t} />
            </div>
            <div className="lp-fade d3">
              <div style={{ fontSize: 10, fontWeight: 800, color: t.textMute, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>AI chatbot</div>
              <ChatbotPreview darkMode={darkMode} t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? '60px 20px 72px' : '100px 64px 120px', maxWidth: 1200, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.8fr', gap: isMobile ? 32 : 80, alignItems: 'start' }}>
          <div style={{ position: isMobile ? 'static' : 'sticky', top: 100 }}>
            <span className="lp-clip">
              <span className="lp-line" style={{
                display: 'block', fontSize: 10, fontWeight: 900,
                color: '#861F41', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 18,
              }}>What you get</span>
            </span>
            <span className="lp-clip">
              <span className="lp-line d1" style={{
                display: 'block', fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900,
                color: t.text, lineHeight: 1.1, letterSpacing: '-1.5px',
              }}>Tools for picking the right class.</span>
            </span>
          </div>
          <div>
            {features.map((f, i) => (
              <div key={i} className={`lp-fade d${i + 1}`} style={{
                borderTop: `1px solid ${t.sectionLineSoft}`,
                padding: '30px 0',
                display: 'grid', gridTemplateColumns: '36px 1fr', gap: 20,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 900,
                  color: t.textFaint,
                  letterSpacing: '0.5px', paddingTop: 3,
                }}>{f.n}</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 9 }}>{f.title}</div>
                  <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.75, fontWeight: 500 }}>{f.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${t.sectionLineSoft}` }} />
          </div>
        </div>
      </section>

      {/* ── GRADE DATA ───────────────────────────────────────────────────────── */}
      <section style={{ background: gradeBg, padding: isMobile ? '60px 20px' : '120px 64px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 36 : 80, alignItems: 'center' }}>
          <div>
            <span className="lp-clip">
              <span className="lp-line" style={{
                display: 'block', fontSize: 10, fontWeight: 900,
                color: '#861F41', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 18,
              }}>Grade data</span>
            </span>
            <span className="lp-clip">
              <span className="lp-line d1" style={{
                display: 'block', fontSize: 'clamp(26px, 3.5vw, 44px)', fontWeight: 900,
                color: t.text, lineHeight: 1.1, letterSpacing: '-1.5px', marginBottom: 22,
              }}>24 years of real grade records.</span>
            </span>
            <p className="lp-fade d2" style={{
              fontSize: 15, color: t.textSub,
              lineHeight: 1.8, margin: '0 0 36px', fontWeight: 500,
            }}>
              Every section and professor since 2001. See exactly how a class has been graded, pulled straight from institutional records.
            </p>
            <div className="lp-fade d3">
              <Btn label="Explore grade data →" onClick={onEnter} />
            </div>
          </div>
          <div className="lp-fade d2">
            <GradeShowcase darkMode={darkMode} />
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? '80px 20px' : '160px 64px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(134,31,65,0.08) 0%, transparent 70%)',
        }} />
        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
          <span className="lp-clip">
            <span className="lp-line" style={{
              display: 'block', fontSize: 'clamp(40px, 6vw, 80px)',
              fontWeight: 900, color: t.text, letterSpacing: '-3px', lineHeight: 1.0,
            }}>Stop guessing.</span>
          </span>
          <span className="lp-clip">
            <span className="lp-line d1" style={{
              display: 'block', fontSize: 'clamp(40px, 6vw, 80px)',
              fontWeight: 900, color: '#861F41', letterSpacing: '-3px', lineHeight: 1.0,
              marginBottom: 32,
            }}>Start knowing.</span>
          </span>
          <p className="lp-fade d2" style={{
            fontSize: 16, color: t.textMute,
            marginBottom: 44, lineHeight: 1.7, fontWeight: 500,
          }}>
            Real grade data for every course and professor.
          </p>
          <div className="lp-fade d3">
            <SignedIn>
              <Btn label="Browse courses →" primary onClick={onEnter} />
            </SignedIn>
            <SignedOut>
              {wlStep === 'success' ? (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>✓ You're on the list.</div>
              ) : (
                <Btn label="Join the waitlist →" primary onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => setWlOpen(true), 500); }} />
              )}
            </SignedOut>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${t.sectionLineSoft}`,
        padding: isMobile ? '20px 20px' : '24px 64px',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', alignItems: 'center', gap: isMobile ? 6 : 0,
        background: footerBg,
      }}>
        <span style={{ fontWeight: 900, fontSize: 14, color: t.textSub, letterSpacing: '-0.5px' }}>Darvis</span>
        <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 600 }}>
          Course planning · Grade data · Schedule builder
        </span>
      </footer>

      </div>{/* end content wrapper */}
    </div>
  );
}

