// Course Search, Cards, Detail, Grade Grid
import { useState, useEffect, useRef, useMemo } from "react";
import { MOCK } from "../mock-data.js";
import { API } from "../api.js";
import { StarRating } from "./nav-auth.jsx";
import { glassCard, glassInput } from "../theme.jsx";

// ── Helpers ───────────────────────────────────────────────────────
// "14:30" → "2:30 PM"
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

// Returns true for online/arranged sections that have no physical meeting time.
// Banner stores these as "----- (ARR) -----" in time fields and "ONLINE" in endTime.
function isVirtual(section) {
  if (!section) return false;
  const loc   = (section.location  || '').toUpperCase();
  const start = (section.startTime || '').toUpperCase();
  const end   = (section.endTime   || '').toUpperCase();
  if (loc.includes('ONLINE') || loc === 'ARR') return true;
  if (start.includes('ARR') || start.includes('-----')) return true;
  if (end.includes('ONLINE') || end.includes('ARR')) return true;
  const days = section.days || [];
  if (days.length === 0) return true;
  if (days.some(d => (d || '').toUpperCase().includes('ARR'))) return true;
  return false;
}

// ── Input sanitization ────────────────────────────────────────────
// Strips control chars, collapses whitespace, caps at 200 chars.
// Used on all text inputs across this page.
function sanitizeQuery(raw) {
  if (!raw) return "";
  let s = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/[ \t]+/g, " ");
  if (s.length > 200) s = s.slice(0, 200);
  return s;
}

// ── GPA Badge ─────────────────────────────────────────────────────
export function GpaBadge({ gpa, large }) {
  const color = gpa >= 3.5 ? "#1a7a38" : gpa >= 3.0 ? "#2d7a5a" : gpa >= 2.5 ? "#b45309" : "#c0392b";
  const bg    = gpa >= 3.5 ? "#dcfce7" : gpa >= 3.0 ? "#d1fae5" : gpa >= 2.5 ? "#fef3c7" : "#fee2e2";
  return (
    <span style={{
      background: bg, color, fontWeight: 800,
      fontSize: large ? 16 : 12, padding: large ? "4px 12px" : "2px 8px",
      borderRadius: 20, letterSpacing: "-0.3px",
    }}>
      {gpa.toFixed(2)} GPA
    </span>
  );
}

// ── Seats Badge ───────────────────────────────────────────────────
function SeatsBadge({ seats, enrolled }) {
  const pct = enrolled / seats;
  const full = pct >= 1;
  const almostFull = pct >= 0.9;
  const color = full ? "#c0392b" : almostFull ? "#b45309" : "#1a7a38";
  const bg    = full ? "#fee2e2"  : almostFull ? "#fef3c7"  : "#dcfce7";
  return (
    <span style={{ background: bg, color, fontWeight: 700, fontSize: 12, padding: "2px 8px", borderRadius: 20 }}>
      {full ? "Full" : `${seats - enrolled} seats`}
    </span>
  );
}

// ── RMP Mini ──────────────────────────────────────────────────────
function RmpMini({ prof, onClick }) {
  if (!prof) return null;
  return (
    <button onClick={e => { e.stopPropagation(); onClick && onClick(prof); }} style={{
      display: "flex", alignItems: "center", gap: 5,
      background: "none", border: "none", cursor: "pointer", padding: 0,
    }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: "#861F41" }}>{prof.rmpRating.toFixed(1)}</span>
      <StarRating rating={prof.rmpRating} size={11} />
      <span style={{ fontSize: 11, color: "#75787b" }}>({prof.rmpCount})</span>
    </button>
  );
}

