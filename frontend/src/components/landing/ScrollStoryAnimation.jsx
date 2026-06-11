// ScrollStoryAnimation — "The Academic Constellation"
//
// A six-stage, scroll-driven SVG story for the Darvis landing page.
//
//   Stage 1 (p 0.00–0.15)  Scattered stars — every point is a course, a professor,
//                          a grade distribution, a requirement, a schedule block.
//   Stage 2 (p 0.15–0.32)  Relationships appear — curved paths draw themselves
//                          between related stars; mono labels fade in.
//   Stage 3 (p 0.32–0.52)  Constellations form — stars drift into four clusters
//                          (Requirements / Professors / Grades / Schedule) and
//                          halo rings expand around them.
//   Stage 4 (p 0.52–0.72)  Reorganization — the network un-knots itself and the
//                          stars travel from organic clusters to an ordered grid.
//                          Because connection paths are recomputed from live star
//                          positions every frame, the curves visibly morph from
//                          chaos into structure.
//   Stage 5 (p 0.72–0.90)  Schedule formation — stars land on a weekly grid and
//                          blocks materialize around them. A maroon path traces
//                          a hidden "D" (for Darvis) through the grid, then fades.
//   Stage 6 (p 0.90–1.00)  Resolution — the grid settles and the headline lands:
//                          "From scattered academic data to confident decisions."
//
// Engineering notes
//   • One scroll listener → requestAnimationFrame → a single progress float.
//     Everything is derived from `p`; no per-element timelines, no springs to
//     tear down, no layout thrash (only transform / opacity / dash-offset).
//   • No animation libraries: the project ships plain JSX + inline styles, and
//     this stays dependency-free for bundle size and 60fps headroom.
//   • Deterministic star field: a seeded PRNG keeps positions stable between
//     renders (no hydration jumps, no layout pops on re-render).
//   • prefers-reduced-motion: the sticky scroll stage is skipped entirely and a
//     static final frame (organized schedule + headline) renders instead.
//   • Responsive: SVG viewBox scales; on small screens the star count drops and
//     the scroll runway shortens.

import { useEffect, useMemo, useRef, useState } from "react";
import { MONO, SERIF, SANS, ACCENT, palette } from "../../theme.jsx";

// ── Tunables ──────────────────────────────────────────────────────────────────
const VB_W = 1000;            // SVG viewBox width
const VB_H = 620;             // SVG viewBox height
const RUNWAY_VH = 420;        // scroll distance that drives the story (in vh)
const STARS_DESKTOP = 26;
const STARS_MOBILE = 16;

// Weekly grid the constellation collapses into (5 days × 4 slots)
const GRID = { cols: 5, rows: 4, x0: 290, y0: 165, dx: 105, dy: 88 };

// Hidden "D" — stem + bowl, traced through the schedule grid in Stage 5
const D_PATH =
  "M 395 152 L 395 432 M 395 152 C 565 152, 650 220, 650 292 " +
  "C 650 364, 565 432, 395 432";
const D_PATH_LEN = 1320; // generous overestimate for dash animation

// Floating labels that appear in Stage 2 (star index → text)
const LABELS = [
  { star: 2,  text: "CS 3114" },
  { star: 6,  text: "MATH 1225" },
  { star: 10, text: "Algorithms" },
  { star: 14, text: "Professor Hamoda" },
  { star: 18, text: "A Rate" },
  { star: 21, text: "Requirement" },
];

