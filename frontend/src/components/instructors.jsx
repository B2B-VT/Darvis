// Browse Instructors page — card grid with autocomplete search + liquid glass
import { useState, useEffect, useMemo, useRef } from "react";
import { API } from "../api.js";
import { db } from "../supabase.js";
import { GpaBadge } from "./courses.jsx";
import { StarRating } from "./nav-auth.jsx";
import {
  MONO, SERIF, SANS, ACCENT, EASE,
  palette, glassCard, glassInput, RADIUS, SHADOW,
} from "../theme.jsx";
import { Skeleton, SkeletonProfessorCard, useMinimumLoading } from "./skeletons.jsx";

function sanitize(raw) {
  if (!raw) return "";
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/[ \t]+/g, " ").slice(0, 200);
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getInstructorDepartments(instructor, courseMap = {}) {
  const values = new Set();
  const dept = normalizeCode(instructor.department);
  if (dept) values.add(dept);
  (instructor.subjects || []).forEach(subject => {
    const code = normalizeCode(subject);
    if (code) values.add(code);
  });
  const courseSet = courseMap[instructor.name];
  if (courseSet) {
    [...courseSet].forEach(course => {
      const code = normalizeCode(String(course).split(/\s+/)[0]);
      if (code) values.add(code);
    });
  }
  return [...values];
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
function InstructorCard({ instructor, darkMode, onClick, courseList }) {
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

      {/* Course pills */}
      {courseList && courseList.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {courseList.slice(0, 4).map(c => (
            <span key={c} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textSub, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "2px 8px", letterSpacing: "0.3px" }}>{c}</span>
          ))}
          {courseList.length > 4 && (
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textFaint, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "2px 8px" }}>+{courseList.length - 4}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ paddingTop: 12, borderTop: `1px solid ${p.lineSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textFaint, letterSpacing: "0.5px", textTransform: "uppercase" }}>
          {courseList && courseList.length > 0 ? `${courseList.length} course${courseList.length !== 1 ? "s" : ""} · Fall 2026` : "View profile"}
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
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [rmpOnly, setRmpOnly] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [instructorCourseMap, setInstructorCourseMap] = useState({});
  const searchRef = useRef(null);
  const departmentRef = useRef(null);
  const dm = darkMode;
  const p = palette(dm);
  const showLoading = useMinimumLoading(loading);

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

  useEffect(() => {
    db.from("sections")
      .select("instructor, subject, course_number")
      .eq("term", "202609")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(sec => {
          const name = sec.instructor || "";
          if (!name) return;
          const course = `${sec.subject} ${sec.course_number}`;
          if (!map[name]) map[name] = new Set();
          map[name].add(course);
        });
        setInstructorCourseMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = e => {
      if (!departmentRef.current?.contains(e.target)) setDepartmentOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const departmentOptions = useMemo(() => {
    const codes = new Set();
    instructors.forEach(instructor => {
      getInstructorDepartments(instructor, instructorCourseMap).forEach(code => codes.add(code));
    });
    return [...codes].sort((a, b) => a.localeCompare(b));
  }, [instructors, instructorCourseMap]);

  const departmentMatches = useMemo(() => {
    const q = normalizeCode(departmentQuery);
    return q
      ? departmentOptions.filter(code => code.startsWith(q))
      : departmentOptions;
  }, [departmentOptions, departmentQuery]);

  const filtered = useMemo(() => {
    let list = [...instructors];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(i => {
        const depts = getInstructorDepartments(i, instructorCourseMap);
        return i.name.toLowerCase().includes(q)
          || depts.some(code => code.toLowerCase().includes(q));
      });
    }
    if (departmentQuery.trim()) {
      const q = normalizeCode(departmentQuery);
      const exactOption = departmentOptions.includes(q);
      list = list.filter(i =>
        getInstructorDepartments(i, instructorCourseMap).some(code =>
          exactOption ? code === q : code.startsWith(q)
        )
      );
    }
    if (rmpOnly) list = list.filter(i => i.rmpRating != null);
    list.sort((a, b) => {
      if (sortBy === "rmp_desc") return (b.rmpRating ?? -1) - (a.rmpRating ?? -1);
      if (sortBy === "rmp_asc")  return (a.rmpRating ?? 99) - (b.rmpRating ?? 99);
      if (sortBy === "courses") {
        return (instructorCourseMap[b.name]?.size ?? 0) - (instructorCourseMap[a.name]?.size ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [instructors, query, departmentQuery, departmentOptions, rmpOnly, sortBy, instructorCourseMap]);

  const chipStyle = (active) => ({
    fontFamily: MONO, fontSize: 10, fontWeight: active ? 600 : 400,
    padding: "5px 12px", borderRadius: RADIUS.xs, cursor: "pointer",
    border: `1px solid ${active ? "rgba(134,31,65,0.35)" : p.line}`,
    background: active ? "rgba(134,31,65,0.12)" : "transparent",
    color: active ? ACCENT : p.textSub,
    transition: "all 0.15s", letterSpacing: "0.3px",
  });

  const filterInputStyle = {
    ...glassInput(dm),
    borderRadius: RADIUS.md,
    padding: "0 13px",
    height: 46,
    color: p.text,
    fontFamily: SANS,
    display: "flex",
    alignItems: "center",
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: SANS }}>
      {/* Hero header */}
      <header style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "36px 16px 24px" : "72px 64px 36px", boxSizing: "border-box", borderBottom: `1px solid ${p.line}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", color: ACCENT, textTransform: "uppercase" }}>Faculty</span>
        <h1 style={{ margin: "18px 0 14px", fontSize: "clamp(42px, 5.5vw, 78px)", fontWeight: 400, fontFamily: SERIF, color: p.text, letterSpacing: "-1px", lineHeight: 1.02 }}>
          Find <em style={{ color: ACCENT, fontStyle: "italic" }}>instructors.</em>
        </h1>
        <p style={{ margin: "0 0 32px", maxWidth: 520, fontFamily: SANS, fontSize: 15, color: p.textSub, lineHeight: 1.7 }}>
          {showLoading ? <Skeleton darkMode={dm} width={260} height={15} /> : `${filtered.length} instructor${filtered.length !== 1 ? "s" : ""} · RMP ratings · grade data.`}
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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(240px, 360px) minmax(220px, auto)", gap: 14, alignItems: "end", marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${p.line}` }}>
          <div ref={departmentRef} style={{ position: "relative", zIndex: 25 }}>
            <label htmlFor="instructor-department-filter" style={{ display: "block", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: p.textFaint, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 7 }}>
              Department / Major
            </label>
            <div style={filterInputStyle}>
              <input
                id="instructor-department-filter"
                value={departmentQuery}
                onChange={e => { setDepartmentQuery(sanitize(e.target.value).toUpperCase()); setDepartmentOpen(true); }}
                onFocus={() => setDepartmentOpen(true)}
                placeholder="Search subjects..."
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: p.text, fontFamily: SANS, fontSize: 14 }}
              />
              {departmentQuery && (
                <button aria-label="Clear department filter" onClick={() => { setDepartmentQuery(""); setDepartmentOpen(true); }} style={{ background: "transparent", border: "none", color: p.textFaint, cursor: "pointer", fontSize: 15, padding: "0 2px" }}>✕</button>
              )}
            </div>
            {departmentOpen && departmentMatches.length > 0 && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 200,
                maxHeight: 280,
                overflowY: "auto",
                borderRadius: `0 0 ${RADIUS.md}px ${RADIUS.md}px`,
                border: `1px solid ${dm ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.76)"}`,
                borderTop: "none",
                background: dm
                  ? "linear-gradient(135deg, rgba(35,35,35,0.88), rgba(22,22,22,0.82))"
                  : "linear-gradient(135deg, rgba(255,255,255,0.86), rgba(245,242,244,0.78))",
                backdropFilter: "blur(18px) saturate(150%)",
                WebkitBackdropFilter: "blur(18px) saturate(150%)",
                boxShadow: SHADOW.md,
                overflowX: "hidden",
              }}>
                {departmentMatches.map(code => {
                  const active = normalizeCode(departmentQuery) === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setDepartmentQuery(code); setDepartmentOpen(false); }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        background: active ? "rgba(134,31,65,0.22)" : "transparent",
                        border: "none",
                        borderTop: `1px solid ${p.lineSoft}`,
                        color: active ? (dm ? "#fff" : ACCENT) : p.text,
                        cursor: "pointer",
                        fontFamily: SANS,
                        fontSize: 15,
                        fontWeight: active ? 760 : 500,
                        letterSpacing: "0.2px",
                        padding: "11px 16px",
                        textAlign: "left",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = p.card; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: isMobile ? "flex-start" : "space-between" }}>
            <button
              type="button"
              aria-pressed={rmpOnly}
              onClick={() => setRmpOnly(v => !v)}
              style={{
                ...chipStyle(rmpOnly),
                minHeight: 42,
                padding: "10px 16px",
                fontSize: 12,
                borderRadius: RADIUS.pill,
                borderColor: rmpOnly ? "rgba(134,31,65,0.55)" : p.line,
                boxShadow: rmpOnly ? "0 0 0 3px rgba(134,31,65,0.10)" : "none",
              }}
            >
              Has RateMyProfessor (RMP) Data
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: p.textFaint, letterSpacing: "1.5px", textTransform: "uppercase", flexShrink: 0 }}>Sort</span>
              {[["name","Name A→Z"],["rmp_desc","RMP ↓"],["rmp_asc","RMP ↑"],["courses","Most Courses"]].map(([val, label]) => (
                <button key={val} onClick={() => setSortBy(val)} style={{ background: "none", border: "none", padding: "4px 0", color: sortBy === val ? p.text : p.textFaint, fontFamily: MONO, fontWeight: sortBy === val ? 600 : 400, fontSize: 10, letterSpacing: "0.5px", cursor: "pointer", borderBottom: `1.5px solid ${sortBy === val ? ACCENT : "transparent"}`, transition: "color 0.15s, border-color 0.15s", whiteSpace: "nowrap" }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {showLoading ? (
          <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {Array.from({ length: isMobile ? 5 : 10 }).map((_, i) => <SkeletonProfessorCard key={i} darkMode={dm} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "120px 0", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>No results</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, color: p.text, marginBottom: 8 }}>No instructors match.</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: p.textSub }}>Try a different name or clear the filters.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {filtered.map(instr => {
              const courseSet = instructorCourseMap[instr.name] || new Set();
              const courseList = [...courseSet].sort();
              return <InstructorCard key={instr.id || instr.name} instructor={instr} darkMode={dm} onClick={onProfClick} courseList={courseList} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
