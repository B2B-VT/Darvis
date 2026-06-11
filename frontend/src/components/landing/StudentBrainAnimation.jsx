// StudentBrainAnimation — "The Student Brain"
//
// A scroll-driven SVG story about how Darvis thinks:
//
//     Data → Understanding → Insight → Decision
//
//   Stage 1 (p 0.00–0.12)  Raw academic information. Dozens of disconnected
//                          nodes drift across the screen — courses, professors,
//                          GPA outcomes, requirements, time slots. Overwhelm.
//   Stage 2 (p 0.12–0.32)  The brain awakens. Nodes migrate into a soft,
//                          brain-suggesting silhouette (never literal) while
//                          thin synapse lines draw themselves between related
//                          points. Relationship labels surface: "prerequisite",
//                          "teaches", "fulfills", "fits".
//   Stage 3 (p 0.32–0.50)  Understanding. Four regions resolve inside the
//                          network — Degree Planning, Professors, Schedule,
//                          Performance. Important nodes brighten; peripheral
//                          ones recede. The system is weighing what matters.
//   Stage 4 (p 0.42–0.70)  Darvis thinking — the signature moment. Pulses
//                          travel along the synapses on a continuous clock
//                          (they keep moving even if scrolling pauses). Then a
//                          single decision path illuminates while alternative
//                          edges quietly fade: not searching — reasoning.
//   Stage 5 (p 0.62–0.84)  Insight emerges. The network converges and begins
//                          reorganizing toward order. Insight chips surface:
//                          best professor path · schedule fit · requirement
//                          progress. During the morph, the brightest path
//                          briefly traces a subtle "D" — discovered, not shown.
//   Stage 6 (p 0.84–1.00)  The answer. A clean weekly schedule grid. Clarity.
//                          "It understands how everything connects."
//
// Engineering
//   • One scroll listener → rAF → a single progress float `p`. Every visual is
//     a pure function of `p` (plus one low-cost clock for traveling signals).
//   • No animation libraries — plain JSX project; transform/opacity/dashoffset
//     only, so the compositor does the work. ~120 SVG elements total.
//   • Deterministic seeded layout: stable across renders, no hydration pops.
//   • prefers-reduced-motion → static, already-organized schedule + headline.
//   • Mobile → fewer nodes, shorter scroll runway, same story.

import { useEffect, useMemo, useRef, useState } from "react";
import { MONO, SERIF, ACCENT, palette } from "../../theme.jsx";

// ── Canvas + story tunables ───────────────────────────────────────────────────
const VB_W = 1000;
const VB_H = 620;
const RUNWAY_VH = 440;          // pinned scroll distance (desktop)
const NODES_DESKTOP = 34;
const NODES_MOBILE = 18;

// Weekly grid the brain resolves into (5 days × 4 slots)
const GRID = { cols: 5, rows: 4, x0: 290, y0: 165, dx: 105, dy: 88 };

// The quiet "D" — stem + bowl, traced once during the reorganization.
// Low opacity, no glow: a brand moment to be discovered, not announced.
const D_PATH =
  "M 395 152 L 395 432 M 395 152 C 565 152, 650 220, 650 292 " +
  "C 650 364, 565 432, 395 432";
const D_LEN = 1320;

// Brain "regions" — four anatomical-ish centroids (profile facing right).
// The union of jittered nodes around these suggests a brain mass without
// ever drawing one.
const REGIONS = [
  { x: 645, y: 245, label: "Degree planning" },   // frontal
  { x: 475, y: 185, label: "Professors" },        // parietal (top)
  { x: 330, y: 295, label: "Schedule" },          // occipital (rear)
  { x: 520, y: 385, label: "Performance" },       // temporal (lower)
];

// Stage 1 floating labels (node index → text)
const NODE_LABELS = [
  { node: 0,  text: "CS 3114" },
  { node: 4,  text: "MATH 1225" },
  { node: 8,  text: "COMM 2004" },
  { node: 12, text: "Algorithms" },
  { node: 16, text: "Professor Hamoda" },
  { node: 20, text: "A Rate" },
  { node: 24, text: "Prerequisite" },
  { node: 28, text: "Tuesday 3 PM" },
  { node: 32, text: "Major Requirement" },
];

// Stage 2 relationship words, attached to early synapses
const EDGE_LABELS = ["prerequisite", "teaches", "fulfills", "fits"];

// Stage 5 insight chips
const INSIGHTS = ["Best professor path", "Schedule fit", "Requirement progress"];

