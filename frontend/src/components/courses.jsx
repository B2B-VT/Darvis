// Course Search, Cards, Detail, Grade Grid
import { useState, useEffect, useRef, useMemo } from "react";
import { MOCK } from "../mock-data.js";
import { API } from "../api.js";
import { StarRating } from "./nav-auth.jsx";
import {
  MONO, SERIF, SANS, ACCENT, EASE,
  palette, glassCard, glassInput, RADIUS, SHADOW,
} from "../theme.jsx";

// ── Helpers ───────────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

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

function sanitizeQuery(raw) {
  if (!raw) return "";
  let s = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/[ \t]+/g, " ");
  if (s.length > 200) s = s.slice(0, 200);
  return s;
}

function gpaColor(gpa) {
  if (!gpa || gpa <= 0) return null;
  if (gpa >= 3.5) return "#22c55e";
  if (gpa >= 3.0) return "#f59e0b";
  if (gpa >= 2.5) return "#ef4444";
  return "#dc2626";
}

// ── GPA Badge ─────────────────────────────────────────────────────
export function GpaBadge({ gpa, large, darkMode }) {
  if (!gpa || gpa <= 0) return null;
  const col = gpaColor(gpa) || "#888";
  return (
    <span style={{
      background: `${col}18`, color: col,
      fontFamily: MONO, fontWeight: 700,
      fontSize: large ? 14 : 11,
      padding: large ? "4px 12px" : "2px 8px",
      borderRadius: RADIUS.pill,
      letterSpacing: "-0.3px", border: `1px solid ${col}33`,
    }}>
      {gpa.toFixed(2)}
    </span>
  );
}

// ── Seats Badge ───────────────────────────────────────────────────
function SeatsBadge({ seats, enrolled }) {
  const pct = enrolled / seats;
  const full = pct >= 1;
  const almostFull = pct >= 0.9;
  const color = full ? "#dc2626" : almostFull ? "#d97706" : "#16a34a";
  return (
    <span style={{
      background: `${color}18`, color,
      fontFamily: MONO, fontWeight: 600, fontSize: 11,
      padding: "2px 8px", borderRadius: RADIUS.pill, border: `1px solid ${color}33`,
    }}>
      {full ? "Full" : `${seats - enrolled} open`}
    </span>
  );
}

// ── Grade Distribution Grid ───────────────────────────────────────
export function GradeGrid({ dist, darkMode }) {
  const grades = ["A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W"];
  const colors = MOCK.gradeColors;
  const total = grades.reduce((s, g) => s + (dist[g] || 0), 0);
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {grades.map(g => {
        const pct = Math.round((dist[g] || 0) / total * 100);
        if (pct === 0) return null;
        const c = colors[g];
        return (
          <div key={g} style={{ flex: "0 0 auto", background: c.bg, borderRadius: RADIUS.xs, padding: "6px 10px", textAlign: "center", minWidth: 44 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.text, fontFamily: MONO }}>{g}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, fontFamily: MONO }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section Row ───────────────────────────────────────────────────
function SectionRow({ section, onAdd, onRemove, inSchedule, onProfClick, rmpMap, darkMode }) {
  const p = palette(darkMode);
  const full    = section.seats > 0 ? section.enrolled >= section.seats : false;
  const virtual = isVirtual(section);
  const instrName = section.instructor || 'Staff';
  const rmp = rmpMap?.[instrName];
  const profObj = rmp
    ? { id: instrName, name: instrName, rmpRating: rmp.rmp_rating, rmpDifficulty: rmp.rmp_difficulty, rmpCount: rmp.rmp_count, rmpTags: rmp.rmp_tags ?? [], rmpReviews: rmp.rmp_reviews ?? [], rmpId: rmp.rmp_id ?? null }
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px 100px 100px 90px", gap: 12, padding: "12px 16px", alignItems: "center", borderBottom: `1px solid ${p.lineSoft}`, fontSize: 13, fontFamily: SANS }}>
      <div style={{ fontFamily: MONO, fontWeight: 600, color: ACCENT, fontSize: 11 }}>{section.crn}</div>
      <div>
        {profObj ? (
          <button onClick={() => onProfClick(profObj)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: p.text, fontWeight: 600, fontSize: 13, textDecoration: "underline", fontFamily: SANS, textAlign: "left" }}>{instrName}</button>
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: p.text }}>{instrName}</span>
        )}
        {rmp?.rmp_rating != null && (
          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <StarRating rating={rmp.rmp_rating} size={11} />
            <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11, color: ACCENT }}>{rmp.rmp_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div style={{ color: p.text, fontSize: 12 }}>
        {virtual ? (
          <div style={{ fontWeight: 600, color: "#0369a1", fontSize: 12 }}>Meets virtually</div>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11 }}>{section.days.join(" ")} · {formatTime(section.startTime)}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: p.textSub }}>→ {formatTime(section.endTime)}</div>
          </>
        )}
      </div>
      <div style={{ color: p.textSub, fontSize: 12 }}>{virtual ? "—" : section.location}</div>
      <div><SeatsBadge seats={section.seats} enrolled={section.enrolled} /></div>
      <div>
        {inSchedule ? (
          <button onClick={() => onRemove(section.crn)} style={{ background: "rgba(220,38,38,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: RADIUS.xs, padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: SANS }}>Remove</button>
        ) : full ? (
          <button onClick={() => onAdd(section)} style={{ background: "none", color: "#d97706", border: "1px solid rgba(217,119,6,0.4)", borderRadius: RADIUS.xs, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: SANS, whiteSpace: "nowrap" }}>I'm enrolled</button>
        ) : (
          <button onClick={() => onAdd(section)} style={{ background: ACCENT, color: "white", border: "none", borderRadius: RADIUS.xs, padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: SANS }}>Add</button>
        )}
      </div>
    </div>
  );
}