// Constellation centroids for Stage 3
const CLUSTERS = [
  { x: 200, y: 165, label: "Requirements" },
  { x: 780, y: 150, label: "Professors" },
  { x: 235, y: 470, label: "Grade trends" },
  { x: 770, y: 465, label: "Schedule" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deterministic PRNG so the "random" sky is identical on every render.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Progress of `p` through the window [a, b], eased. The spine of every stage.
const phase = (p, a, b) => easeInOut(clamp01((p - a) / (b - a)));

// Curved connector between two live star positions. Curvature is derived from
// the segment itself, so as stars travel the curve morphs with them.
function curveBetween(ax, ay, bx, by) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const bend = 0.22;
  return `M ${ax} ${ay} Q ${mx - dy * bend} ${my + dx * bend} ${bx} ${by}`;
}

// ── Star field construction (memoized once) ───────────────────────────────────
function buildStars(count) {
  const rnd = mulberry32(20250610);
  const stars = [];
  for (let i = 0; i < count; i++) {
    const cluster = CLUSTERS[i % CLUSTERS.length];
    const cell = i % (GRID.cols * GRID.rows);
    stars.push({
      id: i,
      // Stage 1 — scattered across the whole sky (with margins)
      sx: 70 + rnd() * (VB_W - 140),
      sy: 60 + rnd() * (VB_H - 150),
      // Stage 3 — jittered orbit around an assigned constellation centroid
      cx: cluster.x + (rnd() - 0.5) * 130,
      cy: cluster.y + (rnd() - 0.5) * 105,
      // Stage 5 — an exact slot on the weekly schedule grid
      gx: GRID.x0 + (cell % GRID.cols) * GRID.dx,
      gy: GRID.y0 + Math.floor(cell / GRID.cols) * GRID.dy,
      r: 2.2 + rnd() * 2.4,
      // Stars beyond the grid capacity dissolve during Stage 5
      extra: i >= GRID.cols * GRID.rows,
      twinkleDelay: rnd() * 4,
    });
  }
  return stars;
}

// Nearest-neighbour pairs from the scattered sky → Stage 2 relationship lines.
function buildPairs(stars, maxPairs) {
  const pairs = [];
  const used = new Set();
  for (const s of stars) {
    let best = null, bestD = Infinity;
    for (const o of stars) {
      if (o.id === s.id) continue;
      const key = s.id < o.id ? `${s.id}-${o.id}` : `${o.id}-${s.id}`;
      if (used.has(key)) continue;
      const d = (s.sx - o.sx) ** 2 + (s.sy - o.sy) ** 2;
      if (d < bestD) { bestD = d; best = { key, a: s.id, b: o.id }; }
    }
    if (best && pairs.length < maxPairs) { used.add(best.key); pairs.push(best); }
  }
  return pairs;
}

// In-cluster pairs → Stage 3/4 constellation edges (morph into grid order).
function buildClusterPairs(stars) {
  const byCluster = [[], [], [], []];
  stars.forEach(s => byCluster[s.id % CLUSTERS.length].push(s.id));
  const pairs = [];
  byCluster.forEach(ids => {
    for (let i = 0; i < ids.length - 1; i++) pairs.push({ a: ids[i], b: ids[i + 1] });
  });
  return pairs;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScrollStoryAnimation({ dark }) {
  const t = palette(dark);
  const sectionRef = useRef(null);
  const [p, setP] = useState(0);
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [reduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );

  const stars = useMemo(() => buildStars(isMobile ? STARS_MOBILE : STARS_DESKTOP), [isMobile]);
  const pairs = useMemo(() => buildPairs(stars, isMobile ? 8 : 12), [stars, isMobile]);
  const clusterPairs = useMemo(() => buildClusterPairs(stars), [stars]);

  // Single scroll → rAF → progress float. The sticky stage pins for RUNWAY_VH,
  // and p is how far through that runway the viewport currently sits.
  useEffect(() => {
    if (reduced) { setP(1); return; }
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const el = sectionRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const runway = el.offsetHeight - window.innerHeight;
          setP(clamp01(-rect.top / Math.max(runway, 1)));
        }
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [reduced]);

  // ── Derived stage values (all pure functions of p) ──────────────────────────
  const drawLinks   = phase(p, 0.15, 0.30);   // Stage 2: lines draw in
  const labelsIn    = phase(p, 0.18, 0.30);   // Stage 2: labels fade in
  const labelsOut   = phase(p, 0.46, 0.56);   // labels release before reorganization
  const toCluster   = phase(p, 0.32, 0.50);   // Stage 3: scatter → constellation
  const halosIn     = phase(p, 0.38, 0.50);   // Stage 3: cluster halos expand
  const halosOut    = phase(p, 0.56, 0.66);
  const clusterEdge = phase(p, 0.40, 0.52);   // Stage 3: in-cluster edges draw
  const toGrid      = phase(p, 0.55, 0.74);   // Stage 4: constellation → grid
  const linksFade   = phase(p, 0.52, 0.64);   // Stage 4: original chaos releases
  const dDraw       = phase(p, 0.74, 0.88);   // Stage 5: hidden "D" traces
  const dFade       = phase(p, 0.92, 0.97);   // Stage 5: …and lets go
  const blocksIn    = phase(p, 0.78, 0.92);   // Stage 5: schedule blocks land
  const headlineIn  = phase(p, 0.90, 0.995);  // Stage 6: the story resolves

  // Live position of a star = scatter → cluster → grid, phase-blended.
  const posOf = s => {
    let x = lerp(s.sx, s.cx, toCluster);
    let y = lerp(s.sy, s.cy, toCluster);
    x = lerp(x, s.gx, toGrid);
    y = lerp(y, s.gy, toGrid);
    return { x, y };
  };

  const ink     = dark ? "rgba(244,239,233,0.85)" : "rgba(26,18,15,0.8)";
  const inkSoft = dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)";
  const wire    = dark ? "rgba(244,239,233,0.28)" : "rgba(26,18,15,0.26)";

  const days = ["MON", "TUE", "WED", "THU", "FRI"];

  // ── Reduced motion: static final frame, no pinned runway ───────────────────
  if (reduced) {
    return (
      <section style={{ padding: "80px 22px", textAlign: "center" }}>
        <StaticFinal dark={dark} t={t} stars={stars} />
      </section>
    );
  }

  return (
    <section ref={sectionRef} style={{ height: `${isMobile ? 340 : RUNWAY_VH}vh`, position: "relative" }}>
      {/* Pinned stage — stays on screen while the runway scrolls beneath it */}
      <div style={{
        position: "sticky", top: 0, height: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* Stage caption — quietly narrates where you are in the story */}
        <div style={{
          fontFamily: MONO, fontSize: 10.5, letterSpacing: "2px",
          textTransform: "uppercase", color: t.textMute,
          marginBottom: 10, height: 14,
        }}>
          {p < 0.15 ? "Every course · every professor · every outcome"
            : p < 0.32 ? "Relationships appear"
            : p < 0.55 ? "Constellations form"
            : p < 0.74 ? "Chaos becomes understanding"
            : "Your semester, organized"}
        </div>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "min(1100px, 94vw)", height: "auto", display: "block", overflow: "visible" }}
          role="img"
          aria-label="Animation: scattered academic data forming constellations, then organizing into a weekly schedule"
        >
          {/* ── Stage 2: chaos relationships (morph live, then release) ──────── */}
          {pairs.map(({ a, b }, i) => {
            const A = posOf(stars[a]); const B = posOf(stars[b]);
            const o = drawLinks * (1 - linksFade) * 0.8;
            if (o <= 0.01) return null;
            return (
              <path key={`l${i}`} d={curveBetween(A.x, A.y, B.x, B.y)}
                stroke={wire} strokeWidth="1" fill="none"
                strokeDasharray="500"
                strokeDashoffset={500 - drawLinks * 500}
                style={{ opacity: o }} />
            );
          })}

          {/* ── Stage 3→4: constellation edges (tighten into grid order) ─────── */}
          {clusterPairs.map(({ a, b }, i) => {
            const A = posOf(stars[a]); const B = posOf(stars[b]);
            const o = clusterEdge * (1 - blocksIn) * 0.55;
            if (o <= 0.01) return null;
            return (
              <path key={`c${i}`} d={curveBetween(A.x, A.y, B.x, B.y)}
                stroke={ACCENT} strokeWidth="1" fill="none"
                style={{ opacity: o }} />
            );
          })}

          {/* ── Stage 3: constellation halos + names ──────────────────────────── */}
          {CLUSTERS.map((c, i) => {
            const o = halosIn * (1 - halosOut);
            if (o <= 0.01) return null;
            return (
              <g key={`h${i}`} style={{ opacity: o }}>
                <circle cx={c.x} cy={c.y} r={86 * halosIn}
                  fill="none" stroke={ACCENT} strokeWidth="1"
                  strokeDasharray="3 7" opacity="0.5" />
                <text x={c.x} y={c.y - 96} textAnchor="middle"
                  fill={inkSoft} fontSize="11"
                  fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5">
                  {c.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* ── Stage 5: weekly schedule chrome (days + blocks) ──────────────── */}
          {days.map((d, i) => (
            <text key={d}
              x={GRID.x0 + i * GRID.dx} y={GRID.y0 - 46}
              textAnchor="middle" fill={inkSoft} fontSize="11"
              fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5"
              style={{ opacity: blocksIn }}>
              {d}
            </text>
          ))}
          {stars.filter(s => !s.extra).map((s, i) => {
            const stagger = clamp01(blocksIn * 1.6 - (i / stars.length) * 0.6);
            if (stagger <= 0.01) return null;
            return (
              <rect key={`b${s.id}`}
                x={s.gx - 38} y={s.gy - 26} width={76} height={52} rx={10}
                fill={dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.08)"}
                stroke={ACCENT} strokeOpacity={0.45 * stagger} strokeWidth="1"
                style={{
                  opacity: stagger,
                  transform: `scale(${0.85 + 0.15 * stagger})`,
                  transformOrigin: `${s.gx}px ${s.gy}px`,
                }} />
            );
          })}

          {/* ── Stage 5: the hidden Darvis "D" ────────────────────────────────── */}
          {dDraw > 0.01 && (
            <path d={D_PATH}
              stroke={ACCENT} strokeWidth="3" fill="none" strokeLinecap="round"
              strokeDasharray={D_PATH_LEN}
              strokeDashoffset={D_PATH_LEN - dDraw * D_PATH_LEN}
              style={{
                opacity: (1 - dFade) * 0.9,
                filter: `drop-shadow(0 0 6px ${ACCENT})`,
              }} />
          )}

          {/* ── Stars (alive through every stage) ─────────────────────────────── */}
          {stars.map(s => {
            const { x, y } = posOf(s);
            const dissolve = s.extra ? 1 - toGrid : 1;
            if (dissolve <= 0.01) return null;
            return (
              <g key={s.id} style={{ opacity: dissolve }}>
                {/* soft glow */}
                <circle cx={x} cy={y} r={s.r * 2.6}
                  fill={ACCENT} opacity={0.10 + 0.08 * toGrid} />
                {/* core */}
                <circle cx={x} cy={y} r={s.r} fill={ink}>
                  {/* gentle twinkle while the sky is still scattered */}
                  {p < 0.4 && (
                    <animate attributeName="opacity"
                      values="1;0.45;1" dur="3.2s"
                      begin={`${s.twinkleDelay}s`} repeatCount="indefinite" />
                  )}
                </circle>
              </g>
            );
          })}

          {/* ── Stage 2: floating mono labels ─────────────────────────────────── */}
          {LABELS.map(({ star, text }, i) => {
            if (star >= stars.length) return null;
            const { x, y } = posOf(stars[star]);
            const o = labelsIn * (1 - labelsOut);
            if (o <= 0.01) return null;
            return (
              <g key={`t${i}`} style={{ opacity: o }}>
                <line x1={x} y1={y} x2={x + 14} y2={y - 14} stroke={inkSoft} strokeWidth="1" />
                <text x={x + 18} y={y - 18} fill={ink} fontSize="11.5"
                  fontFamily="'JetBrains Mono', monospace" letterSpacing="0.5">
                  {text}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Stage 6: resolution headline ─────────────────────────────────────── */}
        <div style={{
          textAlign: "center", marginTop: 8,
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 22}px)`,
          pointerEvents: headlineIn > 0.5 ? "auto" : "none",
        }}>
          <p style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(24px, 3.4vw, 44px)", lineHeight: 1.15,
            letterSpacing: "-0.5px", color: t.text, maxWidth: 720,
          }}>
            From scattered academic data<br />
            to <span style={{ fontStyle: "italic", color: ACCENT }}>confident decisions.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Reduced-motion fallback: the story's final frame, no pinning ──────────────
function StaticFinal({ dark, t, stars }) {
  const inkSoft = dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)";
  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  return (
    <div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: "min(1100px, 94vw)", height: "auto", display: "block", margin: "0 auto" }}>
        {days.map((d, i) => (
          <text key={d} x={GRID.x0 + i * GRID.dx} y={GRID.y0 - 46} textAnchor="middle"
            fill={inkSoft} fontSize="11" fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5">{d}</text>
        ))}
        {stars.filter(s => !s.extra).map(s => (
          <g key={s.id}>
            <rect x={s.gx - 38} y={s.gy - 26} width={76} height={52} rx={10}
              fill={dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.08)"}
              stroke={ACCENT} strokeOpacity="0.45" strokeWidth="1" />
            <circle cx={s.gx} cy={s.gy} r={s.r}
              fill={dark ? "rgba(244,239,233,0.85)" : "rgba(26,18,15,0.8)"} />
          </g>
        ))}
      </svg>
      <p style={{
        fontFamily: SERIF, fontWeight: 400, margin: "26px auto 0",
        fontSize: "clamp(24px, 3.4vw, 44px)", lineHeight: 1.15,
        letterSpacing: "-0.5px", color: t.text, maxWidth: 720,
      }}>
        From scattered academic data to <span style={{ fontStyle: "italic", color: ACCENT }}>confident decisions.</span>
      </p>
    </div>
  );
}