// The decision path Darvis "chooses" — a chain of node ids spanning regions:
// course → prerequisite → professor → section → time slot.
const DECISION_PATH = [0, 24, 16, 28, 13];

// ── Math helpers ──────────────────────────────────────────────────────────────
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
const phase = (p, a, b) => easeInOut(clamp01((p - a) / (b - a)));

// Quadratic-bezier control point for an edge — curvature comes from the
// segment itself so curves morph organically as nodes travel.
function ctrlOf(ax, ay, bx, by) {
  return { cx: (ax + bx) / 2 - (by - ay) * 0.2, cy: (ay + by) / 2 + (bx - ax) * 0.2 };
}
function edgeD(ax, ay, bx, by) {
  const { cx, cy } = ctrlOf(ax, ay, bx, by);
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}
// Point at parameter t along that same quadratic — used by traveling signals.
function edgePoint(ax, ay, bx, by, t) {
  const { cx, cy } = ctrlOf(ax, ay, bx, by);
  const u = 1 - t;
  return {
    x: u * u * ax + 2 * u * t * cx + t * t * bx,
    y: u * u * ay + 2 * u * t * cy + t * t * by,
  };
}

// ── Layout construction (memoized once) ───────────────────────────────────────
function buildNodes(count) {
  const rnd = mulberry32(20260611);
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const region = REGIONS[i % REGIONS.length];
    const cell = i % (GRID.cols * GRID.rows);
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd());
    nodes.push({
      id: i,
      // Stage 1 — scattered everywhere
      sx: 70 + rnd() * (VB_W - 140),
      sy: 55 + rnd() * (VB_H - 140),
      // Stage 2–4 — settled in its brain region (elliptical jitter so the
      // union of all regions reads as one organic mass)
      bx: region.x + Math.cos(ang) * rad * 105,
      by: region.y + Math.sin(ang) * rad * 78,
      // Stage 6 — a slot on the weekly grid
      gx: GRID.x0 + (cell % GRID.cols) * GRID.dx,
      gy: GRID.y0 + Math.floor(cell / GRID.cols) * GRID.dy,
      r: 2.4 + rnd() * 2.2,
      weight: rnd(),                       // importance (stage 3 contrast)
      extra: i >= GRID.cols * GRID.rows,   // dissolves before the grid forms
      drift: rnd() * Math.PI * 2,          // phase for idle micro-drift
    });
  }
  return nodes;
}

