// Browse Instructors page
import { useState, useEffect, useMemo } from "react";
import { API } from "../api.js";
import { GpaBadge } from "./courses.jsx";
import { StarRating } from "./nav-auth.jsx";
import ProfessorProfile from "./dashboard-prof.jsx";

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

// ── Instructor Row ─────────────────────────────────────────────────
function InstructorRow({ instr, darkMode, onOpen, isLast }) {
  const dm = darkMode;
  const [hov, setHov] = useState(false);

  const colors = {
    text:    dm ? "#f0edf3" : "#1c1a1e",
    sub:     dm ? "rgba(255,255,255,0.38)" : "#75787b",
    border:  dm ? "rgba(255,255,255,0.07)" : "rgba(20,16,12,0.08)",
    hov:     dm ? "rgba(255,255,255,0.03)" : "rgba(20,16,12,0.025)",
  };

  const initials = instr.name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const deptLabel = instr.subjects
    .slice(0, 2)
    .map(s => DEPT_NAMES[s] || s)
    .join(", ");

  const rmpColor =
    instr.rmpRating == null ? colors.sub :
    instr.rmpRating >= 4   ? "#1a7a38" :
    instr.rmpRating >= 3   ? "#b45309" : "#c0392b";

  return (
    <div
      onClick={() => onOpen(instr)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "13px 0",
        borderBottom: isLast ? "none" : `1px solid ${colors.border}`,
        background: hov ? colors.hov : "transparent",
        cursor: "pointer",
        transition: "background 0.12s",
        borderLeft: hov ? "2px solid #861F41" : "2px solid transparent",
        paddingLeft: hov ? 10 : 12,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: dm ? "#2a1f2e" : "#f0edf3",
        color: "#861F41", fontWeight: 700, fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center",
        letterSpacing: "-0.5px",
      }}>
        {initials}
      </div>

      {/* Name + dept */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: 14, color: colors.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {instr.name}
        </div>
        <div style={{ fontSize: 12, color: colors.sub, marginTop: 1 }}>
          {deptLabel}
          {instr.subjects.length > 2 && (
            <span style={{ marginLeft: 4, opacity: 0.6 }}>+{instr.subjects.length - 2}</span>
          )}
        </div>
      </div>

      {/* Stats — right-aligned cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        {instr.avgGpa != null && (
          <GpaBadge gpa={instr.avgGpa} darkMode={dm} />
        )}

        {instr.rmpRating != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <StarRating rating={instr.rmpRating} size={11} />
            <span style={{ fontSize: 13, fontWeight: 700, color: rmpColor }}>
              {instr.rmpRating.toFixed(1)}
            </span>
            {instr.rmpCount > 0 && (
              <span style={{ fontSize: 11, color: colors.sub }}>({instr.rmpCount})</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: colors.sub, fontStyle: "italic" }}>No RMP</span>
        )}

        <span style={{ fontSize: 12, color: colors.sub, minWidth: 60, textAlign: "right" }}>
          {instr.courseCount} {instr.courseCount === 1 ? "course" : "courses"}
        </span>

        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={colors.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: hov ? 0.8 : 0.3, transition: "opacity 0.12s" }}>
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
    bg:     "transparent",
    text:   dm ? "#f0edf3" : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.40)" : "rgba(20,16,12,0.55)",
    faint:  dm ? "rgba(255,255,255,0.22)" : "rgba(20,16,12,0.32)",
    border: dm ? "rgba(255,255,255,0.08)" : "rgba(20,16,12,0.10)",
    input:  dm ? "#141414" : "#ffffff",
  };

  const PAGE_SIZE = 30;

  const [instructors, setInstructors]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [q, setQ]                         = useState("");
  const [subjectFilter, setSubjectFilter] = useState([]);
  const [sortBy, setSortBy]               = useState("name");
  const [currentPage, setCurrentPage]     = useState(1);
  const [selectedProf, setSelectedProf]   = useState(null);
  const [isMobile, setIsMobile]           = useState(() => window.innerWidth < 768);

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

    if (subjectFilter.length > 0) {
      result = result.filter(i => i.subjects.some(s => subjectFilter.includes(s)));
    }

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

  const toggleSubject = sub => {
    setSubjectFilter(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
    setCurrentPage(1);
  };

  const handleSearch = val => { setQ(val); setCurrentPage(1); };
  const handleSort   = val => { setSortBy(val); setCurrentPage(1); };

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const SortBtn = ({ id, label }) => {
    const active = sortBy === id;
    return (
      <button onClick={() => handleSort(id)} style={{
        background: "none", border: "none", padding: "4px 0",
        color: active ? colors.text : colors.faint,
        fontWeight: active ? 800 : 600, fontSize: 12,
        letterSpacing: "0.3px", cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        borderBottom: `1.5px solid ${active ? "#861F41" : "transparent"}`,
        transition: "color 0.15s, border-color 0.15s",
      }}>{label}</button>
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: colors.bg,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Editorial header */}
      <header style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "36px 16px 24px" : "72px 64px 36px",
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
          {loading
            ? "Loading…"
            : `${instructors.length} instructors · grade data and RMP ratings.`}
        </p>

        {/* Search */}
        <div style={{ position: "relative", maxWidth: 480 }}>
          <input
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name"
            style={{
              width: "100%", padding: "14px 16px 14px 0",
              border: "none", borderBottom: `1px solid ${colors.border}`,
              background: "transparent", color: colors.text,
              fontSize: 16, fontWeight: 500,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxSizing: "border-box", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.currentTarget.style.borderBottomColor = "#861F41"}
            onBlur={e => e.currentTarget.style.borderBottomColor = colors.border}
          />
        </div>
      </header>

      {/* Body */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "20px 16px 60px" : "40px 64px 96px",
        boxSizing: "border-box",
      }}>
        {/* Toolbar: dept filter + sort */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 12,
          paddingBottom: 16, marginBottom: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {/* Dept pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: colors.faint,
              letterSpacing: "1.5px", textTransform: "uppercase",
            }}>Dept</span>
            {allSubjects.map(sub => {
              const active = subjectFilter.includes(sub);
              return (
                <button key={sub} onClick={() => toggleSubject(sub)} style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  border: `1px solid ${active ? "#861F41" : colors.border}`,
                  background: active ? "rgba(134,31,65,0.12)" : "transparent",
                  color: active ? "#861F41" : colors.sub,
                  cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.15s",
                }}>
                  {sub}
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: colors.faint,
              letterSpacing: "1.5px", textTransform: "uppercase",
            }}>Sort</span>
            <SortBtn id="name" label="Name" />
            <SortBtn id="gpa" label="Avg GPA" />
            <SortBtn id="rmp" label="RMP" />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "100px 0", textAlign: "center",
            fontSize: 11, fontWeight: 700, color: colors.faint,
            letterSpacing: "2px", textTransform: "uppercase" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "100px 0", textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: colors.text, marginBottom: 6 }}>
              No instructors found
            </div>
            <div style={{ fontSize: 14, color: colors.sub }}>
              Try a different name or clear the department filter.
            </div>
          </div>
        ) : (
          <>
            {/* Result count */}
            <div style={{
              fontSize: 11, color: colors.faint, fontWeight: 700,
              letterSpacing: "0.5px", marginBottom: 4,
              textTransform: "uppercase",
            }}>
              {filtered.length} instructor{filtered.length !== 1 ? "s" : ""}
              {q || subjectFilter.length > 0 ? " matching" : ""}
              {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
            </div>

            {/* List */}
            <div style={{ paddingTop: 4 }}>
              {paginated.map((instr, idx) => (
                <InstructorRow
                  key={instr.name}
                  instr={instr}
                  darkMode={dm}
                  onOpen={setSelectedProf}
                  isLast={idx === paginated.length - 1}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: 40, paddingTop: 20, borderTop: `1px solid ${colors.border}`,
              }}>
                <span style={{ fontSize: 12, color: colors.faint, fontWeight: 600 }}>
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === 1}
                    style={{
                      padding: "6px 12px", borderRadius: 7,
                      border: `1px solid ${colors.border}`,
                      background: "transparent",
                      color: currentPage === 1 ? colors.faint : colors.text,
                      fontWeight: 700, fontSize: 12,
                      cursor: currentPage === 1 ? "default" : "pointer",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      opacity: currentPage === 1 ? 0.4 : 1,
                    }}
                  >←</button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "…" ? (
                        <span key={`e-${idx}`} style={{ padding: "6px 4px", color: colors.faint, fontSize: 12 }}>…</span>
                      ) : (
                        <button key={p}
                          onClick={() => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          style={{
                            width: 34, height: 34, borderRadius: 7,
                            border: `1px solid ${p === currentPage ? "#861F41" : colors.border}`,
                            background: p === currentPage ? "#861F41" : "transparent",
                            color: p === currentPage ? "white" : colors.text,
                            fontWeight: p === currentPage ? 800 : 600,
                            fontSize: 12, cursor: "pointer",
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                          }}
                        >{p}</button>
                      )
                    )
                  }

                  <button
                    onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: "6px 12px", borderRadius: 7,
                      border: `1px solid ${colors.border}`,
                      background: "transparent",
                      color: currentPage === totalPages ? colors.faint : colors.text,
                      fontWeight: 700, fontSize: 12,
                      cursor: currentPage === totalPages ? "default" : "pointer",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      opacity: currentPage === totalPages ? 0.4 : 1,
                    }}
                  >→</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedProf && (
        <ProfessorProfile
          prof={selectedProf}
          darkMode={dm}
          onClose={() => setSelectedProf(null)}
        />
      )}
    </div>
  );
}
