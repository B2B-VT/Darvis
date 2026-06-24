// theme.jsx — Darvis Editorial design system
// Single source of truth for colors, type, texture, and motion.
// Every page imports from here; darkMode stays a prop-driven boolean.
import { useEffect, useRef, useState } from "react";

// ── Brand ─────────────────────────────────────────────────────────────────────
export const ACCENT = "#861F41";        // VT maroon
export const ACCENT_HOVER = "#9B2950";
export const COPPER = "#C77B3F";        // warm secondary for highlights

export const SERIF = "'Instrument Serif', Georgia, serif";
export const SANS  = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Plus Jakarta Sans', system-ui, sans-serif";
export const MONO  = "'SF Mono', 'JetBrains Mono', Menlo, monospace";

// macOS-style radius scale
export const RADIUS = { xs: 6, sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };

// macOS-style layered shadows
export const SHADOW = {
  sm:  "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  md:  "0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.07)",
  lg:  "0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)",
  xl:  "0 24px 48px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.10)",
};

export const EASE        = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_SPRING = "cubic-bezier(0.34, 1.2, 0.64, 1)";

// ── Palette ───────────────────────────────────────────────────────────────────
export function palette(dark) {
  return dark ? {
    bg:        "#0A0908",
    bgRaised:  "#13100F",
    text:      "#F4EFE9",
    textSub:   "rgba(244,239,233,0.55)",
    textMute:  "rgba(244,239,233,0.38)",
    textFaint: "rgba(244,239,233,0.22)",
    line:      "rgba(244,239,233,0.10)",
    lineSoft:  "rgba(244,239,233,0.06)",
    card:      "rgba(255,255,255,0.035)",
    cardHover: "rgba(255,255,255,0.065)",
    glass:     "rgba(14,12,11,0.72)",
    input:     "rgba(255,255,255,0.05)",
    shadow:    "none",
  } : {
    bg:        "#FAF6F0",
    bgRaised:  "#FFFFFF",
    text:      "#1A120F",
    textSub:   "rgba(26,18,15,0.62)",
    textMute:  "rgba(26,18,15,0.45)",
    textFaint: "rgba(26,18,15,0.30)",
    line:      "rgba(26,18,15,0.12)",
    lineSoft:  "rgba(26,18,15,0.07)",
    card:      "rgba(255,255,255,0.82)",
    cardHover: "#FFFFFF",
    glass:     "rgba(250,246,240,0.80)",
    input:     "rgba(255,255,255,0.92)",
    shadow:    "0 4px 28px rgba(26,18,15,0.07)",
  };
}

// ── Global stylesheet (inject once) ───────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes dvPageIn {
  from { opacity: 0; transform: translateY(12px); filter: blur(6px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
@keyframes dvRise {
  from { transform: translateY(110%); }
  to   { transform: translateY(0); }
}
@keyframes dvFadeUp {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dvPop {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes dvBreathe {
  0%, 100% { transform: scale(1) translate(0, 0);       opacity: 0.55; }
  50%      { transform: scale(1.12) translate(2%, -2%); opacity: 0.8; }
}
@keyframes dvGrain {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-2%, 2%); }
  40% { transform: translate(2%, -1%); }
  60% { transform: translate(-1%, -2%); }
  80% { transform: translate(1%, 2%); }
}
@keyframes dvMarquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes dvShimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
@keyframes dvDraw { to { stroke-dashoffset: 0; } }
@keyframes dvSpin { to { transform: rotate(360deg); } }

/* Scroll-reveal primitives — .in added via IntersectionObserver */
.dv-reveal {
  opacity: 0; transform: translateY(26px);
  transition: opacity 0.8s ease, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}
.dv-reveal.in { opacity: 1; transform: translateY(0); }
.dv-clip { overflow: hidden; display: block; }
.dv-line { display: block; transform: translateY(110%); transition: transform 1s cubic-bezier(0.22, 1, 0.36, 1); }
.dv-line.in { transform: translateY(0); }
.dv-d1 { transition-delay: 0.07s !important; animation-delay: 0.07s !important; }
.dv-d2 { transition-delay: 0.14s !important; animation-delay: 0.14s !important; }
.dv-d3 { transition-delay: 0.21s !important; animation-delay: 0.21s !important; }
.dv-d4 { transition-delay: 0.28s !important; animation-delay: 0.28s !important; }
.dv-d5 { transition-delay: 0.35s !important; animation-delay: 0.35s !important; }
.dv-d6 { transition-delay: 0.42s !important; animation-delay: 0.42s !important; }

.dv-skeleton {
  background: linear-gradient(90deg, rgba(134,31,65,0.06) 25%, rgba(134,31,65,0.14) 50%, rgba(134,31,65,0.06) 75%);
  background-size: 200% 100%;
  animation: dvShimmer 1.4s linear infinite;
  border-radius: 8px;
}

/* Smooth theme crossfade for elements without their own transition */
body, body * {
  transition-property: background-color, color, border-color, fill, stroke, box-shadow;
  transition-duration: 0.45s;
  transition-timing-function: ease;
}
`;

export function injectGlobalStyles() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("dv-theme")) {
    const el = document.createElement("style");
    el.id = "dv-theme";
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
  }
}

// ── Film grain (SVG turbulence, fixed overlay) ────────────────────────────────
const NOISE_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#n)' opacity='1'/></svg>"
  );

export function GrainOverlay({ dark }) {
  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: "-50%", width: "200%", height: "200%",
      zIndex: 3, pointerEvents: "none",
      backgroundImage: `url("${NOISE_URI}")`,
      backgroundRepeat: "repeat",
      opacity: dark ? 0.05 : 0.035,
      mixBlendMode: dark ? "screen" : "multiply",
      animation: "dvGrain 9s steps(6) infinite",
    }} />
  );
}

// ── Ambient backdrop for inner pages (replaces flat black) ────────────────────
export function AmbientBackdrop({ dark }) {
  const p = palette(dark);
  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 0, overflow: "hidden",
      pointerEvents: "none", background: p.bg,
    }}>
      <div style={{
        position: "absolute", top: "-22%", right: "-12%",
        width: 720, height: 720, borderRadius: "50%",
        background: `radial-gradient(circle, ${dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.10)"} 0%, transparent 62%)`,
        filter: "blur(70px)",
        animation: "dvBreathe 13s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "-28%", left: "-14%",
        width: 640, height: 640, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(199,123,63,0.10) 0%, transparent 60%)",
        filter: "blur(80px)",
        animation: "dvBreathe 17s ease-in-out infinite reverse",
      }} />
    </div>
  );
}