// Edges: chains within regions + a few cross-region synapses.
function buildEdges(nodes) {
  const byRegion = [[], [], [], []];
  nodes.forEach(n => byRegion[n.id % REGIONS.length].push(n.id));
  const edges = [];
  byRegion.forEach(ids => {
    for (let i = 0; i < ids.length - 1; i++) edges.push({ a: ids[i], b: ids[i + 1] });
  });
  // Cross-region links — the "thinking across domains" connections
  const cross = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]];
  cross.forEach(([ra, rb], k) => {
    const a = byRegion[ra][k % byRegion[ra].length];
    const b = byRegion[rb][(k + 1) % byRegion[rb].length];
    if (a !== undefined && b !== undefined) edges.push({ a, b });
  });
  return edges;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudentBrainAnimation({ dark }) {
  const t = palette(dark);
  const sectionRef = useRef(null);
  const pRef = useRef(0);
  const [p, setP] = useState(0);
  const [clock, setClock] = useState(0);   // continuous time for signals
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [reduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );

  const nodes = useMemo(() => buildNodes(isMobile ? NODES_MOBILE : NODES_DESKTOP), [isMobile]);
  const edges = useMemo(() => buildEdges(nodes), [nodes]);

  // Scroll → progress (rAF-throttled, passive)
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
          const v = clamp01(-rect.top / Math.max(runway, 1));
          pRef.current = v;
          setP(v);
        }
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [reduced]);

  // Continuous clock — drives traveling signals + idle micro-drift during the
  // "thinking" window only. The loop always runs but only commits state inside
  // the window, so outside Stage 4 it costs one comparison per frame.
  useEffect(() => {
    if (reduced) return;
    let raf = null;
    let last = 0;
    const loop = ts => {
      const v = pRef.current;
      if (v > 0.30 && v < 0.80 && ts - last > 16) {   // ~60fps cap
        last = ts;
        setClock(ts / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // ── Stage phases (pure functions of p) ──────────────────────────────────────
  const toBrain    = phase(p, 0.12, 0.30);  // scatter → brain silhouette
  const linksIn    = phase(p, 0.16, 0.34);  // synapses draw themselves
  const nodeLblIn  = phase(p, 0.02, 0.10);  // stage-1 labels appear…
  const nodeLblOut = phase(p, 0.26, 0.36);  // …and release as the brain forms
  const edgeLblIn  = phase(p, 0.22, 0.32);  // relationship words
  const edgeLblOut = phase(p, 0.40, 0.48);
  const regionsIn  = phase(p, 0.34, 0.46);  // region names + importance contrast
  const regionsOut = phase(p, 0.56, 0.66);
  const sigOn      = phase(p, 0.40, 0.48) * (1 - phase(p, 0.66, 0.74)); // pulses
  const decideIn   = phase(p, 0.52, 0.64);  // decision path illuminates
  const othersFade = phase(p, 0.54, 0.68);  // alternatives recede
  const toGrid     = phase(p, 0.62, 0.82);  // brain → order
  const dTrace     = phase(p, 0.68, 0.84);  // quiet "D"
  const dGone      = phase(p, 0.88, 0.94);
  const chipsIn    = phase(p, 0.64, 0.72);
  const chipsOut   = phase(p, 0.80, 0.86);
  const blocksIn   = phase(p, 0.80, 0.93);  // schedule blocks land
  const headlineIn = phase(p, 0.90, 0.995);

  // Live node position: scatter → brain → grid, with a breath of organic
  // micro-drift while the network is alive (drift dies as order arrives).
  const posOf = n => {
    let x = lerp(n.sx, n.bx, toBrain);
    let y = lerp(n.sy, n.by, toBrain);
    const breathe = (1 - toGrid) * toBrain * 3.5;
    x += Math.sin(clock * 0.9 + n.drift) * breathe;
    y += Math.cos(clock * 0.7 + n.drift) * breathe;
    x = lerp(x, n.gx, toGrid);
    y = lerp(y, n.gy, toGrid);
    return { x, y };
  };

  // Node opacity: stage-3 importance contrast; extras dissolve before the grid
  const alphaOf = n => {
    const contrast = regionsIn * (1 - toGrid);
    const importance = n.weight > 0.55 ? 1 : lerp(1, 0.38, contrast);
    const dissolve = n.extra ? 1 - toGrid : 1;
    return importance * dissolve;
  };

  const onPath = id => DECISION_PATH.includes(id);
  const pathEdges = useMemo(() => {
    const list = [];
    for (let i = 0; i < DECISION_PATH.length - 1; i++) {
      list.push({ a: DECISION_PATH[i], b: DECISION_PATH[i + 1] });
    }
    return list;
  }, []);

  const ink     = dark ? "rgba(244,239,233,0.85)" : "rgba(26,18,15,0.8)";
  const inkSoft = dark ? "rgba(244,239,233,0.35)" : "rgba(26,18,15,0.35)";
  const wire    = dark ? "rgba(244,239,233,0.22)" : "rgba(26,18,15,0.20)";
  const days = ["MON", "TUE", "WED", "THU", "FRI"];

  // ── Reduced motion: the decision, already made ──────────────────────────────
  if (reduced) {
    return (
      <section style={{ padding: "80px 22px", textAlign: "center" }}>
        <StaticAnswer dark={dark} t={t} nodes={nodes} />
      </section>
    );
  }

  return (
    <section ref={sectionRef} style={{ height: `${isMobile ? 360 : RUNWAY_VH}vh`, position: "relative" }}>
      <div style={{
        position: "sticky", top: 0, height: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* Narration — one quiet line tracking the story */}
        <div style={{
          fontFamily: MONO, fontSize: 10.5, letterSpacing: "2px",
          textTransform: "uppercase", color: t.textMute,
          marginBottom: 10, height: 14,
        }}>
          {p < 0.12 ? "Raw academic information"
            : p < 0.34 ? "The brain awakens"
            : p < 0.52 ? "Understanding relationships"
            : p < 0.66 ? "Darvis is reasoning"
            : p < 0.84 ? "Insight emerges"
            : "Your answer"}
        </div>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "min(1100px, 94vw)", height: "auto", display: "block", overflow: "visible" }}
          role="img"
          aria-label="Animation: scattered academic data forms a thinking network, reasons through options, and resolves into an organized weekly schedule"
        >
          {/* ── Synapses (live-morphing; recede when the decision is made) ───── */}
          {edges.map(({ a, b }, i) => {
            const A = posOf(nodes[a]); const B = posOf(nodes[b]);
            const base = linksIn * (1 - blocksIn);
            const recede = 1 - othersFade * 0.78;
            const o = base * recede * 0.7;
            if (o <= 0.01) return null;
            return (
              <path key={`e${i}`} d={edgeD(A.x, A.y, B.x, B.y)}
                stroke={wire} strokeWidth="1" fill="none"
                strokeDasharray="600"
                strokeDashoffset={600 - linksIn * 600}
                style={{ opacity: o }} />
            );
          })}

          {/* ── Decision path — Darvis chooses (alternatives have faded) ─────── */}
          {pathEdges.map(({ a, b }, i) => {
            const A = posOf(nodes[a]); const B = posOf(nodes[b]);
            const o = decideIn * (1 - blocksIn);
            if (o <= 0.01) return null;
            return (
              <path key={`d${i}`} d={edgeD(A.x, A.y, B.x, B.y)}
                stroke={ACCENT} strokeWidth="2" fill="none" strokeLinecap="round"
                strokeDasharray="600"
                strokeDashoffset={600 - decideIn * 600}
                style={{ opacity: o * 0.9 }} />
            );
          })}

          {/* ── Traveling signals — the network thinking (continuous clock) ──── */}
          {sigOn > 0.01 && edges.map(({ a, b }, i) => {
            if (i % 3 !== 0) return null;            // a third of synapses pulse
            const A = posOf(nodes[a]); const B = posOf(nodes[b]);
            const tt = (clock * 0.22 + i * 0.13) % 1;
            const pt = edgePoint(A.x, A.y, B.x, B.y, tt);
            return (
              <circle key={`s${i}`} cx={pt.x} cy={pt.y} r="2.4"
                fill={ACCENT} style={{ opacity: sigOn * 0.85 }} />
            );
          })}

          {/* ── Region names (inside the living network) ──────────────────────── */}
          {REGIONS.map((rgn, i) => {
            const o = regionsIn * (1 - regionsOut);
            if (o <= 0.01) return null;
            return (
              <text key={`r${i}`} x={rgn.x} y={rgn.y - 92} textAnchor="middle"
                fill={inkSoft} fontSize="11"
                fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5"
                style={{ opacity: o }}>
                {rgn.label.toUpperCase()}
              </text>
            );
          })}

          {/* ── Schedule chrome (Stage 6) ─────────────────────────────────────── */}
          {days.map((d, i) => (
            <text key={d}
              x={GRID.x0 + i * GRID.dx} y={GRID.y0 - 46}
              textAnchor="middle" fill={inkSoft} fontSize="11"
              fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5"
              style={{ opacity: blocksIn }}>
              {d}
            </text>
          ))}
          {nodes.filter(n => !n.extra).map((n, i) => {
            const stagger = clamp01(blocksIn * 1.6 - (i / nodes.length) * 0.6);
            if (stagger <= 0.01) return null;
            return (
              <rect key={`b${n.id}`}
                x={n.gx - 38} y={n.gy - 26} width={76} height={52} rx={10}
                fill={dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.08)"}
                stroke={ACCENT} strokeOpacity={0.45 * stagger} strokeWidth="1"
                style={{
                  opacity: stagger,
                  transform: `scale(${0.85 + 0.15 * stagger})`,
                  transformOrigin: `${n.gx}px ${n.gy}px`,
                }} />
            );
          })}

          {/* ── The quiet "D" — discovered during the reorganization ──────────── */}
          {dTrace > 0.01 && (
            <path d={D_PATH}
              stroke={ACCENT} strokeWidth="2" fill="none" strokeLinecap="round"
              strokeDasharray={D_LEN}
              strokeDashoffset={D_LEN - dTrace * D_LEN}
              style={{ opacity: (1 - dGone) * 0.4 }} />
          )}

          {/* ── Nodes (alive through every stage) ─────────────────────────────── */}
          {nodes.map(n => {
            const { x, y } = posOf(n);
            const a = alphaOf(n);
            if (a <= 0.01) return null;
            const lit = onPath(n.id) && decideIn > 0.1;
            return (
              <g key={n.id} style={{ opacity: a }}>
                <circle cx={x} cy={y} r={n.r * 2.4}
                  fill={ACCENT} opacity={lit ? 0.22 : 0.08 + 0.08 * toGrid} />
                <circle cx={x} cy={y} r={lit ? n.r + 0.8 : n.r}
                  fill={lit ? ACCENT : ink}>
                  {p < 0.3 && (
                    <animate attributeName="opacity" values="1;0.5;1" dur="3.4s"
                      begin={`${n.drift}s`} repeatCount="indefinite" />
                  )}
                </circle>
              </g>
            );
          })}

          {/* ── Stage 1 labels (the overwhelm) ────────────────────────────────── */}
          {NODE_LABELS.map(({ node, text }, i) => {
            if (node >= nodes.length) return null;
            const { x, y } = posOf(nodes[node]);
            const o = nodeLblIn * (1 - nodeLblOut);
            if (o <= 0.01) return null;
            return (
              <g key={`nl${i}`} style={{ opacity: o }}>
                <line x1={x} y1={y} x2={x + 13} y2={y - 13} stroke={inkSoft} strokeWidth="1" />
                <text x={x + 17} y={y - 17} fill={ink} fontSize="11"
                  fontFamily="'JetBrains Mono', monospace" letterSpacing="0.5">
                  {text}
                </text>
              </g>
            );
          })}

          {/* ── Stage 2 relationship words on early synapses ──────────────────── */}
          {EDGE_LABELS.map((word, i) => {
            const e = edges[i * 2];
            if (!e) return null;
            const A = posOf(nodes[e.a]); const B = posOf(nodes[e.b]);
            const mid = edgePoint(A.x, A.y, B.x, B.y, 0.5);
            const o = edgeLblIn * (1 - edgeLblOut);
            if (o <= 0.01) return null;
            return (
              <text key={`el${i}`} x={mid.x} y={mid.y - 7} textAnchor="middle"
                fill={ACCENT} fontSize="10" fontStyle="italic"
                fontFamily="'Instrument Serif', Georgia, serif" letterSpacing="0.5"
                style={{ opacity: o * 0.9 }}>
                {word}
              </text>
            );
          })}

          {/* ── Stage 5 insight chips ─────────────────────────────────────────── */}
          {INSIGHTS.map((label, i) => {
            const o = chipsIn * (1 - chipsOut);
            if (o <= 0.01) return null;
            const cx = 500 + (i - 1) * 235;
            const w = label.length * 6.6 + 30;
            return (
              <g key={`i${i}`} style={{
                opacity: o,
                transform: `translateY(${(1 - chipsIn) * 14}px)`,
              }}>
                <rect x={cx - w / 2} y={36} width={w} height={26} rx={13}
                  fill="none" stroke={ACCENT} strokeOpacity="0.45" strokeWidth="1" />
                <text x={cx} y={53} textAnchor="middle"
                  fill={ink} fontSize="10.5"
                  fontFamily="'JetBrains Mono', monospace" letterSpacing="1">
                  {label.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Stage 6 headline ──────────────────────────────────────────────────── */}
        <div style={{
          textAlign: "center", marginTop: 8,
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 22}px)`,
          pointerEvents: headlineIn > 0.5 ? "auto" : "none",
        }}>
          <p style={{
            fontFamily: SERIF, fontWeight: 400, margin: 0,
            fontSize: "clamp(24px, 3.4vw, 44px)", lineHeight: 1.15,
            letterSpacing: "-0.5px", color: t.text, maxWidth: 760,
          }}>
            It understands how<br />
            <span style={{ fontStyle: "italic", color: ACCENT }}>everything connects.</span>
          </p>
          <p style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: "1.6px",
            textTransform: "uppercase", color: t.textMute, marginTop: 16,
          }}>
            Data → understanding → insight → decision
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Reduced-motion fallback: the decision, already made ───────────────────────
function StaticAnswer({ dark, t, nodes }) {
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
        {nodes.filter(n => !n.extra).map(n => (
          <g key={n.id}>
            <rect x={n.gx - 38} y={n.gy - 26} width={76} height={52} rx={10}
              fill={dark ? "rgba(134,31,65,0.16)" : "rgba(134,31,65,0.08)"}
              stroke={ACCENT} strokeOpacity="0.45" strokeWidth="1" />
            <circle cx={n.gx} cy={n.gy} r={n.r}
              fill={dark ? "rgba(244,239,233,0.85)" : "rgba(26,18,15,0.8)"} />
          </g>
        ))}
      </svg>
      <p style={{
        fontFamily: SERIF, fontWeight: 400, margin: "26px auto 0",
        fontSize: "clamp(24px, 3.4vw, 44px)", lineHeight: 1.15,
        letterSpacing: "-0.5px", color: t.text, maxWidth: 760,
      }}>
        It understands how <span style={{ fontStyle: "italic", color: ACCENT }}>everything connects.</span>
      </p>
    </div>
  );
}