// ── Section Breakdown Table ───────────────────────────────────────
function SectionBreakdown({ sections, darkMode }) {
  const p = palette(darkMode);
  const [sortKey, setSortKey] = useState('year');
  const [sortDir, setSortDir] = useState('desc');
  const [instrFilter, setInstrFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 10;

  const instructors = useMemo(() => [...new Set(sections.map(s => s.instructor))].sort(), [sections]);

  const sorted = useMemo(() => {
    let list = instrFilter ? sections.filter(s => s.instructor === instrFilter) : [...sections];
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === 'year')       { av = `${a.academicYear}${a.term}`; bv = `${b.academicYear}${b.term}`; }
      else if (sortKey === 'gpa')   { av = a.gpa || 0;                    bv = b.gpa || 0; }
      else if (sortKey === 'instr') { av = a.instructor;                  bv = b.instructor; }
      else if (sortKey === 'enr')   { av = a.gradedEnrollment;            bv = b.gradedEnrollment; }
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
    <span style={{ marginLeft: 3, opacity: sortKey === k ? 1 : 0.3 }}>
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
    if (total === 0) return <span style={{ color: p.textMute, fontFamily: MONO, fontSize: 11 }}>—</span>;
    const segs = [
      { pct: a / total * 100, color: '#16a34a', key: 'A' },
      { pct: b / total * 100, color: '#0891b2', key: 'B' },
      { pct: c / total * 100, color: '#d97706', key: 'C' },
      { pct: d / total * 100, color: '#ea580c', key: 'D' },
      { pct: f / total * 100, color: '#dc2626', key: 'F' },
    ].filter(s => s.pct > 0);
    return (
      <div style={{ display: 'flex', height: 20, borderRadius: RADIUS.xs, overflow: 'hidden', width: 200, gap: 1 }}>
        {segs.map((s, i) => (
          <div key={i} title={`${s.key}: ${s.pct.toFixed(0)}%`} style={{ flexGrow: s.pct, flexShrink: 1, flexBasis: 0, minWidth: 22, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: 'white', whiteSpace: 'nowrap' }}>{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: p.textSub, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Instructor:</span>
        <select value={instrFilter} onChange={e => setInstrFilter(e.target.value)} style={{ padding: '4px 10px', borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", color: p.text, fontSize: 12, fontFamily: SANS, cursor: 'pointer' }}>
          <option value="">All ({sections.length} sections)</option>
          {instructors.map(i => <option key={i} value={i}>{i} ({sections.filter(s => s.instructor === i).length})</option>)}
        </select>
        <span style={{ fontFamily: MONO, fontSize: 11, color: p.textMute }}>{sorted.length} section{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {[{color:'#16a34a',label:'A (A, A-)'},{color:'#0891b2',label:'B (B+,B,B-)'},{color:'#d97706',label:'C (C+,C,C-)'},{color:'#ea580c',label:'D (D+,D,D-)'},{color:'#dc2626',label:'F'}].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: p.textSub }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: RADIUS.sm, border: `1px solid ${p.line}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {[['Year','year'],['Term',null],['CRN',null],['Instructor','instr'],['Enrolled','enr'],['W',null],['GPA','gpa'],['Grades',null]].map(([label, key]) => (
                <th key={label} onClick={key ? () => toggleSort(key) : undefined} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, fontFamily: MONO, color: sortKey === key ? ACCENT : p.textMute, textTransform: 'uppercase', letterSpacing: '1px', cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap', background: darkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${p.line}`, userSelect: 'none' }}>
                  {label}{key && <Arrow k={key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(showAll ? sorted : sorted.slice(0, LIMIT)).map((s, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${p.lineSoft}`, background: i % 2 === 0 ? 'transparent' : (darkMode ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)") }}>
                <td style={{ padding: '8px 10px', color: p.textSub, fontFamily: MONO, fontSize: 11, whiteSpace: 'nowrap' }}>{s.academicYear || '—'}</td>
                <td style={{ padding: '8px 10px', color: p.textSub, fontFamily: MONO, fontSize: 11 }}>{s.term || '—'}</td>
                <td style={{ padding: '8px 10px', fontFamily: MONO, color: ACCENT, fontSize: 10, fontWeight: 600 }}>{s.crn || '—'}</td>
                <td style={{ padding: '8px 10px', color: p.text, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', fontFamily: SANS }}>{s.instructor || '—'}</td>
                <td style={{ padding: '8px 10px', color: p.text, fontSize: 12, textAlign: 'right', fontFamily: MONO }}>{s.gradedEnrollment || '—'}</td>
                <td style={{ padding: '8px 10px', color: s.withdraws > 0 ? '#d97706' : p.textMute, fontSize: 12, textAlign: 'right', fontFamily: MONO }}>{s.withdraws > 0 ? s.withdraws : '—'}</td>
                <td style={{ padding: '8px 10px' }}>{s.gpa != null ? <GpaBadge gpa={s.gpa} darkMode={darkMode} /> : <span style={{ color: p.textMute, fontFamily: MONO }}>—</span>}</td>
                <td style={{ padding: '8px 10px' }}><GradeBar dist={s.gradeDistribution} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > LIMIT && (
        <button onClick={() => setShowAll(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 14px', background: 'transparent', border: `1px solid ${p.line}`, borderRadius: RADIUS.xs, cursor: 'pointer', color: ACCENT, fontWeight: 600, fontSize: 12, fontFamily: MONO }}>
          {showAll ? `▲ Show fewer` : `▼ ${sorted.length - LIMIT} more section${sorted.length - LIMIT !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ── Course Detail Modal ───────────────────────────────────────────
export function CourseDetail({ course, darkMode, schedule, onAdd, onRemove, onClose, onProfClick }) {
  const dm = darkMode;
  const p = palette(dm);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [tab, setTab] = useState('description');
  const [showAllInstructors, setShowAllInstructors] = useState(false);
  const INSTR_LIMIT = 10;
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    setDetailLoading(true); setDetail(null); setTab('description'); setShowAllInstructors(false);
    API.getCourse(course.subject, course.number)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [course.subject, course.number]);

  useEffect(() => {
    setSectionsLoading(true); setSections([]);
    API.getSections(course.subject, course.number)
      .then(rows => { setSections(rows); setSectionsLoading(false); })
      .catch(() => setSectionsLoading(false));
  }, [course.subject, course.number]);

  const rmpMap = detail?.rmpMap || {};
  const instructorNames = detail
    ? [...new Set(detail.rawSections.map(s => s.instructor).filter(s => s && s !== 'Unknown'))]
    : [];
  const profs = instructorNames.map(name => ({
    id: name, name,
    rmpRating:     rmpMap[name]?.rmp_rating    ?? null,
    rmpDifficulty: rmpMap[name]?.rmp_difficulty ?? null,
    rmpCount:      rmpMap[name]?.rmp_count      ?? 0,
    rmpTags:       rmpMap[name]?.rmp_tags       ?? [],
    rmpReviews:    rmpMap[name]?.rmp_reviews    ?? [],
    rmpId:         rmpMap[name]?.rmp_id         ?? null,
  }));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? "0" : "40px 24px", overflowY: "auto", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: dm ? "#0f0f0f" : "#ffffff", border: `1px solid ${p.line}`, borderRadius: isMobile ? `${RADIUS.xl}px ${RADIUS.xl}px 0 0` : RADIUS.xl, boxShadow: SHADOW.xl, width: "100%", maxWidth: 1040, fontFamily: SANS, marginBottom: 40, marginTop: isMobile ? "auto" : 0, ...(isMobile ? { position: "absolute", bottom: 0, left: 0, right: 0, marginBottom: 0, maxHeight: "92vh", overflowY: "auto" } : {}) }}>

        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: p.line }} />
          </div>
        )}

        {/* Header */}
        <div style={{ padding: isMobile ? "16px 20px 0" : "28px 32px 0", borderBottom: `1px solid ${p.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: "1.4px", textTransform: "uppercase" }}>{course.subject} {course.number}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: p.textSub, background: p.card, borderRadius: RADIUS.pill, padding: "2px 10px", border: `1px solid ${p.line}` }}>{course.credits} cr</span>
                {course.avgGpa > 0 && <GpaBadge gpa={course.avgGpa} darkMode={dm} />}
              </div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 400, fontFamily: SERIF, color: p.text, lineHeight: 1.3 }}>{course.title}</h2>
            </div>
            <button onClick={onClose} style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.xs, width: 34, height: 34, cursor: "pointer", fontSize: 16, color: p.textSub, flexShrink: 0, marginLeft: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>

          {course.pathways && course.pathways.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {course.pathways.map(code => {
                const pw = MOCK.pathwaysOptions.find(pw => pw.code === code);
                if (!pw) return null;
                return (
                  <span key={code} style={{ background: dm ? "rgba(255,255,255,0.07)" : pw.bg, color: dm ? p.textSub : pw.color, border: `1px solid ${dm ? p.line : pw.color + "55"}`, borderRadius: RADIUS.pill, padding: "4px 12px", fontSize: 11, fontFamily: MONO, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ opacity: 0.6, fontSize: 9 }}>Concept {code}{pw.suspended ? " ✦" : ""}</span>
                    <span>{pw.label}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${p.line}`, padding: isMobile ? "0 20px" : "0 32px", overflowX: "auto" }}>
          {[['description','Description'],['grades','Grades'],['instructors',`Instructors${profs.length ? ` (${profs.length})` : ''}`],['sections',`Sections${!sectionsLoading && sections.length ? ` (${sections.length})` : ''}`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: tab === id ? `2px solid ${ACCENT}` : "2px solid transparent", color: tab === id ? ACCENT : p.textSub, fontWeight: tab === id ? 600 : 400, fontFamily: SANS, fontSize: isMobile ? 13 : 14, padding: isMobile ? "12px 14px 10px" : "14px 20px 12px", cursor: "pointer", marginBottom: -1, whiteSpace: "nowrap", transition: "color 0.15s" }}>{label}</button>
          ))}
        </div>

        {/* Description */}
        {tab === 'description' && (
          <div style={{ padding: isMobile ? "20px 20px 28px" : "28px 32px 32px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, padding: "3px 10px", borderRadius: RADIUS.pill, background: p.card, color: p.textSub, border: `1px solid ${p.line}` }}>{course.credits} credit{course.credits !== 1 ? "s" : ""}</span>
              {(course.pathways || []).map(pw => (
                <span key={pw} style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, padding: "3px 10px", borderRadius: RADIUS.pill, background: "rgba(134,31,65,0.10)", color: ACCENT, border: "1px solid rgba(134,31,65,0.20)" }}>Pathway {pw}</span>
              ))}
            </div>
            {course.description ? (
              <p style={{ margin: 0, fontSize: 15, color: p.text, lineHeight: 1.75, fontFamily: SANS }}>{course.description}</p>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: p.textMute, fontStyle: "italic", fontFamily: SANS }}>No course description available.</p>
            )}
          </div>
        )}

        {/* Grades */}
        {tab === 'grades' && (
          <div style={{ padding: isMobile ? "16px 20px 24px" : "24px 32px 28px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 14 }}>Grade distribution — all sections</div>
            <GradeGrid dist={course.gradeDistribution} darkMode={dm} />
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginTop: 28, marginBottom: 12 }}>
              Section-by-section breakdown
              {detail && <span style={{ color: p.textSub, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontFamily: SANS, fontSize: 12 }}> — {detail.rawSections.length} on record</span>}
            </div>
            {detailLoading ? (
              <div style={{ color: p.textSub, fontSize: 13, fontFamily: SANS }}>Loading…</div>
            ) : detail && detail.rawSections.length > 0 ? (
              <SectionBreakdown sections={detail.rawSections} darkMode={dm} />
            ) : (
              <div style={{ color: p.textSub, fontSize: 13, fontFamily: SANS }}>No data available.</div>
            )}
          </div>
        )}

        {/* Instructors */}
        {tab === 'instructors' && (
          <div style={{ padding: isMobile ? "12px 0 16px" : "16px 0 20px" }}>
            {detailLoading ? (
              <div style={{ color: p.textSub, fontSize: 13, padding: "24px 32px", fontFamily: SANS }}>Loading…</div>
            ) : profs.length === 0 ? (
              <div style={{ color: p.textSub, fontSize: 13, padding: "32px", textAlign: "center", fontFamily: SANS }}>No instructor data on record.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {(showAllInstructors ? profs : profs.slice(0, INSTR_LIMIT)).map((prof, idx) => {
                  const visibleCount = showAllInstructors ? profs.length : Math.min(profs.length, INSTR_LIMIT);
                  const topTags = (prof.rmpTags || []).slice(0, 3);
                  const firstReview = (prof.rmpReviews || []).find(r => r.comment || r.text);
                  const snippet = firstReview?.comment || firstReview?.text || null;
                  return (
                    <button key={prof.id} onClick={() => onProfClick(prof)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: isMobile ? "14px 20px" : "16px 32px", background: "transparent", border: "none", borderBottom: idx < visibleCount - 1 ? `1px solid ${p.lineSoft}` : "none", cursor: "pointer", fontFamily: SANS, transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = p.card}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: prof.rmpRating != null || topTags.length > 0 || snippet ? 10 : 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: `hsl(${(prof.name.charCodeAt(0) * 37) % 360}, 45%, 42%)`, color: "white", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{prof.name.charAt(0)}</div>
                        <span style={{ fontWeight: 600, fontSize: 15, color: p.text, flex: 1, fontFamily: SANS }}>{prof.name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {prof.rmpRating != null ? (
                            <>
                              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: ACCENT }}>{prof.rmpRating.toFixed(1)}</span>
                              <StarRating rating={prof.rmpRating} size={12} />
                              {prof.rmpDifficulty != null && <span style={{ fontSize: 11, color: p.textSub, fontFamily: MONO }}>Diff {prof.rmpDifficulty.toFixed(1)}</span>}
                              <span style={{ fontSize: 11, color: p.textMute, fontFamily: MONO }}>({prof.rmpCount})</span>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: p.textMute, fontStyle: "italic" }}>No RMP</span>
                          )}
                          <span style={{ fontSize: 13, color: p.textFaint }}>›</span>
                        </div>
                      </div>
                      {topTags.length > 0 && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: snippet ? 8 : 0, paddingLeft: 48 }}>
                          {topTags.map(tag => <span key={tag} style={{ background: p.card, color: p.textSub, fontSize: 10, fontFamily: MONO, fontWeight: 600, padding: "3px 8px", borderRadius: RADIUS.pill, border: `1px solid ${p.line}` }}>{tag}</span>)}
                        </div>
                      )}
                      {snippet && <p style={{ margin: "0 0 0 48px", fontSize: 12, color: p.textSub, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontStyle: "italic", fontFamily: SANS }}>"{snippet}"</p>}
                    </button>
                  );
                })}
              </div>
            )}
            {profs.length > INSTR_LIMIT && (
              <div style={{ padding: isMobile ? "10px 20px 4px" : "10px 32px 4px" }}>
                <button onClick={() => setShowAllInstructors(v => !v)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${p.line}`, borderRadius: RADIUS.xs, cursor: 'pointer', color: ACCENT, fontWeight: 600, fontSize: 12, fontFamily: MONO }}>
                  {showAllInstructors ? `▲ Show fewer` : `▼ ${profs.length - INSTR_LIMIT} more instructor${profs.length - INSTR_LIMIT !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sections */}
        {tab === 'sections' && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px 100px 100px 90px", gap: 12, padding: "10px 16px", fontFamily: MONO, fontSize: 10, fontWeight: 600, color: p.textMute, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${p.line}` }}>
              <div>CRN</div><div>Instructor</div><div>Time</div><div>Location</div><div>Seats</div><div></div>
            </div>
            {sectionsLoading ? (
              <div style={{ padding: "32px", color: p.textSub, fontSize: 13, fontFamily: SANS }}>Loading sections…</div>
            ) : sections.length === 0 ? (
              <div style={{ padding: "32px", color: p.textSub, textAlign: "center", fontSize: 13, fontFamily: SANS }}>No sections found for Fall 2026.</div>
            ) : sections.map(sec => (
              <SectionRow key={sec.crn} section={sec} onAdd={onAdd} onRemove={onRemove} inSchedule={schedule.some(s => s.crn === sec.crn)} onProfClick={onProfClick} rmpMap={rmpMap} darkMode={dm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Course Card ───────────────────────────────────────────────────

function isPlaceholder(v) {
  return !v || /^\s*$/.test(v) || /^-+$/.test(v) || v.trim() === "(ARR)";
}

function fmtTime(t) {
  if (!t || isPlaceholder(t)) return null;
  // "09:30" → "9:30am", "14:30" → "2:30pm"
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const ampm = h >= 12 ? "pm" : "am";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m}${ampm}`;
}

function lookupRmp(name, map) {
  if (!map || !name) return null;
  if (map[name]) return map[name];
  const norm = name.trim().replace(/\s+/g, " ");
  if (map[norm]) return map[norm];
  const lastName = norm.split(/\s+/).pop().toLowerCase();
  return map[`_ln_${lastName}`] || null;
}

function rmpColor(r) {
  return r >= 4 ? "#22c55e" : r >= 3 ? "#f59e0b" : "#ef4444";
}

const SECTION_LIMIT = 5;

function CourseCard({ course, darkMode, onClick, onProfClick, instructorMap }) {
  const dm = darkMode;
  const p  = palette(dm);
  const glass = glassCard(dm);
  const gpa = course.avgGpa || 0;
  const ref = useRef(null);
  const [sections, setSections] = useState(null);
  const [showAll,  setShowAll]  = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        API.getSections(course.subject, course.number)
          .then(setSections)
          .catch(() => setSections([]));
        obs.disconnect();
      }
    }, { rootMargin: "150px" });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [course.subject, course.number]);

  // Attach RMP to each section, sort by RMP rating desc
  const enriched = sections
    ? sections
        .map(sec => ({ ...sec, rmp: lookupRmp(sec.instructor, instructorMap) }))
        .sort((a, b) => (b.rmp?.rmpRating ?? -1) - (a.rmp?.rmpRating ?? -1))
    : null;

  const overflow = enriched ? Math.max(0, enriched.length - SECTION_LIMIT) : 0;
  const visible  = showAll ? enriched : enriched?.slice(0, SECTION_LIMIT);

  return (
    <div ref={ref} style={{ ...glass, borderRadius: RADIUS.lg, padding: "20px 22px 18px", fontFamily: SANS }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ background: ACCENT, color: "#fff", borderRadius: RADIUS.pill, padding: "3px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px" }}>
          {course.subject} {course.number}
        </span>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: p.textSub }}>
          {course.credits} {course.credits === 1 ? "Credit" : "Credits"}
        </span>
        {gpa > 0 && <GpaBadge gpa={gpa} darkMode={dm} />}
      </div>

      {/* ── Title ── */}
      <h3
        onClick={() => onClick(course)}
        style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 600, fontFamily: SANS, color: p.text, cursor: "pointer", lineHeight: 1.3, letterSpacing: "-0.3px", transition: "color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.color = ACCENT}
        onMouseLeave={e => e.currentTarget.style.color = p.text}
      >{course.title}</h3>

      {/* ── Description ── */}
      {course.description && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: p.textMute, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {course.description}
        </p>
      )}

      {/* ── Sections ── */}
      <div style={{ borderTop: `1px solid ${p.lineSoft}`, paddingTop: 12 }}>
        {enriched === null ? (
          <div style={{ fontFamily: SANS, fontSize: 12, color: p.textMute }}>Loading sections…</div>
        ) : enriched.length === 0 ? (
          <div style={{ fontFamily: SANS, fontSize: 12, color: p.textMute }}>No sections for Fall 2026.</div>
        ) : (
          <>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: p.textSub, marginBottom: 8 }}>
              {enriched.length} section{enriched.length !== 1 ? "s" : ""}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visible.map(sec => {
                const days     = (sec.days || []).join("");
                const start    = fmtTime(sec.startTime);
                const end      = fmtTime(sec.endTime);
                const timeStr  = start && end ? `${start}–${end}` : start || null;
                const hasDays  = !isPlaceholder(days);
                const isOpen   = sec.seats > 0 ? sec.enrolled < sec.seats : true;
                const rmp      = sec.rmp;

                return (
                  <div key={sec.crn} style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: "10px 14px", background: dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                    {/* Row 1: CRN + status + seats */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: p.text }}>{sec.crn}</span>
                      <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: isOpen ? "#22c55e" : "#ef4444", background: isOpen ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", borderRadius: RADIUS.pill, padding: "2px 8px" }}>
                        {isOpen ? "Open" : "Closed"}
                      </span>
                      <div style={{ flex: 1 }} />
                      {sec.seats > 0 && (
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: ACCENT }}>
                          {sec.enrolled}/{sec.seats}
                        </span>
                      )}
                    </div>

                    {/* Row 2: days · time · location */}
                    <div style={{ fontFamily: MONO, fontSize: 10, color: p.textMute, display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
                      {hasDays && <span>{days}</span>}
                      {timeStr && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {timeStr}
                        </span>
                      )}
                      {!hasDays && !timeStr && <span style={{ color: p.textFaint }}>Times arranged</span>}
                      {sec.location && sec.location !== "TBA" && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {sec.location}
                        </span>
                      )}
                    </div>

                    {/* Row 3: instructor + RMP */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => onProfClick?.({ name: sec.instructor })}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 500, color: p.textSub, transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = ACCENT}
                        onMouseLeave={e => e.currentTarget.style.color = p.textSub}
                      >
                        {sec.instructor}
                      </button>
                      {rmp?.rmpRating != null && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: rmpColor(rmp.rmpRating) }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill={rmpColor(rmp.rmpRating)} stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          {rmp.rmpRating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {overflow > 0 && (
              <button
                onClick={() => setShowAll(s => !s)}
                style={{ marginTop: 8, background: "none", border: `1px solid ${p.line}`, borderRadius: RADIUS.sm, padding: "5px 14px", cursor: "pointer", fontFamily: MONO, fontSize: 10, fontWeight: 600, color: p.textSub, display: "flex", alignItems: "center", gap: 6, transition: "border-color 0.15s, color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = p.line; e.currentTarget.style.color = p.textSub; }}
              >
                <span style={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
                {showAll ? "Show less" : `+${overflow} more section${overflow !== 1 ? "s" : ""}`}
              </button>
            )}
          </>
        )}
      </div>

      <button onClick={() => onClick(course)} style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: p.textMute, transition: "color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.color = ACCENT}
        onMouseLeave={e => e.currentTarget.style.color = p.textMute}
      >View grade history →</button>
    </div>
  );
}

// ── FilterSection ─────────────────────────────────────────────────
function FilterSection({ title, children, accentColor, lineColor }) {
  return (
    <div style={{ borderTop: `1px solid ${lineColor}`, padding: "18px 0" }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: accentColor, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// ── SubjectSearch ─────────────────────────────────────────────────
function SubjectSearch({ subjects, selected, onChange, darkMode }) {
  const p = palette(darkMode);
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);

  const filtered = (subjects || []).filter(s => s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s));
  const remove = s => onChange(selected.filter(x => x !== s));
  const add    = s => { onChange([...selected, s]); setQuery(""); inputRef.current?.focus(); };

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {selected.map(s => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(134,31,65,0.12)", color: ACCENT, border: "1px solid rgba(134,31,65,0.30)", borderRadius: RADIUS.pill, padding: "3px 10px", fontFamily: MONO, fontSize: 10, fontWeight: 600 }}>
              {s}
              <button onClick={() => remove(s)} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.7 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input ref={inputRef} value={query} onChange={e => { setQuery(sanitizeQuery(e.target.value)); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={selected.length ? "Add another…" : "Search subjects…"}
        style={{ ...glassInput(darkMode), width: "100%", padding: "7px 10px", borderRadius: RADIUS.xs, color: p.text, fontFamily: SANS, fontSize: 12, outline: "none", boxSizing: "border-box", border: `1px solid ${p.line}` }} />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, ...glassCard(darkMode), borderRadius: RADIUS.xs, marginTop: 2, maxHeight: 200, overflowY: "auto", boxShadow: SHADOW.md }}>
          {filtered.map(s => (
            <button key={s} onMouseDown={() => add(s)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: `1px solid ${p.lineSoft}`, color: p.text, fontSize: 12, fontFamily: SANS, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = p.card}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FilterPanel ───────────────────────────────────────────────────
function FilterPanel({ subjects, selectedSubjects, setSelectedSubjects, sortMode, setSortMode, creditsFilter, setCreditsFilter, gpaOnly, setGpaOnly, darkMode, isMobile, onClear }) {
  const dm = darkMode;
  const p  = palette(dm);
  const hasActive = selectedSubjects.length > 0 || creditsFilter.length > 0 || gpaOnly;

  const S = ({ title, children }) => (
    <FilterSection title={title} accentColor={ACCENT} lineColor={p.line}>{children}</FilterSection>
  );

  const pillStyle = (active) => ({
    fontFamily: MONO, fontSize: 11, fontWeight: active ? 600 : 400,
    borderRadius: RADIUS.xs, cursor: "pointer",
    transition: "all 0.15s", border: `1px solid ${active ? "rgba(134,31,65,0.35)" : p.line}`,
    background: active ? "rgba(134,31,65,0.12)" : "transparent",
    color: active ? ACCENT : p.textSub,
  });

  return (
    <div style={{ fontFamily: SANS, ...(isMobile ? {} : { position: "sticky", top: 80, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }), paddingRight: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, letterSpacing: "1.5px", textTransform: "uppercase" }}>Filters</span>
        {hasActive && (
          <button onClick={onClear} style={{ background: "none", border: "none", color: p.textFaint, fontSize: 11, fontFamily: MONO, fontWeight: 600, cursor: "pointer", padding: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = ACCENT}
            onMouseLeave={e => e.currentTarget.style.color = p.textFaint}
          >Clear all</button>
        )}
      </div>

      <S title="Subject">
        <SubjectSearch subjects={subjects} selected={selectedSubjects} onChange={setSelectedSubjects} darkMode={dm} />
      </S>

      <S title="Sort by">
        <select value={sortMode} onChange={e => setSortMode(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", color: p.text, fontFamily: SANS, fontSize: 12, cursor: "pointer", outline: "none" }}>
          <option value="alpha">Alphabetical (A→Z)</option>
          <option value="gpa_desc">GPA: High → Low</option>
          <option value="gpa_asc">GPA: Low → High</option>
          <option value="sections_desc">Most Sections</option>
          <option value="sections_asc">Fewest Sections</option>
        </select>
      </S>

      <S title="Credits">
        <div style={{ display: "flex", gap: 6 }}>
          {["1","2","3","4+"].map(cr => {
            const active = creditsFilter.includes(cr);
            return (
              <button key={cr}
                onClick={() => setCreditsFilter(f => active ? f.filter(x => x !== cr) : [...f, cr])}
                style={{ ...pillStyle(active), flex: 1, padding: "7px 0", textAlign: "center" }}
              >{cr}</button>
            );
          })}
        </div>
      </S>

      <S title="Grade data">
        <button
          onClick={() => setGpaOnly(v => !v)}
          style={{ ...pillStyle(gpaOnly), width: "100%", textAlign: "center", padding: "7px 12px" }}
        >Has GPA data</button>
      </S>
    </div>
  );
}

// ── Course Search Page ────────────────────────────────────────────
const PAGE_SIZE = 24;

export default function CourseSearch({ darkMode, schedule, onCourseClick, onProfClick }) {
  const [query, setQuery]               = useState("");
  const [selSubjects, setSelSubjects]   = useState([]);
  const [sortMode, setSortMode]         = useState("alpha");
  const [creditsFilter, setCreditsFilter] = useState([]);
  const [gpaOnly, setGpaOnly]           = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showFilters, setShowFilters] = useState(() => window.innerWidth >= 768);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [coursePool, setCoursePool] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [instructorMap, setInstructorMap] = useState({});
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);
  const topRef = useRef(null);
  const dm = darkMode;
  const p = palette(dm);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  useEffect(() => { API.getSubjects().then(setSubjects).catch(console.error); }, []);
  useEffect(() => { API.getCourses({}).then(setCoursePool).catch(() => {}); }, []);
  useEffect(() => {
    API.getInstructors().then(list => {
      const map = {};
      list.forEach(i => {
        map[i.name] = i;
        // Also index by last name so timetable format ("KA Shinpaugh") can match
        // grades format ("Kathleen Shinpaugh") — last token is always the surname
        const lastName = i.name.trim().split(/\s+/).pop().toLowerCase();
        if (!map[`_ln_${lastName}`]) map[`_ln_${lastName}`] = i;
      });
      setInstructorMap(map);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const handler = e => { if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchSuggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const lower = query.trim().toLowerCase();
    return coursePool.filter(c => `${c.subject} ${c.number}`.toLowerCase().includes(lower) || c.title.toLowerCase().includes(lower) || c.subject.toLowerCase().startsWith(lower)).slice(0, 8);
  }, [coursePool, query]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true); setPage(1);
      API.getCourses({ q: query, subjects: selSubjects })
        .then(data => { setCourses(data); setLoading(false); })
        .catch(err => { console.error(err); setLoading(false); });
    }, 300);
  }, [query, selSubjects]);

  const filtered = useMemo(() => {
    let list = [...courses];
    if (creditsFilter.length > 0) {
      list = list.filter(c => creditsFilter.some(f =>
        f === "4+" ? c.credits >= 4 : Math.round(c.credits) === parseInt(f, 10)
      ));
    }
    if (gpaOnly) list = list.filter(c => c.avgGpa > 0);
    list.sort((a, b) => {
      const alpha = `${a.subject}${a.number}`.localeCompare(`${b.subject}${b.number}`);
      if (sortMode === "gpa_desc") {
        if (a.avgGpa > 0 && b.avgGpa > 0) return b.avgGpa - a.avgGpa;
        if (a.avgGpa > 0) return -1;
        if (b.avgGpa > 0) return 1;
        return alpha;
      }
      if (sortMode === "gpa_asc") {
        if (a.avgGpa > 0 && b.avgGpa > 0) return a.avgGpa - b.avgGpa;
        if (a.avgGpa > 0) return -1;
        if (b.avgGpa > 0) return 1;
        return alpha;
      }
      if (sortMode === "sections_desc") return (b.totalSections || 0) - (a.totalSections || 0);
      if (sortMode === "sections_asc")  return (a.totalSections || 0) - (b.totalSections || 0);
      return alpha;
    });
    return list;
  }, [courses, sortMode, creditsFilter, gpaOnly]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCourses = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = pg => { setPage(pg); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const activeFilters = selSubjects.length + creditsFilter.length + (gpaOnly ? 1 : 0);

  return (
    <div style={{ minHeight: "100vh", fontFamily: SANS }}>
      <header style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "36px 16px 24px" : "72px 64px 36px", boxSizing: "border-box", borderBottom: `1px solid ${p.line}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", color: ACCENT, textTransform: "uppercase" }}>Course Catalog</span>
        <h1 style={{ margin: "18px 0 14px", fontSize: "clamp(42px, 5.5vw, 78px)", fontWeight: 400, fontFamily: SERIF, color: p.text, letterSpacing: "-1px", lineHeight: 1.02 }}>
          Browse <em style={{ color: ACCENT, fontStyle: "italic" }}>courses.</em>
        </h1>
        <p style={{ margin: "0 0 36px", maxWidth: 520, fontFamily: SANS, fontSize: 15, color: p.textSub, lineHeight: 1.7 }}>
          {loading ? "Loading the catalog…" : `${filtered.length} courses · grade data · RMP ratings.`}
        </p>

        <div ref={searchWrapRef} style={{ position: "relative", maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", ...glassInput(dm), borderRadius: showSuggestions && searchSuggestions.length > 0 ? `${RADIUS.md}px ${RADIUS.md}px 0 0` : RADIUS.md, padding: "0 16px", transition: "border-radius 0.15s" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={query} onChange={e => { setQuery(sanitizeQuery(e.target.value)); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Search by name, number, subject, or CRN…" style={{ flex: 1, padding: "14px 12px", border: "none", background: "transparent", color: p.text, fontFamily: SANS, fontSize: 15, outline: "none", minWidth: 0 }} />
            {query && <button onClick={() => { setQuery(""); setShowSuggestions(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: p.textFaint, fontSize: 16, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>✕</button>}
          </div>
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, ...glassCard(dm), borderRadius: `0 0 ${RADIUS.md}px ${RADIUS.md}px`, border: `1px solid ${dm ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.70)"}`, borderTop: "none", overflow: "hidden" }}>
              {searchSuggestions.map((course, i) => (
                <button key={course.id} onMouseDown={() => { setQuery(`${course.subject} ${course.number}`); setShowSuggestions(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 16px", background: "transparent", border: "none", borderTop: i > 0 ? `1px solid ${p.lineSoft}` : "none", cursor: "pointer", textAlign: "left", fontFamily: SANS }}
                  onMouseEnter={e => e.currentTarget.style.background = p.card}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, minWidth: 72, flexShrink: 0 }}>{course.subject} {course.number}</span>
                  <span style={{ fontSize: 13, color: p.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course.title}</span>
                  {course.avgGpa > 0 && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: gpaColor(course.avgGpa) || p.textMute, flexShrink: 0 }}>{course.avgGpa.toFixed(2)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div ref={topRef} style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "40px 64px 96px", boxSizing: "border-box", display: "grid", gridTemplateColumns: (!isMobile && showFilters) ? "220px 1fr" : "1fr", gap: 56, alignItems: "start" }}>
        {!isMobile && showFilters && <FilterPanel subjects={subjects} selectedSubjects={selSubjects} setSelectedSubjects={setSelSubjects} sortMode={sortMode} setSortMode={setSortMode} creditsFilter={creditsFilter} setCreditsFilter={setCreditsFilter} gpaOnly={gpaOnly} setGpaOnly={setGpaOnly} darkMode={dm} isMobile={false} onClear={() => { setSelSubjects([]); setCreditsFilter([]); setGpaOnly(false); }} />}
        {isMobile && showFilters && <div style={{ marginBottom: 16 }}><FilterPanel subjects={subjects} selectedSubjects={selSubjects} setSelectedSubjects={setSelSubjects} sortMode={sortMode} setSortMode={setSortMode} creditsFilter={creditsFilter} setCreditsFilter={setCreditsFilter} gpaOnly={gpaOnly} setGpaOnly={setGpaOnly} darkMode={dm} isMobile={true} onClear={() => { setSelSubjects([]); setCreditsFilter([]); setGpaOnly(false); }} /></div>}

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 0, paddingBottom: 18, marginBottom: 24, borderBottom: `1px solid ${p.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <button onClick={() => setShowFilters(!showFilters)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontWeight: 600, fontSize: 11, letterSpacing: "1.2px", textTransform: "uppercase", color: p.textFaint, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = p.text}
                onMouseLeave={e => e.currentTarget.style.color = p.textFaint}
              >
                {showFilters ? "Hide" : "Show"} filters
                {activeFilters > 0 && <span style={{ marginLeft: 6, color: ACCENT }}>· {activeFilters}</span>}
              </button>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: p.textFaint }}>{filtered.length} results</span>
            </div>
            <select value={sortMode} onChange={e => setSortMode(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: "transparent", color: p.textSub, fontFamily: MONO, fontSize: 10, cursor: "pointer", outline: "none" }}>
              <option value="alpha">A→Z</option>
              <option value="gpa_desc">GPA ↓</option>
              <option value="gpa_asc">GPA ↑</option>
              <option value="sections_desc">Sections ↓</option>
              <option value="sections_asc">Sections ↑</option>
            </select>
          </div>

          {loading ? (
            <div style={{ padding: "120px 0", textAlign: "center", fontFamily: MONO, fontSize: 11, fontWeight: 600, color: p.textFaint, letterSpacing: "2px", textTransform: "uppercase" }}>Loading the catalog…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "120px 0", textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>No matches</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, color: p.text, marginBottom: 8 }}>Nothing fits those filters.</div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: p.textSub }}>Try loosening a constraint or clearing the search.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pageCourses.map(course => <CourseCard key={course.id} course={course} darkMode={dm} onClick={onCourseClick} onProfClick={onProfClick} instructorMap={instructorMap} />)}
              </div>
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 48, paddingTop: 24, borderTop: `1px solid ${p.line}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: p.textFaint, fontWeight: 600 }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => goToPage(page - 1)} disabled={page === 1} style={{ padding: "6px 12px", borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: "transparent", color: page === 1 ? p.textFaint : p.text, fontFamily: MONO, fontWeight: 600, fontSize: 12, cursor: page === 1 ? "default" : "pointer", opacity: page === 1 ? 0.4 : 1 }}>←</button>
                    {(() => {
                      const pages = []; const delta = 2, left = Math.max(1, page - delta), right = Math.min(totalPages, page + delta);
                      if (left > 1) { pages.push(1); if (left > 2) pages.push("…"); }
                      for (let i = left; i <= right; i++) pages.push(i);
                      if (right < totalPages) { if (right < totalPages - 1) pages.push("…"); pages.push(totalPages); }
                      return pages.map((pg, i) => pg === "…" ? (
                        <span key={`e-${i}`} style={{ padding: "6px 4px", color: p.textFaint, fontFamily: MONO, fontSize: 12 }}>…</span>
                      ) : (
                        <button key={pg} onClick={() => goToPage(pg)} style={{ width: 34, height: 34, borderRadius: RADIUS.xs, border: `1px solid ${pg === page ? ACCENT : p.line}`, background: pg === page ? ACCENT : "transparent", color: pg === page ? "white" : p.text, fontFamily: MONO, fontWeight: pg === page ? 700 : 500, fontSize: 12, cursor: pg === page ? "default" : "pointer" }}>{pg}</button>
                      ));
                    })()}
                    <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} style={{ padding: "6px 12px", borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: "transparent", color: page === totalPages ? p.textFaint : p.text, fontFamily: MONO, fontWeight: 600, fontSize: 12, cursor: page === totalPages ? "default" : "pointer", opacity: page === totalPages ? 0.4 : 1 }}>→</button>
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
