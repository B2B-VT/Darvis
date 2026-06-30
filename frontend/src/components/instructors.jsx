// Browse Instructors page — card grid with autocomplete search + liquid glass
import { useState, useEffect, useMemo, useRef } from "react";
import { API } from "../api.js";
import { GpaBadge } from "./courses.jsx";
import { StarRating } from "./nav-auth.jsx";
import {
  MONO, SERIF, SANS, ACCENT, EASE,
  palette, glassCard, glassInput, RADIUS, SHADOW,
} from "../theme.jsx";

function sanitize(raw) {
  if (!raw) return "";
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/[ \t]+/g, " ").slice(0, 200);
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ name, size = 52 }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
  const hue = (name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 0) * 13) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: RADIUS.sm, flexShrink: 0,
      background: `hsl(${hue}, 38%, 40%)`,
      color: "white", fontFamily: SERIF, fontWeight: 400,
      fontSize: size * 0.36, display: "flex", alignItems: "center", justifyContent: "center",
      letterSpacing: "-0.5px",
    }}>{initials}</div>
  );
}

// ── Instructor Card ───────────────────────────────────────────────
function InstructorCard({ instructor, darkMode, onClick }) {
  const p = palette(darkMode);
  const [hov, setHov] = useState(false);
  const hasRmp = instructor.rmpRating != null;
  const dept = (instructor.department || "").toUpperCase();

  return (
    <div onClick={() => onClick(instructor)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? p.cardHover : p.card,
        border: `1px solid ${hov ? "rgba(134,31,65,0.38)" : p.line}`,
        borderRadius: RADIUS.lg,
        padding: "20px 20px 18px",
        cursor: "pointer",
        transition: `border-color 0.18s ${EASE}, background 0.18s ${EASE}, transform 0.18s ${EASE}, box-shadow 0.18s ${EASE}`,
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? SHADOW.lg : SHADOW.sm,
        display: "flex", flexDirection: "column", gap: 0,
        fontFamily: SANS,
      }}>

      {/* Top row: avatar + name + dept */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <Avatar name={instructor.name} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: p.text, fontFamily: SANS, marginBottom: 3, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instructor.name}</div>
          {dept && <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "1.3px", color: ACCENT, textTransform: "uppercase" }}>{dept}</div>}
        </div>
      </div>

      {/* RMP rating — SERIF large number */}
      {hasRmp ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: p.text, lineHeight: 1 }}>{instructor.rmpRating.toFixed(1)}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <StarRating rating={instructor.rmpRating} size={11} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: p.textMute, fontWeight: 600, letterSpacing: "0.5px" }}>{instructor.rmpCount} reviews</span>
          </div>
          {instructor.rmpDifficulty != null && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: p.textSub }}>Diff</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 400, color: p.textSub, lineHeight: 1 }}>{instructor.rmpDifficulty.toFixed(1)}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, color: p.textFaint, fontStyle: "italic", marginBottom: 10 }}>No RMP data</div>
      )}

      {/* GPA */}
      {instructor.avgGpa > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "1px", color: p.textMute, textTransform: "uppercase" }}>Avg GPA</span>
          <GpaBadge gpa={instructor.avgGpa} darkMode={darkMode} />
        </div>
      )}

      {/* Tags */}
      {instructor.rmpTags && instructor.rmpTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {instructor.rmpTags.slice(0, 3).map(tag => (
            <span key={tag} style={{ background: p.card, color: p.textSub, fontSize: 9, fontFamily: MONO, fontWeight: 600, padding: "2px 7px", borderRadius: RADIUS.pill, border: `1px solid ${p.line}`, letterSpacing: "0.3px" }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ paddingTop: 12, borderTop: `1px solid ${p.lineSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textFaint, letterSpacing: "0.5px", textTransform: "uppercase" }}>
          {instructor.totalCourses ? `${instructor.totalCourses} course${instructor.totalCourses !== 1 ? "s" : ""}` : "View profile"}
        </span>
        <span style={{ fontSize: 13, color: p.textFaint }}>›</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function InstructorsPage({ darkMode, onProfClick }) {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [rmpOnly, setRmpOnly] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const searchRef = useRef(null);
  const dm = darkMode;
  const p = palette(dm);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    API.getInstructors()
      .then(data => { setInstructors(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    return [...new Set(instructors.map(i => i.department).filter(Boolean))].sort();
  }, [instructors]);

  const filtered = useMemo(() => {
    let list = [...instructors];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.department || "").toLowerCase().includes(q));
    }
    if (deptFilter) list = list.filter(i => i.department === deptFilter);
    if (rmpOnly) list = list.filter(i => i.rmpRating != null);
    list.sort((a, b) => {
      if (sortBy === "rmp")        { const ar = a.rmpRating ?? -1,        br = b.rmpRating ?? -1;        return br - ar; }
      if (sortBy === "difficulty") { const ad = a.rmpDifficulty ?? 99,    bd = b.rmpDifficulty ?? 99;    return ad - bd; }
      if (sortBy === "gpa")        return (b.avgGpa || 0) - (a.avgGpa || 0);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [instructors, query, deptFilter, rmpOnly, sortBy]);

  const chipStyle = (active) => ({
    fontFamily: MONO, fontSize: 10, fontWeight: active ? 600 : 400,
    padding: "5px 12px", borderRadius: RADIUS.xs, cursor: "pointer",
    border: `1px solid ${active ? "rgba(134,31,65,0.35)" : p.line}`,
    background: active ? "rgba(134,31,65,0.12)" : "transparent",
    color: active ? ACCENT : p.textSub,
    transition: "all 0.15s", letterSpacing: "0.3px",
  });

  return (
    <div style={{ minHeight: "100vh", fontFamily: SANS }}>
      {/* Hero header */}
      <header style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "36px 16px 24px" : "72px 64px 36px", boxSizing: "border-box", borderBottom: `1px solid ${p.line}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", color: ACCENT, textTransform: "uppercase" }}>Faculty</span>
        <h1 style={{ margin: "18px 0 14px", fontSize: "clamp(42px, 5.5vw, 78px)", fontWeight: 400, fontFamily: SERIF, color: p.text, letterSpacing: "-1px", lineHeight: 1.02 }}>
          Find <em style={{ color: ACCENT, fontStyle: "italic" }}>instructors.</em>
        </h1>
        <p style={{ margin: "0 0 32px", maxWidth: 520, fontFamily: SANS, fontSize: 15, color: p.textSub, lineHeight: 1.7 }}>
          {loading ? "Loading faculty…" : `${filtered.length} instructor${filtered.length !== 1 ? "s" : ""} · RMP ratings · grade data.`}
        </p>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", ...glassInput(dm), borderRadius: RADIUS.md, padding: "0 16px", maxWidth: 520 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input ref={searchRef} value={query} onChange={e => setQuery(sanitize(e.target.value))} placeholder="Search by name or department…" style={{ flex: 1, padding: "13px 12px", border: "none", background: "transparent", color: p.text, fontFamily: SANS, fontSize: 15, outline: "none", minWidth: 0 }} />
          {query && <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: p.textFaint, fontSize: 16, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>✕</button>}
        </div>
      </header>

      {/* Filter bar + grid */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "36px 64px 96px", boxSizing: "border-box" }}>

        {/* Filter row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${p.line}` }}>
          <button onClick={() => setRmpOnly(v => !v)} style={chipStyle(rmpOnly)}>RMP only</button>

          {departments.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: RADIUS.xs, border: `1px solid ${deptFilter ? "rgba(134,31,65,0.35)" : p.line}`, background: deptFilter ? "rgba(134,31,65,0.12)" : "transparent", color: deptFilter ? ACCENT : p.textSub, fontFamily: MONO, fontSize: 10, fontWeight: deptFilter ? 600 : 400, cursor: "pointer", outline: "none" }}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textFaint, letterSpacing: "1.5px", textTransform: "uppercase" }}>Sort</span>
            {[["name","Name"],["rmp","RMP"],["difficulty","Diff"],["gpa","GPA"]].map(([val, label]) => (
              <button key={val} onClick={() => setSortBy(val)} style={{ background: "none", border: "none", padding: "4px 0", color: sortBy === val ? p.text : p.textFaint, fontFamily: MONO, fontWeight: sortBy === val ? 600 : 400, fontSize: 10, letterSpacing: "0.5px", cursor: "pointer", borderBottom: `1.5px solid ${sortBy === val ? ACCENT : "transparent"}`, transition: "color 0.15s, border-color 0.15s" }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ padding: "120px 0", textAlign: "center", fontFamily: MONO, fontSize: 11, fontWeight: 600, color: p.textFaint, letterSpacing: "2px", textTransform: "uppercase" }}>Loading faculty…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "120px 0", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>No results</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, color: p.text, marginBottom: 8 }}>No instructors match.</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: p.textSub }}>Try a different name or clear the filters.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {filtered.map(instr => (
              <InstructorCard key={instr.id || instr.name} instructor={instr} darkMode={dm} onClick={onProfClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
