// Browse Instructors page — card grid with autocomplete search + liquid glass
import { useState, useEffect, useMemo, useRef } from "react";
import { API } from "../api.js";
import { GpaBadge } from "./courses.jsx";
import { StarRating } from "./nav-auth.jsx";
import ProfessorProfile from "./dashboard-prof.jsx";
import { glassCard, glassInput } from "../theme.jsx";

const DEPT_NAMES = {
  CS:   "Computer Science",
  MATH: "Mathematics",
  ECE:  "Electrical & Computer Engineering",
  BIOL: "Biological Sciences",
  PHYS: "Physics",
  CHEM: "Chemistry",
  HIST: "History",
  PSYC: "Psychology",
  STAT: "Statistics",
  ACIS: "Accounting & Information Systems",
  ME:   "Mechanical Engineering",
  AOE:  "Aerospace & Ocean Engineering",
  CEE:  "Civil & Environmental Engineering",
  IE:   "Industrial & Systems Engineering",
  ESM:  "Engineering Science & Mechanics",
  ENGL: "English",
  SOC:  "Sociology",
  ECON: "Economics",
  MGT:  "Management",
  MKTG: "Marketing",
  FIN:  "Finance",
};

function avatarPalette(name) {
  const PALETTES = [
    ["#6b1833", "#f9d0dc"],
    ["#1a4d6b", "#c9e8f7"],
    ["#2d5a1b", "#c8f4d0"],
    ["#5a3a1b", "#f7e2c5"],
    ["#3b1b6b", "#ddc9f7"],
    ["#6b5a1b", "#f7efc5"],
    ["#1b5a5a", "#c5f7f7"],
  ];
  return PALETTES[name.charCodeAt(0) % PALETTES.length];
}

// ── Instructor card (glass) ────────────────────────────────────────
function InstructorCard({ instr, darkMode, onClick }) {
  const dm = darkMode;
  const [hov, setHov] = useState(false);
  const glass = glassCard(dm);

  const initials = instr.name
    .split(" ").filter(Boolean).slice(-2)
    .map(n => n[0]).join("").toUpperCase();

  const [avatarBg, avatarFg] = avatarPalette(instr.name);

  const depts = instr.subjects.slice(0, 3).map(s => DEPT_NAMES[s] || s);
  const moreDepts = instr.subjects.length > 3 ? instr.subjects.length - 3 : 0;

  const rmpColor =
    instr.rmpRating == null  ? (dm ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.32)") :
    instr.rmpRating >= 4     ? "#16a34a" :
    instr.rmpRating >= 3     ? "#b45309" : "#c0392b";

  const divider = dm ? "rgba(255,255,255,0.07)" : "rgba(20,16,12,0.07)";
  const textCol = dm ? "#f0edf3" : "#1a1210";
  const subCol  = dm ? "rgba(255,255,255,0.40)" : "rgba(20,16,12,0.55)";
  const faintCol = dm ? "rgba(255,255,255,0.22)" : "rgba(20,16,12,0.32)";
  const borderBase = dm ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)";

  return (
    <div
      onClick={() => onClick(instr)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...glass,
        border: `1px solid ${hov ? "rgba(134,31,65,0.50)" : borderBase}`,
        borderRadius: 18,
        padding: "22px",
        cursor: "pointer",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        transform: hov ? "translateY(-4px)" : "none",
        boxShadow: hov
          ? "0 20px 48px rgba(134,31,65,0.14), 0 6px 16px rgba(0,0,0,0.14)"
          : glass.boxShadow,
        display: "flex", flexDirection: "column", gap: 14,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: avatarBg, color: avatarFg,
          fontWeight: 800, fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          letterSpacing: "-0.5px",
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: textCol, lineHeight: 1.3 }}>
            {instr.name}
          </div>
          <div style={{
            fontSize: 11, color: subCol, marginTop: 3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {depts.join(" · ")}{moreDepts > 0 && ` +${moreDepts}`}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: divider }} />

      {/* Stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {instr.avgGpa != null ? (
          <GpaBadge gpa={instr.avgGpa} />
        ) : (
          <span style={{ fontSize: 11, color: faintCol, fontStyle: "italic" }}>No GPA data</span>
        )}
        {instr.rmpRating != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
            <StarRating rating={instr.rmpRating} size={11} />
            <span style={{ fontSize: 13, fontWeight: 800, color: rmpColor }}>
              {instr.rmpRating.toFixed(1)}
            </span>
            {instr.rmpCount > 0 && (
              <span style={{ fontSize: 10, color: faintCol }}>({instr.rmpCount})</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: faintCol, fontStyle: "italic" }}>No RMP</span>
        )}
      </div>

      {/* Footer */}
      <div style={{
        fontSize: 11, color: faintCol, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>{instr.courseCount} {instr.courseCount === 1 ? "course" : "courses"} taught</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: hov ? 0.7 : 0.3, transition: "opacity 0.15s" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  );
}