// ── Reveal-on-scroll wrapper ──────────────────────────────────────────────────
export function Reveal({ children, delay = 0, as: Tag = "div", style, className = "", ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("in"); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`dv-reveal ${className}`}
      style={{ transitionDelay: `${delay}s`, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

// ── Hand-drawn scribble underline (draws itself on reveal) ────────────────────
export function Scribble({ color = ACCENT, width = "100%", delay = 0.6, style }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <svg ref={ref} viewBox="0 0 260 14" fill="none" preserveAspectRatio="none"
      style={{ display: "block", width, height: "0.14em", overflow: "visible", ...style }}>
      <path
        d="M3 10 C 40 4, 75 12, 110 7 S 180 3, 257 8"
        stroke={color} strokeWidth="4.5" strokeLinecap="round"
        style={{
          strokeDasharray: 300, strokeDashoffset: on ? 0 : 300,
          transition: `stroke-dashoffset 1.1s ${EASE} ${delay}s`,
        }}
      />
    </svg>
  );
}

// ── Page header: mono kicker + serif title + hairline ─────────────────────────
export function PageHeader({ dark, kicker, title, sub, children }) {
  const p = palette(dark);
  return (
    <header style={{ marginBottom: 34 }}>
      {kicker && (
        <span style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 500,
          letterSpacing: "1.8px", textTransform: "uppercase",
          color: ACCENT, display: "block", marginBottom: 12,
          animation: "dvFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both",
        }}>{kicker}</span>
      )}
      <h1 style={{
        fontFamily: SERIF, fontWeight: 400, margin: 0,
        fontSize: "clamp(34px, 4.2vw, 52px)", lineHeight: 1.08,
        letterSpacing: "-0.5px", color: p.text,
        animation: "dvFadeUp 0.7s cubic-bezier(0.22,1,0.36,1) 0.05s both",
      }}>{title}</h1>
      {sub && (
        <p style={{
          fontFamily: SANS, fontSize: 15, fontWeight: 500,
          color: p.textSub, lineHeight: 1.7, maxWidth: 560,
          margin: "14px 0 0",
          animation: "dvFadeUp 0.7s cubic-bezier(0.22,1,0.36,1) 0.12s both",
        }}>{sub}</p>
      )}
      {children}
      <div style={{ height: 1, background: p.lineSoft, marginTop: 28 }} />
    </header>
  );
}

// ── Pill button ───────────────────────────────────────────────────────────────
export function PillButton({ dark, primary, children, style, ...rest }) {
  const p = palette(dark);
  return (
    <button {...rest} style={{
      background: primary ? ACCENT : "transparent",
      color: primary ? "#fff" : p.textSub,
      border: primary ? "none" : `1px solid ${p.line}`,
      borderRadius: 999, padding: "12px 26px",
      fontFamily: SANS, fontWeight: 600, fontSize: 14, cursor: "pointer",
      boxShadow: primary ? "0 2px 18px rgba(134,31,65,0.30)" : "none",
      ...style,
    }}
    onMouseEnter={e => {
      if (primary) { e.currentTarget.style.background = ACCENT_HOVER; e.currentTarget.style.boxShadow = "0 6px 26px rgba(134,31,65,0.4)"; }
      else { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = p.text; }
      rest.onMouseEnter?.(e);
    }}
    onMouseLeave={e => {
      if (primary) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.boxShadow = "0 2px 18px rgba(134,31,65,0.30)"; }
      else { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = p.textSub; }
      rest.onMouseLeave?.(e);
    }}
    >{children}</button>
  );
}
