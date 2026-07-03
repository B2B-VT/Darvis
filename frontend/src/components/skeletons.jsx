import { useEffect, useState } from "react";
import { MONO, SANS, palette, RADIUS } from "../theme.jsx";

export function useMinimumLoading(loading, minimumMs = 160) {
  const [visible, setVisible] = useState(loading);

  useEffect(() => {
    let timer;
    if (loading) {
      setVisible(true);
      return undefined;
    }
    timer = setTimeout(() => setVisible(false), minimumMs);
    return () => clearTimeout(timer);
  }, [loading, minimumMs]);

  return visible;
}

function skColor(dark) {
  return dark
    ? "linear-gradient(90deg, rgba(244,239,233,0.045) 25%, rgba(244,239,233,0.10) 50%, rgba(244,239,233,0.045) 75%)"
    : "linear-gradient(90deg, rgba(26,18,15,0.045) 25%, rgba(26,18,15,0.10) 50%, rgba(26,18,15,0.045) 75%)";
}

export function Skeleton({ darkMode = true, width = "100%", height = 12, radius = 8, style = {} }) {
  return (
    <div
      aria-hidden="true"
      className="dv-skeleton"
      style={{
        width,
        height,
        borderRadius: radius,
        background: skColor(darkMode),
        backgroundSize: "200% 100%",
        ...style,
      }}
    />
  );
}

export function SkeletonText({ darkMode, lines = 3, widths = ["100%", "86%", "62%"], lineHeight = 12, gap = 8, style = {} }) {
  return (
    <div style={{ display: "grid", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} darkMode={darkMode} width={widths[i % widths.length]} height={lineHeight} radius={6} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ darkMode, size = 44, radius = RADIUS.sm, style = {} }) {
  return <Skeleton darkMode={darkMode} width={size} height={size} radius={radius} style={{ flexShrink: 0, ...style }} />;
}

export function SkeletonButton({ darkMode, width = 112, height = 34, style = {} }) {
  return <Skeleton darkMode={darkMode} width={width} height={height} radius={RADIUS.pill} style={style} />;
}

export function SkeletonCard({ darkMode, children, height, style = {} }) {
  const p = palette(darkMode);
  return (
    <div
      aria-busy="true"
      style={{
        background: p.card,
        border: `1px solid ${p.line}`,
        borderRadius: RADIUS.lg,
        padding: 18,
        minHeight: height,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children || <SkeletonText darkMode={darkMode} lines={4} />}
    </div>
  );
}

export function SkeletonChart({ darkMode, height = 180, bars = 8, style = {} }) {
  const p = palette(darkMode);
  return (
    <SkeletonCard darkMode={darkMode} style={{ padding: 18, ...style }}>
      <Skeleton darkMode={darkMode} width="38%" height={14} style={{ marginBottom: 18 }} />
      <div style={{ height, display: "flex", alignItems: "flex-end", gap: 8, borderBottom: `1px solid ${p.lineSoft}` }}>
        {Array.from({ length: bars }).map((_, i) => (
          <Skeleton
            key={i}
            darkMode={darkMode}
            width="100%"
            height={`${34 + ((i * 19) % 58)}%`}
            radius={RADIUS.xs}
            style={{ flex: 1 }}
          />
        ))}
      </div>
    </SkeletonCard>
  );
}

export function SkeletonTable({ darkMode, rows = 6, cols = 4, style = {} }) {
  const p = palette(darkMode);
  return (
    <SkeletonCard darkMode={darkMode} style={{ padding: 0, overflow: "hidden", ...style }}>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: "14px 18px", borderTop: row ? `1px solid ${p.lineSoft}` : "none" }}>
          {Array.from({ length: cols }).map((__, col) => (
            <Skeleton key={col} darkMode={darkMode} width={col === 0 ? "72%" : "56%"} height={11} />
          ))}
        </div>
      ))}
    </SkeletonCard>
  );
}

export function SkeletonCourseCard({ darkMode }) {
  return (
    <SkeletonCard darkMode={darkMode} height={188}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <Skeleton darkMode={darkMode} width={90} height={22} radius={RADIUS.pill} style={{ marginBottom: 12 }} />
          <Skeleton darkMode={darkMode} width="74%" height={18} style={{ marginBottom: 9 }} />
          <Skeleton darkMode={darkMode} width="46%" height={12} />
        </div>
        <SkeletonAvatar darkMode={darkMode} size={48} radius={24} />
      </div>
      <SkeletonChart darkMode={darkMode} height={54} bars={10} style={{ background: "transparent", border: "none", padding: 0 }} />
    </SkeletonCard>
  );
}