// ── Grade Distribution Grid ───────────────────────────────────────
export function GradeGrid({ dist, darkMode }) {
  const grades = ["A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W"];
  const colors = MOCK.gradeColors;
  const total = grades.reduce((s, g) => s + (dist[g] || 0), 0);
  if (total === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {grades.map(g => {
          const pct = Math.round((dist[g] || 0) / total * 100);
          if (pct === 0) return null;
          const c = colors[g];
          return (
            <div key={g} style={{
              flex: "0 0 auto",
              background: c.bg, borderRadius: 8,
              padding: "6px 10px", textAlign: "center", minWidth: 44,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.text }}>{g}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.text }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section Row ───────────────────────────────────────────────────
function SectionRow({ section, onAdd, onRemove, inSchedule, onProfClick, rmpMap, darkMode }) {
  const dm = darkMode;
  const colors = dm
    ? { border: "rgba(255,255,255,0.08)", text: "#f0edf3", sub: "rgba(255,255,255,0.38)" }
    : { border: "rgba(20,16,12,0.10)",   text: "#1a1210", sub: "rgba(20,16,12,0.55)" };
  const full    = section.seats > 0 ? section.enrolled >= section.seats : false;
  const virtual = isVirtual(section);
  const instrName = section.instructor || 'Staff';
  const rmp = rmpMap?.[instrName];

  // Build a prof-shaped object for onProfClick (reuses the professor modal)
  const profObj = rmp
    ? { id: instrName, name: instrName, rmpRating: rmp.rmp_rating, rmpDifficulty: rmp.rmp_difficulty, rmpCount: rmp.rmp_count, rmpTags: rmp.rmp_tags ?? [], rmpReviews: rmp.rmp_reviews ?? [], rmpId: rmp.rmp_id ?? null }
    : null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "70px 1fr 140px 100px 100px 90px",
      gap: 12, padding: "12px 16px", alignItems: "center",
      borderBottom: `1px solid ${colors.border}`,
      fontSize: 13,
    }}>
      <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#861F41", fontSize: 12 }}>{section.crn}</div>
      <div>
        {profObj ? (
          <button onClick={() => onProfClick(profObj)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            color: colors.text, fontWeight: 600, fontSize: 13, textDecoration: "underline",
            fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: "left",
          }}>{instrName}</button>
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>{instrName}</span>
        )}
        {rmp?.rmp_rating != null && (
          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <StarRating rating={rmp.rmp_rating} size={11} />
            <span style={{ fontWeight: 700, fontSize: 11, color: "#861F41" }}>{rmp.rmp_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div style={{ color: colors.text, fontSize: 12 }}>
        {virtual ? (
          <div style={{ fontWeight: 600, color: "#0369a1", fontSize: 12 }}>Meets virtually</div>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>
              {section.days.join(" ")} · {formatTime(section.startTime)}
            </div>
            <div style={{ color: colors.sub }}>→ {formatTime(section.endTime)}</div>
          </>
        )}
      </div>
      <div style={{ color: colors.sub, fontSize: 12 }}>
        {virtual ? "—" : section.location}
      </div>
      <div><SeatsBadge seats={section.seats} enrolled={section.enrolled} /></div>
      <div>
        {inSchedule ? (
          <button onClick={() => onRemove(section.crn)} style={{
            background: "rgba(192,57,43,0.18)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 7, padding: "5px 12px", cursor: "pointer",
            fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>Remove</button>
        ) : full ? (
          <button onClick={() => onAdd(section)} style={{
            background: "none",
            color: "#b45309",
            border: "1.5px solid rgba(180,83,9,0.4)",
            borderRadius: 7, padding: "5px 10px", cursor: "pointer",
            fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif",
            whiteSpace: "nowrap",
          }}>I'm enrolled</button>
        ) : (
          <button onClick={() => onAdd(section)} style={{
            background: "#861F41", color: "white", border: "none",
            borderRadius: 7, padding: "5px 12px", cursor: "pointer",
            fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>Add</button>
        )}
      </div>
    </div>
  );
}

// ── Section Breakdown Table ───────────────────────────────────────
function SectionBreakdown({ sections, darkMode }) {
  const dm = darkMode;
  const [sortKey, setSortKey] = useState('year');
  const [sortDir, setSortDir] = useState('desc');
  const [instrFilter, setInstrFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 10;

  const colors = {
    border:   dm ? "#3d3050" : "#e5e0ea",
    text:     dm ? "#f0edf3" : "#1c1a1e",
    sub:      dm ? "#998ba8" : "#75787b",
    inputBg:  dm ? "#2a2030" : "white",
    headerBg: dm ? "#2a2030" : "#f0edf8",
    rowAlt:   dm ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
  };

  const instructors = useMemo(() =>
    [...new Set(sections.map(s => s.instructor))].sort(), [sections]);

  const sorted = useMemo(() => {
    let list = instrFilter
      ? sections.filter(s => s.instructor === instrFilter)
      : [...sections];
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === 'year')      { av = `${a.academicYear}${a.term}`; bv = `${b.academicYear}${b.term}`; }
      else if (sortKey === 'gpa')  { av = a.gpa || 0;                    bv = b.gpa || 0; }
      else if (sortKey === 'instr'){ av = a.instructor;                  bv = b.instructor; }
      else if (sortKey === 'enr')  { av = a.gradedEnrollment;            bv = b.gradedEnrollment; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [sections, sortKey, sortDir, instrFilter]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const Arrow = ({ k }) => (
    <span style={{ marginLeft: 3, opacity: sortKey === k ? 1 : 0.25 }}>
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const GradeBar = ({ dist }) => {
    const a = (dist['A'] || 0) + (dist['A-'] || 0);
    const b = (dist['B+'] || 0) + (dist['B'] || 0) + (dist['B-'] || 0);
    const c = (dist['C+'] || 0) + (dist['C'] || 0) + (dist['C-'] || 0);
    const d = (dist['D+'] || 0) + (dist['D'] || 0) + (dist['D-'] || 0);
    const f = dist['F'] || 0;
    const total = a + b + c + d + f;
    if (total === 0) return <span style={{ color: colors.sub, fontSize: 11 }}>—</span>;
    const segs = [
      { pct: a / total * 100, color: '#16a34a', key: 'A' },
      { pct: b / total * 100, color: '#0891b2', key: 'B' },
      { pct: c / total * 100, color: '#d97706', key: 'C' },
      { pct: d / total * 100, color: '#ea580c', key: 'D' },
      { pct: f / total * 100, color: '#dc2626', key: 'F' },
    ].filter(s => s.pct > 0);
    return (
      <div style={{ display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden', width: 240, gap: 1 }}>
        {segs.map((s, i) => (
          <div key={i} title={`${s.key}: ${s.pct.toFixed(0)}%`} style={{
            flexGrow: s.pct, flexShrink: 1, flexBasis: 0,
            minWidth: 26, background: s.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  const th = (label, key) => (
    <th
      onClick={key ? () => toggleSort(key) : undefined}
      style={{
        padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 800,
        color: sortKey === key ? '#861F41' : colors.sub,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        cursor: key ? 'pointer' : 'default',
        whiteSpace: 'nowrap', background: colors.headerBg,
        borderBottom: `1px solid ${colors.border}`, userSelect: 'none',
      }}
    >
      {label}{key && <Arrow k={key} />}
    </th>
  );

  return (
    <div>
      {/* Instructor filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: colors.sub, fontWeight: 600 }}>Instructor:</span>
        <select
          value={instrFilter}
          onChange={e => setInstrFilter(e.target.value)}
          style={{
            padding: '4px 10px', borderRadius: 7,
            border: `1.5px solid ${colors.border}`,
            background: colors.inputBg, color: colors.text,
            fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
          }}
        >
          <option value="">All ({sections.length} sections)</option>
          {instructors.map(i => (
            <option key={i} value={i}>
              {i} ({sections.filter(s => s.instructor === i).length})
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: colors.sub }}>{sorted.length} section{sorted.length !== 1 ? 's' : ''} shown</span>
      </div>

      {/* Grade bar legend */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { color: '#16a34a', label: 'A  (A, A-)' },
          { color: '#0891b2', label: 'B  (B+, B, B-)' },
          { color: '#d97706', label: 'C  (C+, C, C-)' },
          { color: '#ea580c', label: 'D  (D+, D, D-)' },
          { color: '#dc2626', label: 'F' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: colors.sub, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${colors.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {th('Year',       'year')}
              {th('Term',       null)}
              {th('CRN',        null)}
              {th('Instructor', 'instr')}
              {th('Enrolled',   'enr')}
              {th('W',          null)}
              {th('GPA',        'gpa')}
              {th('Grades',     null)}
            </tr>
          </thead>
          <tbody>
            {(showAll ? sorted : sorted.slice(0, LIMIT)).map((s, i) => (
              <tr key={i} style={{
                borderBottom: `1px solid ${colors.border}`,
                background: i % 2 === 0 ? 'transparent' : colors.rowAlt,
              }}>
                <td style={{ padding: '8px 10px', color: colors.sub, fontSize: 12, whiteSpace: 'nowrap' }}>{s.academicYear || '—'}</td>
                <td style={{ padding: '8px 10px', color: colors.sub, fontSize: 12 }}>{s.term || '—'}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#861F41', fontSize: 11, fontWeight: 700 }}>{s.crn || '—'}</td>
                <td style={{ padding: '8px 10px', color: colors.text, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{s.instructor || '—'}</td>
                <td style={{ padding: '8px 10px', color: colors.text, fontSize: 12, textAlign: 'right' }}>{s.gradedEnrollment || '—'}</td>
                <td style={{ padding: '8px 10px', color: s.withdraws > 0 ? '#b45309' : colors.sub, fontSize: 12, textAlign: 'right' }}>
                  {s.withdraws > 0 ? s.withdraws : '—'}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {s.gpa != null
                    ? <GpaBadge gpa={s.gpa} />
                    : <span style={{ color: colors.sub }}>—</span>}
                </td>
                <td style={{ padding: '8px 10px' }}><GradeBar dist={s.gradeDistribution} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > LIMIT && (
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 10, padding: '7px 14px',
            background: 'transparent', border: `1.5px solid ${colors.border}`,
            borderRadius: 8, cursor: 'pointer', color: '#861F41',
            fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {showAll
            ? `▲ Show fewer`
            : `▼ Show ${sorted.length - LIMIT} more section${sorted.length - LIMIT !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ── Course Detail Modal ───────────────────────────────────────────
export function CourseDetail({ course, darkMode, schedule, onAdd, onRemove, onClose, onProfClick }) {
  const dm = darkMode;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [tab, setTab] = useState('grades');
  const [showAllInstructors, setShowAllInstructors] = useState(false);
  const INSTR_LIMIT = 10;
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Fetch full grade detail + RMP data
  useEffect(() => {
    setDetailLoading(true);
    setDetail(null);
    setTab('description');
    setShowAllInstructors(false);
    API.getCourse(course.subject, course.number)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [course.subject, course.number]);

  // Fetch Fall 2026 sections from the sections table
  useEffect(() => {
    setSectionsLoading(true);
    setSections([]);
    API.getSections(course.subject, course.number)
      .then(rows => { setSections(rows); setSectionsLoading(false); })
      .catch(() => setSectionsLoading(false));
  }, [course.subject, course.number]);

  // Build instructor list from real grade data (rmpMap comes from API.getCourse)
  const rmpMap = detail?.rmpMap || {};
  const instructorNames = detail
    ? [...new Set(detail.rawSections.map(s => s.instructor).filter(s => s && s !== 'Unknown'))]
    : [];
  const profs = instructorNames.map(name => ({
    id: name,
    name,
    rmpRating:     rmpMap[name]?.rmp_rating    ?? null,
    rmpDifficulty: rmpMap[name]?.rmp_difficulty ?? null,
    rmpCount:      rmpMap[name]?.rmp_count      ?? 0,
    rmpTags:       rmpMap[name]?.rmp_tags       ?? [],
    rmpReviews:    rmpMap[name]?.rmp_reviews    ?? [],
    rmpId:         rmpMap[name]?.rmp_id         ?? null,
  }));
  const colors = dm ? {
    bg:      "#0f0f0f",
    surface: "#141414",
    border:  "rgba(255,255,255,0.08)",
    text:    "#f0edf3",
    sub:     "rgba(255,255,255,0.38)",
  } : {
    bg:      "#ffffff",
    surface: "#faf7f3",
    border:  "rgba(20,16,12,0.10)",
    text:    "#1a1210",
    sub:     "rgba(20,16,12,0.55)",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "flex-start", justifyContent: "center",
      padding: isMobile ? "0" : "40px 24px",
      overflowY: "auto",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: colors.bg,
        borderRadius: isMobile ? "20px 20px 0 0" : 20,
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        width: "100%", maxWidth: 1040,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        border: `1px solid ${colors.border}`,
        marginBottom: 40,
        marginTop: isMobile ? "auto" : 0,
        ...(isMobile ? { position: "absolute", bottom: 0, left: 0, right: 0, marginBottom: 0, maxHeight: "92vh", overflowY: "auto" } : {}),
      }}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: dm ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
          </div>
        )}

        {/* Header */}
        <div style={{ padding: isMobile ? "16px 20px 0" : "28px 32px 0", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ background: "#861F41", color: "white", borderRadius: 8, padding: "4px 12px", fontWeight: 800, fontSize: 13, letterSpacing: "0.5px" }}>
                  {course.subject} {course.number}
                </span>
                <span style={{ background: dm ? "#3d3050" : "#f0edf8", color: dm ? "#c8b8d8" : "#5a3a6a", fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 8 }}>
                  {course.credits} credits
                </span>
                <GpaBadge gpa={course.avgGpa} />
              </div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: colors.text, lineHeight: 1.3 }}>{course.title}</h2>
            </div>
            <button onClick={onClose} style={{
              background: dm ? "#3d3050" : "#f0f0f0", border: "none", borderRadius: 8,
              width: 36, height: 36, cursor: "pointer", fontSize: 18, color: colors.sub, flexShrink: 0, marginLeft: 12,
            }}>✕</button>
          </div>

          {course.pathways && course.pathways.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {course.pathways.map(code => {
                const pw = MOCK.pathwaysOptions.find(p => p.code === code);
                if (!pw) return null;
                return (
                  <span key={code} style={{
                    background: dm ? "rgba(255,255,255,0.07)" : pw.bg,
                    color: dm ? "#c8b8d8" : pw.color,
                    border: `1px solid ${dm ? "rgba(255,255,255,0.15)" : pw.color + "55"}`,
                    borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <span style={{ opacity: 0.7, fontSize: 10 }}>Concept {code}{pw.suspended ? " ✦" : ""}</span>
                    <span>{pw.label}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, padding: isMobile ? "0 20px" : "0 32px" }}>
          {[
            ['description', 'Description'],
            ['grades',      'Grades'],
            ['instructors', `Instructors${profs.length ? ` (${profs.length})` : ''}`],
            ['sections',    `Sections${!sectionsLoading && sections.length ? ` (${sections.length})` : ''}`],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: "none", border: "none",
              borderBottom: tab === id ? "2.5px solid #861F41" : "2.5px solid transparent",
              color: tab === id ? "#861F41" : colors.sub,
              fontWeight: tab === id ? 800 : 600,
              fontSize: isMobile ? 13 : 14,
              padding: isMobile ? "12px 14px 10px" : "14px 20px 12px",
              cursor: "pointer", marginBottom: -1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "color 0.15s",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Description tab ────────────────────────────── */}
        {tab === 'description' && (
          <div style={{ padding: isMobile ? "20px 20px 28px" : "28px 32px 32px" }}>
            {/* Credits / pathways row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: dm ? "rgba(255,255,255,0.08)" : "#f0edf3",
                color: colors.sub,
              }}>
                {course.credits} credit{course.credits !== 1 ? "s" : ""}
              </span>
              {(course.pathways || []).map(p => (
                <span key={p} style={{
                  fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  background: "rgba(134,31,65,0.1)", color: "#861F41",
                }}>
                  Pathway {p}
                </span>
              ))}
            </div>

            {/* Description body */}
            {course.description ? (
              <p style={{
                margin: 0, fontSize: 15, color: colors.text,
                lineHeight: 1.75, fontWeight: 400,
              }}>
                {course.description}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: colors.sub, fontStyle: "italic" }}>
                No course description available.
              </p>
            )}
          </div>
        )}

        {/* ── Grades tab ─────────────────────────────────── */}
        {tab === 'grades' && (
          <div style={{ padding: isMobile ? "16px 20px 24px" : "24px 32px 28px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: colors.sub, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Grade distribution — all sections
            </h3>
            <GradeGrid dist={course.gradeDistribution} darkMode={dm} />

            <h3 style={{ margin: "28px 0 12px", fontSize: 13, fontWeight: 800, color: colors.sub, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Section-by-section breakdown
              {detail && (
                <span style={{ marginLeft: 8, fontWeight: 600, textTransform: "none", letterSpacing: 0, fontSize: 13 }}>
                  — {detail.rawSections.length} on record
                </span>
              )}
            </h3>
            {detailLoading ? (
              <div style={{ color: colors.sub, fontSize: 13 }}>Loading…</div>
            ) : detail && detail.rawSections.length > 0 ? (
              <SectionBreakdown sections={detail.rawSections} darkMode={dm} />
            ) : (
              <div style={{ color: colors.sub, fontSize: 13 }}>No data available.</div>
            )}
          </div>
        )}

        {/* ── Instructors tab ────────────────────────────── */}
        {tab === 'instructors' && (
          <div style={{ padding: isMobile ? "12px 0 16px" : "16px 0 20px" }}>
            {detailLoading ? (
              <div style={{ color: colors.sub, fontSize: 13, padding: "24px 32px" }}>Loading…</div>
            ) : profs.length === 0 ? (
              <div style={{ color: colors.sub, fontSize: 13, padding: "32px", textAlign: "center" }}>No instructor data on record.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {(showAllInstructors ? profs : profs.slice(0, INSTR_LIMIT)).map((prof, idx) => {
                  const visibleCount = showAllInstructors ? profs.length : Math.min(profs.length, INSTR_LIMIT);
                  const topTags    = (prof.rmpTags || []).slice(0, 3);
                  const firstReview = (prof.rmpReviews || []).find(r => r.comment || r.text);
                  const snippet    = firstReview?.comment || firstReview?.text || null;
                  return (
                    <button
                      key={prof.id}
                      onClick={() => onProfClick(prof)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: isMobile ? "14px 20px" : "16px 32px",
                        background: "transparent", border: "none",
                        borderBottom: idx < visibleCount - 1 ? `1px solid ${colors.border}` : "none",
                        cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Top row: avatar + name + rating */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: prof.rmpRating != null || topTags.length > 0 || snippet ? 10 : 0 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: `hsl(${(prof.name.charCodeAt(0) * 37) % 360}, 50%, 42%)`,
                          color: "white", fontWeight: 800, fontSize: 14,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{prof.name.charAt(0)}</div>

                        <span style={{ fontWeight: 700, fontSize: 15, color: colors.text, flex: 1 }}>{prof.name}</span>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {prof.rmpRating != null ? (
                            <>
                              <div style={{
                                background: prof.rmpRating >= 4 ? "#dcfce7" : prof.rmpRating >= 3 ? "#fef3c7" : "#fee2e2",
                                color: prof.rmpRating >= 4 ? "#1a7a38" : prof.rmpRating >= 3 ? "#b45309" : "#c0392b",
                                fontWeight: 800, fontSize: 14, padding: "3px 10px", borderRadius: 20,
                              }}>{prof.rmpRating.toFixed(1)}</div>
                              <StarRating rating={prof.rmpRating} size={12} />
                              {prof.rmpDifficulty != null && (
                                <span style={{ fontSize: 12, color: colors.sub, whiteSpace: "nowrap" }}>
                                  Diff {prof.rmpDifficulty.toFixed(1)}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: colors.sub, whiteSpace: "nowrap" }}>
                                ({prof.rmpCount})
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: colors.sub, fontStyle: "italic" }}>No RMP data</span>
                          )}
                          <span style={{ fontSize: 13, color: colors.sub, opacity: 0.45 }}>›</span>
                        </div>
                      </div>

                      {/* Tags */}
                      {topTags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: snippet ? 8 : 0, paddingLeft: 48 }}>
                          {topTags.map(tag => (
                            <span key={tag} style={{
                              background: dm ? "rgba(255,255,255,0.07)" : "#f0edf8",
                              color: dm ? "#c8b8d8" : "#5a3a6a",
                              fontSize: 11, fontWeight: 700,
                              padding: "3px 9px", borderRadius: 20,
                            }}>{tag}</span>
                          ))}
                        </div>
                      )}

                      {/* Review snippet */}
                      {snippet && (
                        <p style={{
                          margin: "0 0 0 48px", fontSize: 13, color: colors.sub, lineHeight: 1.5,
                          display: "-webkit-box", WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical", overflow: "hidden",
                          fontStyle: "italic",
                        }}>"{snippet}"</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {profs.length > INSTR_LIMIT && (
              <div style={{ padding: isMobile ? "10px 20px 4px" : "10px 32px 4px" }}>
                <button
                  onClick={() => setShowAllInstructors(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px',
                    background: 'transparent', border: `1.5px solid ${colors.border}`,
                    borderRadius: 8, cursor: 'pointer', color: '#861F41',
                    fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {showAllInstructors
                    ? `▲ Show fewer`
                    : `▼ Show ${profs.length - INSTR_LIMIT} more instructor${profs.length - INSTR_LIMIT !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sections tab ───────────────────────────────── */}
        {tab === 'sections' && (
          <div>
            <div style={{
              display: "grid", gridTemplateColumns: "70px 1fr 140px 100px 100px 90px",
              gap: 12, padding: "10px 16px", fontSize: 11, fontWeight: 800,
              color: colors.sub, textTransform: "uppercase", letterSpacing: "0.5px",
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div>CRN</div><div>Instructor</div><div>Time</div><div>Location</div><div>Seats</div><div></div>
            </div>
            {sectionsLoading ? (
              <div style={{ padding: "32px", color: colors.sub, fontSize: 13 }}>Loading sections…</div>
            ) : sections.length === 0 ? (
              <div style={{ padding: "32px", color: colors.sub, textAlign: "center", fontSize: 13 }}>No sections found for Fall 2026.</div>
            ) : sections.map(sec => (
              <SectionRow
                key={sec.crn}
                section={sec}
                onAdd={onAdd}
                onRemove={onRemove}
                inSchedule={schedule.some(s => s.crn === sec.crn)}
                onProfClick={onProfClick}
                rmpMap={rmpMap}
                darkMode={dm}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Course Card ───────────────────────────────────────────────────
// Minimal, magazine-style: hairline border, generous whitespace, eyebrow + heavy title.
function CourseCard({ course, darkMode, onClick, onProfClick }) {
  const dm = darkMode;
  // Section count comes from the aggregated courses row.
  // Seat availability requires a live sections query — shown in the detail modal instead.
  const sectionCount = course.totalSections || 0;

  const glass = glassCard(dm);
  const c = dm ? {
    bg:       glass.background,
    bgHov:    "rgba(255,255,255,0.07)",
    border:   "rgba(255,255,255,0.09)",
    text:     "#f0edf3",
    sub:      "rgba(255,255,255,0.40)",
    faint:    "rgba(255,255,255,0.22)",
    divider:  "rgba(255,255,255,0.07)",
  } : {
    bg:       glass.background,
    bgHov:    "rgba(255,255,255,0.92)",
    border:   "rgba(255,255,255,0.70)",
    text:     "#1a1210",
    sub:      "rgba(20,16,12,0.55)",
    faint:    "rgba(20,16,12,0.32)",
    divider:  "rgba(20,16,12,0.08)",
  };

  // GPA color tint, kept understated
  const gpa = course.avgGpa || 0;
  const gpaCol = gpa >= 3.3 ? "#4ade80" : gpa >= 3.0 ? "#86efac" : gpa >= 2.7 ? "#fbbf24" : "#f87171";

  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={() => onClick(course)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...glass,
        background: hov ? c.bgHov : c.bg,
        border: `1px solid ${hov ? "rgba(134,31,65,0.55)" : c.border}`,
        borderRadius: 16, padding: "22px 22px 18px", cursor: "pointer",
        transition: "border-color 0.18s ease, background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
        transform: hov ? "translateY(-3px)" : "none",
        boxShadow: hov ? "0 16px 40px rgba(134,31,65,0.12), 0 4px 12px rgba(0,0,0,0.12)" : glass.boxShadow,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Eyebrow row: course code + GPA */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#861F41",
          letterSpacing: "1.2px", textTransform: "uppercase",
        }}>{course.subject} {course.number}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: gpaCol, letterSpacing: "0.3px" }}>
          {gpa.toFixed(2)}
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        margin: "0 0 14px", fontSize: 17, fontWeight: 800,
        color: c.text, lineHeight: 1.32, letterSpacing: "-0.3px",
      }}>{course.title}</h3>

      {/* Instructors — shown if available in course data */}
      {course.instructors && course.instructors.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: c.sub, fontWeight: 500 }}>{course.instructors[0]}</span>
          {course.instructors.length > 1 && (
            <span style={{ fontSize: 11, color: c.faint, fontWeight: 600 }}>+{course.instructors.length - 1} more</span>
          )}
        </div>
      )}

      {/* Pathways — tiny uppercase letters, no chip bg */}
      {course.pathways && course.pathways.length > 0 && (
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14,
          fontSize: 9, fontWeight: 800, letterSpacing: "1px",
          color: c.faint, textTransform: "uppercase",
        }}>
          {course.pathways.map(code => {
            const pw = MOCK.pathwaysOptions.find(p => p.code === code);
            if (!pw) return null;
            return <span key={code} title={pw.label}>· Concept {code}{pw.suspended ? " ✦" : ""}</span>;
          })}
        </div>
      )}

      {/* Footer — pushed to bottom with margin-top auto */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${c.divider}`,
        fontSize: 11, fontWeight: 600, color: c.sub, letterSpacing: "0.2px",
      }}>
        <span>{course.credits} cr · {sectionCount} section{sectionCount !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

// ── FilterSection ─────────────────────────────────────────────────
// Defined outside FilterPanel so its reference is stable across renders.
// Prevents React from unmounting/remounting children (like range inputs) on
// every state update, which was breaking continuous slider drag.
function FilterSection({ title, divider, faint, children }) {
  return (
    <div style={{ borderTop: `1px solid ${divider}`, padding: "20px 0" }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: faint,
        textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14,
      }}>{title}</div>
      {children}
    </div>
  );
}

// ── SubjectSearch ─────────────────────────────────────────────────
// Replaces the long checkbox list with a chip-based search input.
function SubjectSearch({ subjects, selected, onChange, darkMode, c }) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);

  const filtered = (subjects || []).filter(s =>
    s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s)
  );

  const remove = s => onChange(selected.filter(x => x !== s));
  const add    = s => { onChange([...selected, s]); setQuery(""); inputRef.current?.focus(); };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {selected.map(s => (
            <span key={s} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "#861F41", color: "white",
              borderRadius: 20, padding: "3px 10px",
              fontSize: 11, fontWeight: 700,
            }}>
              {s}
              <button onClick={() => remove(s)} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.75)",
                cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, fontWeight: 700,
              }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(sanitizeQuery(e.target.value)); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={selected.length ? "Add another…" : "Search subjects…"}
        style={{
          width: "100%", padding: "7px 0",
          border: "none", borderBottom: `1px solid ${c.divider}`,
          background: "transparent", color: c.text,
          fontSize: 12, fontWeight: 500,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          outline: "none", boxSizing: "border-box",
        }}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: darkMode ? "#1a1520" : "white",
          border: `1px solid ${c.divider}`,
          borderRadius: 8, marginTop: 2,
          maxHeight: 200, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {filtered.map(s => (
            <button key={s} onMouseDown={() => add(s)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "8px 12px", background: "none", border: "none",
              color: c.text, fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.06)" : "rgba(134,31,65,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FilterPanel ───────────────────────────────────────────────────
// Minimal: no surrounding card, hairline section dividers, transparent inputs.
function FilterPanel({ filters, setFilters, darkMode, subjects, isMobile }) {
  const dm = darkMode;
  const c = dm ? {
    text:     "#f0edf3",
    sub:      "rgba(255,255,255,0.40)",
    faint:    "rgba(255,255,255,0.22)",
    divider:  "rgba(255,255,255,0.08)",
    inputBg:  "transparent",
    pillBg:   "rgba(255,255,255,0.04)",
  } : {
    text:     "#1a1210",
    sub:      "rgba(20,16,12,0.55)",
    faint:    "rgba(20,16,12,0.32)",
    divider:  "rgba(20,16,12,0.10)",
    inputBg:  "transparent",
    pillBg:   "rgba(20,16,12,0.04)",
  };

  // Shorthand that passes color tokens into the stable FilterSection component above.
  // Using a local alias (not a new component definition) keeps the reference stable.
  const S = ({ title, children }) => (
    <FilterSection title={title} divider={c.divider} faint={c.faint}>{children}</FilterSection>
  );

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      ...(isMobile ? {} : { position: "sticky", top: 80, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }),
      paddingRight: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#861F41",
          letterSpacing: "1.5px", textTransform: "uppercase",
        }}>Filter</span>
        <button onClick={() => setFilters({ subjects: [], minGpa: "", maxDiff: "", minCredits: "", maxCredits: "", pathway: "", days: [] })} style={{
          background: "none", border: "none", color: c.faint, fontSize: 11, fontWeight: 700,
          cursor: "pointer", padding: 0, letterSpacing: "0.3px",
        }}
        onMouseEnter={e => e.currentTarget.style.color = "#861F41"}
        onMouseLeave={e => e.currentTarget.style.color = c.faint}
        >Clear all</button>
      </div>

      <S title="Subject">
        <SubjectSearch
          subjects={subjects}
          selected={filters.subjects}
          onChange={subs => setFilters(f => ({ ...f, subjects: subs }))}
          darkMode={dm}
          c={c}
        />
      </S>

      <S title={`Min GPA · ${parseFloat(filters.minGpa || 0).toFixed(2)}`}>
        <input type="range" min="0" max="4" step="0.01"
          value={filters.minGpa || 0}
          onChange={e => setFilters(f => ({ ...f, minGpa: e.target.value }))}
          style={{ width: "100%", accentColor: "#861F41" }}
        />
      </S>

      <S title="Credits">
        <div style={{ display: "flex", gap: 6 }}>
          {["1","2","3","4"].map(cr => {
            const active = filters.minCredits === cr;
            return (
              <button key={cr} onClick={() => setFilters(f => ({ ...f, minCredits: f.minCredits === cr ? "" : cr }))} style={{
                flex: 1, padding: "8px 0", borderRadius: 8,
                border: `1px solid ${active ? "#861F41" : c.divider}`,
                background: active ? "#861F41" : "transparent",
                color: active ? "white" : c.text,
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "all 0.15s ease",
              }}>{cr === "4" ? "4+" : cr}</button>
            );
          })}
        </div>
      </S>

      <S title={`Max Difficulty · ${parseFloat(filters.maxDiff || 5).toFixed(1)}`}>
        <input type="range" min="1" max="5" step="0.1"
          value={filters.maxDiff || 5}
          onChange={e => setFilters(f => ({ ...f, maxDiff: e.target.value }))}
          style={{ width: "100%", accentColor: "#861F41" }}
        />
      </S>

      <S title="Pathways">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {MOCK.pathwaysOptions.filter(pw => !pw.suspended).map(pw => {
            const active = filters.pathway === pw.code;
            return (
              <button
                key={pw.code}
                onClick={() => setFilters(f => ({ ...f, pathway: f.pathway === pw.code ? "" : pw.code }))}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 4px", cursor: "pointer", textAlign: "left",
                  border: "none", borderLeft: `2px solid ${active ? "#861F41" : "transparent"}`,
                  paddingLeft: active ? 10 : 12,
                  background: "transparent",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700,
                  color: active ? "#861F41" : c.faint,
                  letterSpacing: "0.5px", minWidth: 22,
                }}>{pw.code}</span>
                <span style={{
                  fontSize: 12, fontWeight: 500, lineHeight: 1.4,
                  color: active ? c.text : c.sub,
                }}>{pw.label}</span>
              </button>
            );
          })}
        </div>
      </S>

      <S title="Days">
        <div style={{ display: "flex", gap: 6 }}>
          {["M","T","W","R","F"].map(d => {
            const active = filters.days.includes(d);
            return (
              <button key={d} onClick={() => setFilters(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))} style={{
                flex: 1, padding: "8px 0", borderRadius: 8,
                border: `1px solid ${active ? "#861F41" : c.divider}`,
                background: active ? "#861F41" : "transparent",
                color: active ? "white" : c.text,
                fontWeight: 800, fontSize: 11, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: "0.5px",
                transition: "all 0.15s ease",
              }}>{d}</button>
            );
          })}
        </div>
      </S>
    </div>
  );
}

// ── Course Search Page ────────────────────────────────────────────
const PAGE_SIZE = 24;

export default function CourseSearch({ darkMode, schedule, onCourseClick, onProfClick }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ subjects: [], minGpa: "", maxDiff: "", minCredits: "", maxCredits: "", pathway: "", days: [] });
  const [sort, setSort] = useState("subject");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showFilters, setShowFilters] = useState(() => window.innerWidth >= 768);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [coursePool, setCoursePool]             = useState([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);
  const topRef = useRef(null);
  const dm = darkMode;

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load subject list once on mount
  useEffect(() => {
    API.getSubjects().then(setSubjects).catch(console.error);
  }, []);

  // Load autocomplete pool on mount (all courses, no filters)
  useEffect(() => {
    API.getCourses({}).then(setCoursePool).catch(() => {});
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = e => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchSuggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const lower = query.trim().toLowerCase();
    return coursePool
      .filter(c =>
        `${c.subject} ${c.number}`.toLowerCase().includes(lower) ||
        c.title.toLowerCase().includes(lower) ||
        c.subject.toLowerCase().startsWith(lower)
      )
      .slice(0, 8);
  }, [coursePool, query]);

  // Fetch courses from Supabase whenever query or filterable fields change (300ms debounce)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setPage(1);
      API.getCourses({
        q: query,
        subjects: filters.subjects,
        minGpa: filters.minGpa,
        minCredits: filters.minCredits,
        pathway: filters.pathway,
      }).then(data => {
        setCourses(data);
        setLoading(false);
      }).catch(err => {
        console.error(err);
        setLoading(false);
      });
    }, 300);
  }, [query, filters.subjects, filters.minGpa, filters.minCredits, filters.pathway]);

  const c = dm ? {
    bg:       "transparent",
    text:     "#f0edf3",
    sub:      "rgba(255,255,255,0.45)",
    faint:    "rgba(255,255,255,0.22)",
    divider:  "rgba(255,255,255,0.08)",
    inputBg:  "transparent",
  } : {
    bg:       "transparent",
    text:     "#1a1210",
    sub:      "rgba(20,16,12,0.55)",
    faint:    "rgba(20,16,12,0.32)",
    divider:  "rgba(20,16,12,0.10)",
    inputBg:  "transparent",
  };

  // Sorting only — all filtering is handled server-side by the API
  const filtered = useMemo(() => {
    return [...courses].sort((a, b) => {
      if (sort === "gpa") return b.avgGpa - a.avgGpa;
      if (sort === "subject") return `${a.subject}${a.number}`.localeCompare(`${b.subject}${b.number}`);
      if (sort === "title") return a.title.localeCompare(b.title);
      return 0;
    });
  }, [courses, sort]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCourses = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = p => {
    setPage(p);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeFilters = filters.subjects.length + (filters.minGpa ? 1 : 0) + (filters.minCredits ? 1 : 0) + (filters.pathway ? 1 : 0) + (filters.days.length ? 1 : 0) + (filters.maxDiff && parseFloat(filters.maxDiff) < 5 ? 1 : 0);

  const SortBtn = ({ value, label }) => {
    const active = sort === value;
    return (
      <button onClick={() => setSort(value)} style={{
        background: "none", border: "none", padding: "4px 0",
        color: active ? c.text : c.faint,
        fontWeight: active ? 800 : 600, fontSize: 12,
        letterSpacing: "0.3px", cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        borderBottom: `1.5px solid ${active ? "#861F41" : "transparent"}`,
        transition: "color 0.15s ease, border-color 0.15s ease",
      }}>{label}</button>
    );
  };

  return (
    <div style={{ background: c.bg, minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── HEADER ────────────────────────────────────────────────────────────── */}
      <header style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "36px 16px 24px" : "72px 64px 36px", boxSizing: "border-box",
        borderBottom: `1px solid ${c.divider}`,
      }}>
        {/* Eyebrow */}
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "1.8px",
          fontFamily: "'JetBrains Mono', monospace",
          color: "#861F41", textTransform: "uppercase",
        }}>Course Catalog</span>

        {/* Headline */}
        <h1 style={{
          margin: "18px 0 14px",
          fontSize: "clamp(42px, 5.5vw, 78px)", fontWeight: 400,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: c.text, letterSpacing: "-1px", lineHeight: 1.02,
        }}>
          Browse <span style={{ color: "#861F41", fontStyle: "italic" }}>courses.</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          margin: "0 0 36px", maxWidth: 520,
          fontSize: 15, color: c.sub, lineHeight: 1.7, fontWeight: 500,
        }}>
          {loading
            ? "Loading the catalog…"
            : `${filtered.length} courses · grade data · RMP ratings.`}
        </p>

        {/* Search with autocomplete */}
        <div ref={searchWrapRef} style={{ position: "relative", maxWidth: 600 }}>
          <div style={{
            display: "flex", alignItems: "center",
            ...glassInput(dm),
            borderRadius: showSuggestions && searchSuggestions.length > 0 ? "14px 14px 0 0" : 14,
            padding: "0 16px",
            transition: "border-radius 0.15s, box-shadow 0.2s",
            boxShadow: showSuggestions && searchSuggestions.length > 0
              ? "0 2px 0 rgba(134,31,65,0.4)" : "none",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={query}
              onChange={e => { setQuery(sanitizeQuery(e.target.value)); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search by name, number, subject, or CRN…"
              style={{
                flex: 1, padding: "14px 12px",
                border: "none", background: "transparent", color: c.text,
                fontSize: 15, fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                outline: "none", minWidth: 0,
              }}
            />
            {query && (
              <button onClick={() => { setQuery(""); setShowSuggestions(false); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: c.faint, fontSize: 16, padding: "0 4px", lineHeight: 1,
                  flexShrink: 0,
                }}>✕</button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
              ...glassCard(dm),
              borderRadius: "0 0 14px 14px",
              border: `1px solid ${dm ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)"}`,
              borderTop: "none",
              overflow: "hidden",
            }}>
              {searchSuggestions.map((course, i) => (
                <button
                  key={course.id}
                  onMouseDown={() => {
                    setQuery(`${course.subject} ${course.number}`);
                    setShowSuggestions(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", padding: "11px 16px",
                    background: "transparent", border: "none",
                    borderTop: i > 0 ? `1px solid ${dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` : "none",
                    cursor: "pointer", textAlign: "left",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = dm ? "rgba(134,31,65,0.12)" : "rgba(134,31,65,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, fontWeight: 700, color: "#861F41",
                    minWidth: 72, flexShrink: 0,
                  }}>
                    {course.subject} {course.number}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 500, color: c.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{course.title}</span>
                  {course.avgGpa > 0 && (
                    <span style={{
                      marginLeft: "auto", fontSize: 11, fontWeight: 700,
                      color: course.avgGpa >= 3.3 ? "#16a34a" : course.avgGpa >= 3.0 ? "#b45309" : "#dc2626",
                      flexShrink: 0,
                    }}>{course.avgGpa.toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────────────── */}
      <div ref={topRef} style={{
        maxWidth: 1280, margin: "0 auto",
        padding: isMobile ? "20px 16px 60px" : "40px 64px 96px", boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: (!isMobile && showFilters) ? "220px 1fr" : "1fr",
        gap: 56, alignItems: "start",
      }}>

        {/* Filter sidebar — desktop always, mobile only when toggled */}
        {(!isMobile && showFilters) && (
          <FilterPanel filters={filters} setFilters={setFilters} darkMode={dm} subjects={subjects} isMobile={false} />
        )}
        {(isMobile && showFilters) && (
          <div style={{ marginBottom: 16 }}>
            <FilterPanel filters={filters} setFilters={setFilters} darkMode={dm} subjects={subjects} isMobile={true} />
          </div>
        )}

        {/* Main content */}
        <div style={{ minWidth: 0 }}>

          {/* Toolbar */}
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: isMobile ? 12 : 0,
            paddingBottom: 18, marginBottom: 24,
            borderBottom: `1px solid ${c.divider}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <button onClick={() => setShowFilters(!showFilters)} style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: c.faint, fontWeight: 700, fontSize: 11,
                letterSpacing: "1.2px", textTransform: "uppercase",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.color = c.text}
              onMouseLeave={e => e.currentTarget.style.color = c.faint}
              >
                {showFilters ? "Hide" : "Show"} filters
                {activeFilters > 0 && <span style={{ marginLeft: 6, color: "#861F41" }}>· {activeFilters}</span>}
              </button>
              <span style={{
                fontSize: 11, fontWeight: 700, color: c.faint,
                letterSpacing: "1.2px", textTransform: "uppercase",
              }}>{filtered.length} results</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: c.faint,
                letterSpacing: "1.5px", textTransform: "uppercase",
              }}>Sort</span>
              <SortBtn value="subject" label="Subject" />
              <SortBtn value="gpa" label="Avg GPA" />
              <SortBtn value="title" label="Title" />
            </div>
          </div>

          {/* Course grid */}
          {loading ? (
            <div style={{
              padding: "120px 0", textAlign: "center",
              fontSize: 11, fontWeight: 700, color: c.faint,
              letterSpacing: "2px", textTransform: "uppercase",
            }}>Loading the catalog…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "120px 0", textAlign: "center" }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: "#861F41",
                letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14,
              }}>No matches</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text, marginBottom: 6, letterSpacing: "-0.3px" }}>
                Nothing fits those filters.
              </div>
              <div style={{ fontSize: 14, color: c.sub, fontWeight: 500 }}>Try loosening a constraint or clearing the search.</div>
            </div>
          ) : (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
              }}>
                {pageCourses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    darkMode={dm}
                    onClick={onCourseClick}
                    onProfClick={onProfClick}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginTop: 48, paddingTop: 24, borderTop: `1px solid ${c.divider}`,
                }}>
                  <span style={{ fontSize: 12, color: c.faint, fontWeight: 600 }}>
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page === 1}
                      style={{
                        padding: "6px 12px", borderRadius: 7, border: `1px solid ${c.divider}`,
                        background: "transparent", color: page === 1 ? c.faint : c.text,
                        fontWeight: 700, fontSize: 12, cursor: page === 1 ? "default" : "pointer",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        opacity: page === 1 ? 0.4 : 1, transition: "all 0.15s",
                      }}
                    >←</button>

                    {(() => {
                      const pages = [];
                      const delta = 2;
                      const left  = Math.max(1, page - delta);
                      const right = Math.min(totalPages, page + delta);
                      if (left > 1) { pages.push(1); if (left > 2) pages.push("…"); }
                      for (let i = left; i <= right; i++) pages.push(i);
                      if (right < totalPages) { if (right < totalPages - 1) pages.push("…"); pages.push(totalPages); }
                      return pages.map((p, i) => p === "…" ? (
                        <span key={`ellipsis-${i}`} style={{ padding: "6px 4px", color: c.faint, fontSize: 12 }}>…</span>
                      ) : (
                        <button key={p} onClick={() => goToPage(p)} style={{
                          width: 34, height: 34, borderRadius: 7,
                          border: `1px solid ${p === page ? "#861F41" : c.divider}`,
                          background: p === page ? "#861F41" : "transparent",
                          color: p === page ? "white" : c.text,
                          fontWeight: p === page ? 800 : 600, fontSize: 12,
                          cursor: p === page ? "default" : "pointer",
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          transition: "all 0.15s",
                        }}>{p}</button>
                      ));
                    })()}

                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page === totalPages}
                      style={{
                        padding: "6px 12px", borderRadius: 7, border: `1px solid ${c.divider}`,
                        background: "transparent", color: page === totalPages ? c.faint : c.text,
                        fontWeight: 700, fontSize: 12,
                        cursor: page === totalPages ? "default" : "pointer",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        opacity: page === totalPages ? 0.4 : 1, transition: "all 0.15s",
                      }}
                    >→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

