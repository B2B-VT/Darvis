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

// ── Responsive scale ──────────────────────────────────────────────────────────
// One breakpoint set for the whole app. Before this existed each page invented
// its own cutoff (640 / 700 / 760 / 768 / 900), so the same viewport could be
// "mobile" on one page and "desktop" on the next.
export const BREAKPOINTS = { sm: 480, md: 768, lg: 1024, xl: 1280 };

// Horizontal page padding — phones need the content to breathe against the edge
// without wasting the little width they have.
export const PAGE_PAD = { mobile: 16, tablet: 28, desktop: 48 };

// Minimum comfortable tap target (Apple HIG 44pt / Material 48dp).
export const TAP = 44;

// Fixed chrome heights, shared so pages can reserve space for them.
export const MOBILE_HEADER_H = 56;
export const MOBILE_NAV_H    = 62;

// Safe-area helpers — iPhone notch / Dynamic Island / home indicator.
// Always additive so they collapse to the base value on devices without insets.
export const safeArea = {
  top:    (extra = 0) => `calc(${extra}px + env(safe-area-inset-top, 0px))`,
  bottom: (extra = 0) => `calc(${extra}px + env(safe-area-inset-bottom, 0px))`,
  left:   (extra = 0) => `calc(${extra}px + env(safe-area-inset-left, 0px))`,
  right:  (extra = 0) => `calc(${extra}px + env(safe-area-inset-right, 0px))`,
};

// ── Viewport hooks ────────────────────────────────────────────────────────────
// Single shared matchMedia listener per breakpoint instead of a resize handler
// per component. matchMedia fires on orientation change too, which the old
// `useState(() => window.innerWidth < 768)` snapshots never did.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = e => setMatches(e.matches);
    setMatches(mql.matches);
    // Safari < 14 only supports the deprecated addListener form.
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/** True below the `md` breakpoint (< 768px) — the phone layout. */
export function useIsMobile(bp = BREAKPOINTS.md) {
  return useMediaQuery(`(max-width: ${bp - 0.02}px)`);
}

/** True for narrow phones (< 480px) where two-column forms stop fitting. */
export function useIsSmallMobile() {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.sm - 0.02}px)`);
}

/** True between md and lg — tablets and small laptops. */
export function useIsTablet() {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 0.02}px)`);
}

/** True when the primary input is touch — drives hover-vs-tap decisions. */
export function useIsTouch() {
  return useMediaQuery("(hover: none) and (pointer: coarse)");
}

/** Respects the OS "reduce motion" setting. */
export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Page gutter for the current viewport. */
export function usePagePad() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  return isMobile ? PAGE_PAD.mobile : isTablet ? PAGE_PAD.tablet : PAGE_PAD.desktop;
}

// macOS-style layered shadows
export const SHADOW = {
  sm:  "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  md:  "0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.07)",
  lg:  "0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)",
  xl:  "0 24px 48px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.10)",
};

export const EASE        = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_SPRING = "cubic-bezier(0.34, 1.2, 0.64, 1)";

// ── Liquid Glass utilities ─────────────────────────────────────────────────────
export function glassCard(dark) {
  return dark ? {
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.07)",
  } : {
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.70)",
    boxShadow: "0 4px 24px rgba(26,18,15,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
  };
}

export function glassInput(dark) {
  return dark ? {
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.10)",
  } : {
    background: "rgba(255,255,255,0.90)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(26,18,15,0.10)",
  };
}

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

@media (prefers-reduced-motion: reduce) {
  .dv-skeleton {
    animation: none !important;
    background-position: 0 0 !important;
  }
}

/* Smooth theme crossfade for elements without their own transition */
body, body * {
  transition-property: background-color, color, border-color, fill, stroke, box-shadow;
  transition-duration: 0.45s;
  transition-timing-function: ease;
}

/* ── Mobile foundations ───────────────────────────────────────────────────── */

/* A single overflowing child used to make the whole page scroll sideways.
   Clamp at the root so one wide table can never break the page.

   NOTE: overflow-x:hidden here would be a trap — the spec makes the other
   axis compute to 'auto', turning the root into a scroll container. That
   silently kills window scroll events and the scroll-linked animations on
   the landing page. 'clip' clamps the same overflow without creating a
   scroll container. */
html, body {
  max-width: 100%;
}
body {
  overflow-x: clip;
}

/* Stop iOS from re-flowing type when the device is rotated to landscape. */
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* Media and embeds must never exceed their column. */
img, svg, video, canvas {
  max-width: 100%;
}

/* Horizontal scrollers (wide tables, chip rows) — momentum scrolling, no
   visible scrollbar, and a hint that the region scrolls independently. */
.dv-scroll-x {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.dv-scroll-x::-webkit-scrollbar { display: none; }

/* Snap wide row-based scrollers so cards land aligned instead of half-cut. */
.dv-snap-x {
  scroll-snap-type: x mandatory;
}
.dv-snap-x > * {
  scroll-snap-align: start;
}

/* Reserve the home-indicator strip on fixed bottom chrome. */
.dv-safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
.dv-safe-top    { padding-top:    env(safe-area-inset-top, 0px); }

@media (max-width: 767.98px) {
  /* iOS zooms the viewport when a focused input renders below 16px. Forcing the
     minimum kills that jump — the visual size is tuned per-field where needed. */
  input, select, textarea {
    font-size: max(16px, 1em);
  }

  /* Long unbroken strings (course codes, emails, URLs) must wrap rather than
     push the layout wider than the screen. */
  body {
    overflow-wrap: break-word;
    word-break: break-word;
  }

  /* 100px backdrop blurs are a real scroll cost on phones. Keep the glass look
     but at a radius the GPU can sustain. */
  .dv-glass-heavy {
    backdrop-filter: blur(28px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(160%) !important;
  }
}

/* Touch devices: grey tap flashes fight the app's own press states. */
@media (hover: none) and (pointer: coarse) {
  * { -webkit-tap-highlight-color: transparent; }
  /* Hover-driven reveals are unreachable without a pointer — show them. */
  .dv-hover-only { opacity: 1 !important; }
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