// ── Browse Instructors Page ────────────────────────────────────────
export default function InstructorsPage({ darkMode }) {
  const dm = darkMode;

  const colors = {
    text:   dm ? "#f0edf3" : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.40)" : "rgba(20,16,12,0.55)",
    faint:  dm ? "rgba(255,255,255,0.22)" : "rgba(20,16,12,0.32)",
    border: dm ? "rgba(255,255,255,0.08)" : "rgba(20,16,12,0.10)",
  };

  const PAGE_SIZE = 24;

  const [instructors, setInstructors]         = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [q, setQ]                             = useState("");
  const [subjectFilter, setSubjectFilter]     = useState([]);
  const [sortBy, setSortBy]                   = useState("name");
  const [currentPage, setCurrentPage]         = useState(1);
  const [selectedProf, setSelectedProf]       = useState(null);
  const [isMobile, setIsMobile]               = useState(() => window.innerWidth < 768);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    API.getInstructors()
      .then(data => { setInstructors(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = e => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allSubjects = useMemo(() => {
    const s = new Set();
    instructors.forEach(i => i.subjects.forEach(sub => s.add(sub)));
    return [...s].sort();
  }, [instructors]);

  const filtered = useMemo(() => {
    let result = instructors;
    if (q.trim()) {
      const lower = q.trim().toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(lower));
    }
    if (subjectFilter.length > 0)
      result = result.filter(i => i.subjects.some(s => subjectFilter.includes(s)));

    return [...result].sort((a, b) => {
      if (sortBy === "gpa") return (b.avgGpa ?? -1) - (a.avgGpa ?? -1);
      if (sortBy === "rmp") {
        if (a.rmpRating == null && b.rmpRating == null) return a.name.localeCompare(b.name);
        if (a.rmpRating == null) return 1;
        if (b.rmpRating == null) return -1;
        return b.rmpRating - a.rmpRating;
      }
      return a.name.localeCompare(b.name);
    });
  }, [instructors, q, subjectFilter, sortBy]);

  const suggestions = useMemo(() => {
    if (!q.trim() || q.trim().length < 2) return [];
    const lower = q.trim().toLowerCase();
    return instructors.filter(i => i.name.toLowerCase().includes(lower)).slice(0, 7);
  }, [instructors, q]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const SortBtn = ({ id, label }) => {
    const active = sortBy === id;
    return (
      <button onClick={() => { setSortBy(id); setCurrentPage(1); }} style={{
        background: active ? "rgba(134,31,65,0.12)" : "transparent",
        border: `1px solid ${active ? "rgba(134,31,65,0.40)" : colors.border}`,
        color: active ? "#861F41" : colors.sub,
        fontWeight: active ? 800 : 600, fontSize: 12,
        padding: "5px 14px", borderRadius: 20, cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "all 0.15s",
      }}>{label}</button>
    );
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <header style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "36px 16px 28px" : "72px 64px 40px",
        boxSizing: "border-box",
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "1.8px",
          fontFamily: "'JetBrains Mono', monospace",
          color: "#861F41", textTransform: "uppercase",
        }}>Directory</span>

        <h1 style={{
          margin: "18px 0 14px",
          fontSize: "clamp(38px, 5vw, 70px)", fontWeight: 400,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: colors.text, letterSpacing: "-1px", lineHeight: 1.02,
        }}>
          Browse <span style={{ color: "#861F41", fontStyle: "italic" }}>instructors.</span>
        </h1>

        <p style={{
          margin: "0 0 32px", maxWidth: 480,
          fontSize: 15, color: colors.sub, lineHeight: 1.7, fontWeight: 500,
        }}>
          {loading ? "Loading…" : `${instructors.length} instructors · grade data and RMP ratings.`}
        </p>

        {/* Autocomplete search */}
        <div ref={searchWrapRef} style={{ position: "relative", maxWidth: 520 }}>
          <div style={{
            display: "flex", alignItems: "center",
            ...glassInput(dm),
            borderRadius: showSuggestions && suggestions.length > 0 ? "14px 14px 0 0" : 14,
            padding: "0 16px", transition: "border-radius 0.15s",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setCurrentPage(1); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search by instructor name…"
              style={{
                flex: 1, padding: "14px 12px", border: "none",
                background: "transparent", color: colors.text,
                fontSize: 15, fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
              }}
            />
            {q && (
              <button onClick={() => { setQ(""); setShowSuggestions(false); setCurrentPage(1); }} style={{
                background: "none", border: "none", cursor: "pointer",
                color: colors.faint, fontSize: 16, padding: "0 4px", lineHeight: 1,
              }}>✕</button>
            )}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
              ...glassCard(dm),
              borderRadius: "0 0 14px 14px",
              border: `1px solid ${dm ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)"}`,
              borderTop: "none", overflow: "hidden",
            }}>
              {suggestions.map((instr, i) => {
                const [bg, fg] = avatarPalette(instr.name);
                const initials = instr.name.split(" ").filter(Boolean).slice(-2).map(n => n[0]).join("").toUpperCase();
                return (
                  <button
                    key={instr.name}
                    onMouseDown={() => { setQ(instr.name); setShowSuggestions(false); setCurrentPage(1); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "10px 16px", background: "transparent", border: "none",
                      borderTop: i > 0 ? `1px solid ${dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none",
                      cursor: "pointer", textAlign: "left",
                      fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = dm ? "rgba(134,31,65,0.12)" : "rgba(134,31,65,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: bg, color: fg, fontWeight: 800, fontSize: 11,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{initials}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, flex: 1 }}>
                      {instr.name}
                    </span>
                    {instr.rmpRating != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#861F41", flexShrink: 0 }}>
                        {instr.rmpRating.toFixed(1)} ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "20px 16px 60px" : "36px 64px 96px",
        boxSizing: "border-box",
      }}>
        {/* Toolbar */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 12,
          paddingBottom: 20, marginBottom: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: colors.faint,
              letterSpacing: "1.5px", textTransform: "uppercase", flexShrink: 0,
            }}>Dept</span>
            {allSubjects.map(sub => {
              const active = subjectFilter.includes(sub);
              return (
                <button key={sub} onClick={() => {
                  setSubjectFilter(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]);
                  setCurrentPage(1);
                }} style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                  border: `1px solid ${active ? "#861F41" : colors.border}`,
                  background: active ? "rgba(134,31,65,0.12)" : "transparent",
                  color: active ? "#861F41" : colors.sub, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "all 0.15s",
                }}>{sub}</button>
              );
            })}
            {subjectFilter.length > 0 && (
              <button onClick={() => { setSubjectFilter([]); setCurrentPage(1); }} style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                border: "none", background: "transparent", color: colors.faint,
                cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", textDecoration: "underline",
              }}>Clear</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: colors.faint, letterSpacing: "1.5px", textTransform: "uppercase" }}>Sort</span>
            <SortBtn id="name" label="Name" />
            <SortBtn id="gpa" label="Avg GPA" />
            <SortBtn id="rmp" label="RMP" />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "100px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: colors.faint, letterSpacing: "2px", textTransform: "uppercase" }}>
            Loading instructors…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "100px 0", textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: colors.text, marginBottom: 6 }}>No instructors found</div>
            <div style={{ fontSize: 14, color: colors.sub }}>Try a different name or clear the department filter.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: colors.faint, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 20, textTransform: "uppercase" }}>
              {filtered.length} instructor{filtered.length !== 1 ? "s" : ""}{q || subjectFilter.length > 0 ? " matching" : ""}
              {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}>
              {paginated.map(instr => (
                <InstructorCard key={instr.name} instr={instr} darkMode={dm} onClick={setSelectedProf} />
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 48, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 12, color: colors.faint, fontWeight: 600 }}>
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === 1}
                    style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${colors.border}`, background: "transparent", color: currentPage === 1 ? colors.faint : colors.text, fontWeight: 700, fontSize: 12, cursor: currentPage === 1 ? "default" : "pointer", opacity: currentPage === 1 ? 0.4 : 1 }}>←</button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…"); acc.push(p); return acc; }, [])
                    .map((p, idx) => p === "…" ? (
                      <span key={`e-${idx}`} style={{ padding: "7px 4px", color: colors.faint, fontSize: 12 }}>…</span>
                    ) : (
                      <button key={p} onClick={() => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${p === currentPage ? "#861F41" : colors.border}`, background: p === currentPage ? "#861F41" : "transparent", color: p === currentPage ? "white" : colors.text, fontWeight: p === currentPage ? 800 : 600, fontSize: 12, cursor: "pointer" }}
                      >{p}</button>
                    ))
                  }

                  <button onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === totalPages}
                    style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${colors.border}`, background: "transparent", color: currentPage === totalPages ? colors.faint : colors.text, fontWeight: 700, fontSize: 12, cursor: currentPage === totalPages ? "default" : "pointer", opacity: currentPage === totalPages ? 0.4 : 1 }}>→</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedProf && (
        <ProfessorProfile prof={selectedProf} darkMode={dm} onClose={() => setSelectedProf(null)} />
      )}
    </div>
  );
}