export function SkeletonProfessorCard({ darkMode }) {
  return (
    <SkeletonCard darkMode={darkMode} height={184}>
      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        <SkeletonAvatar darkMode={darkMode} size={48} />
        <div style={{ flex: 1, paddingTop: 3 }}>
          <Skeleton darkMode={darkMode} width="70%" height={15} style={{ marginBottom: 9 }} />
          <Skeleton darkMode={darkMode} width="34%" height={10} />
        </div>
      </div>
      <Skeleton darkMode={darkMode} width="42%" height={24} style={{ marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[0, 1, 2].map(i => <Skeleton key={i} darkMode={darkMode} width={58 + i * 8} height={20} radius={RADIUS.pill} />)}
      </div>
      <Skeleton darkMode={darkMode} width="100%" height={1} style={{ marginBottom: 12 }} />
      <Skeleton darkMode={darkMode} width="52%" height={10} />
    </SkeletonCard>
  );
}

export function SkeletonSidebar({ darkMode, rows = 8, style = {} }) {
  const p = palette(darkMode);
  return (
    <div aria-busy="true" style={{ borderRight: `1px solid ${p.line}`, padding: 14, ...style }}>
      <SkeletonButton darkMode={darkMode} width="100%" height={38} style={{ marginBottom: 18 }} />
      <Skeleton darkMode={darkMode} width="72%" height={13} style={{ marginBottom: 14 }} />
      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} darkMode={darkMode} width={`${92 - (i % 4) * 9}%`} height={34} radius={RADIUS.sm} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChatMessage({ darkMode, role = "assistant" }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ width: isUser ? "58%" : "78%" }}>
        {!isUser && <SkeletonAvatar darkMode={darkMode} size={28} radius={8} style={{ marginBottom: 10 }} />}
        <SkeletonCard darkMode={darkMode} style={{ borderRadius: isUser ? 18 : RADIUS.md, padding: isUser ? 14 : 16 }}>
          <SkeletonText darkMode={darkMode} lines={isUser ? 2 : 4} widths={isUser ? ["92%", "54%"] : ["96%", "88%", "74%", "45%"]} />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function SkeletonChatPage({ darkMode, isMobile = false }) {
  return (
    <div aria-busy="true" style={{ display: "flex", height: "100%", width: "100%" }}>
      {!isMobile && <SkeletonSidebar darkMode={darkMode} rows={9} style={{ width: 280, flexShrink: 0 }} />}
      <div style={{ flex: 1, padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", display: "grid", gap: 18 }}>
          <Skeleton darkMode={darkMode} width="40%" height={28} style={{ margin: "24px auto 8px" }} />
          <Skeleton darkMode={darkMode} width="100%" height={58} radius={30} />
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {[120, 142, 116, 136].map(w => <SkeletonButton key={w} darkMode={darkMode} width={w} height={40} />)}
          </div>
          <SkeletonChatMessage darkMode={darkMode} role="user" />
          <SkeletonChatMessage darkMode={darkMode} role="assistant" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonSchedule({ darkMode, isMobile = false }) {
  const p = palette(darkMode);
  return (
    <div aria-busy="true" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: isMobile ? "none" : "flex", gap: 8 }}>
        <SkeletonButton darkMode={darkMode} width={128} />
        <SkeletonButton darkMode={darkMode} width={104} />
      </div>
      <div style={{ background: p.bgRaised, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(5, 1fr)", borderBottom: `1px solid ${p.line}` }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ padding: 12 }}><Skeleton darkMode={darkMode} height={14} /></div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(5, 1fr)", height: isMobile ? 420 : 620 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ borderRight: i < 5 ? `1px solid ${p.lineSoft}` : "none", padding: 8, position: "relative" }}>
              {i > 0 && [70, 180, 320].map((top, j) => (
                <Skeleton key={j} darkMode={darkMode} width="86%" height={j === 1 ? 92 : 64} radius={RADIUS.sm} style={{ position: "absolute", left: 6, right: 6, top: top + i * 8 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonForumList({ darkMode, rows = 5 }) {
  return (
    <div aria-busy="true" style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} darkMode={darkMode} style={{ padding: "18px 22px" }}>
          <Skeleton darkMode={darkMode} width={`${65 + (i % 2) * 18}%`} height={16} style={{ marginBottom: 12 }} />
          <SkeletonText darkMode={darkMode} lines={2} widths={["92%", "58%"]} lineHeight={11} />
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <Skeleton darkMode={darkMode} width={82} height={10} />
            <Skeleton darkMode={darkMode} width={58} height={10} />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function SkeletonLandingDashboard({ darkMode }) {
  return (
    <div aria-busy="true" style={{ minHeight: "100vh", padding: "72px 64px", fontFamily: SANS }}>
      <Skeleton darkMode={darkMode} width="min(680px, 72%)" height={92} radius={14} style={{ marginBottom: 24 }} />
      <SkeletonText darkMode={darkMode} lines={2} widths={["420px", "320px"]} lineHeight={16} style={{ marginBottom: 34 }} />
      <div style={{ display: "flex", gap: 12, marginBottom: 68 }}>
        <SkeletonButton darkMode={darkMode} width={160} height={48} />
        <SkeletonButton darkMode={darkMode} width={132} height={48} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[0, 1, 2].map(i => <SkeletonCard key={i} darkMode={darkMode} height={160} />)}
      </div>
    </div>
  );
}

export function SkeletonSearchResults({ darkMode, rows = 6 }) {
  return (
    <div aria-busy="true" style={{ display: "grid", gap: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} darkMode={darkMode} style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Skeleton darkMode={darkMode} width="28%" height={18} style={{ marginBottom: 10 }} />
              <SkeletonText darkMode={darkMode} lines={2} widths={["88%", "52%"]} />
            </div>
            <SkeletonButton darkMode={darkMode} width={88} height={32} />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function LoadingShell({ darkMode }) {
  const p = palette(darkMode);
  return (
    <div aria-busy="true" style={{ minHeight: "100vh", background: p.bg, fontFamily: SANS }}>
      <div style={{ display: "flex" }}>
        <SkeletonSidebar darkMode={darkMode} rows={6} style={{ width: 304, height: "100vh", flexShrink: 0 }} />
        <SkeletonLandingDashboard darkMode={darkMode} />
      </div>
    </div>
  );
}

export function SkeletonLabel({ children = "Loading", darkMode }) {
  const p = palette(darkMode);
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", color: p.textFaint, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}
