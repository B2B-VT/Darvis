// Course Search, Cards, Detail, Grade Grid
import { useState, useEffect, useRef, useMemo } from "react";
import { MOCK } from "../mock-data.js";
import { API } from "../api.js";
import { StarRating } from "./nav-auth.jsx";
import {
  MONO, SERIF, SANS, ACCENT, EASE,
  palette, glassCard, glassInput, RADIUS, SHADOW,
} from "../theme.jsx";
import { Skeleton, SkeletonCourseCard, SkeletonProfessorCard, SkeletonTable, useMinimumLoading } from "./skeletons.jsx";

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
  if (!seats) return null; // async/online sections have seats=0 — nothing to show
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
  // Show canonical full name ("John Lewis") when resolved; fall back to raw Banner name
  const displayName = rmp?.name || instrName;
  const profObj = rmp
    ? { id: instrName, name: displayName, rmpRating: rmp.rmp_rating, rmpDifficulty: rmp.rmp_difficulty, rmpCount: rmp.rmp_count, rmpTags: rmp.rmp_tags ?? [], rmpReviews: rmp.rmp_reviews ?? [], rmpId: rmp.rmp_id ?? null }
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px 100px 100px 90px", gap: 12, padding: "12px 16px", alignItems: "center", borderBottom: `1px solid ${p.lineSoft}`, fontSize: 13, fontFamily: SANS }}>
      <div style={{ fontFamily: MONO, fontWeight: 600, color: ACCENT, fontSize: 11 }}>{section.crn}</div>
      <div>
        {profObj ? (
          <button onClick={() => onProfClick(profObj)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: p.text, fontWeight: 600, fontSize: 13, textDecoration: "underline", fontFamily: SANS, textAlign: "left" }}>{displayName}</button>
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: p.text }}>{displayName}</span>
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

function InstructorGradeTable({ instructors, darkMode, isMobile, onProfClick, rmpMap }) {
  const p = palette(darkMode);
  return (
    <div style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.md, overflow: "hidden", marginBottom: 28 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 76px 70px" : "1fr 100px 90px 220px",
        gap: 12,
        padding: "10px 14px",
        background: p.card,
        borderBottom: `1px solid ${p.line}`,
        fontFamily: MONO,
        fontSize: 10,
        color: p.textMute,
        textTransform: "uppercase",
        letterSpacing: "1px",
        fontWeight: 700,
      }}>
        <div>Professor</div>
        <div>Sections</div>
        <div>GPA</div>
        {!isMobile && <div>Grades</div>}
      </div>
      {instructors.map((instructor, idx) => {
        const rmp = rmpMap?.[instructor.name];
        const profObj = rmp
          ? { id: instructor.name, name: rmp.name || instructor.name, rmpRating: rmp.rmp_rating, rmpDifficulty: rmp.rmp_difficulty, rmpCount: rmp.rmp_count, rmpTags: rmp.rmp_tags ?? [], rmpReviews: rmp.rmp_reviews ?? [], rmpId: rmp.rmp_id ?? null }
          : { id: instructor.name, name: instructor.name };
        return (
          <button
            key={instructor.id}
            type="button"
            onClick={() => onProfClick?.(profObj)}
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 76px 70px" : "1fr 100px 90px 220px",
              gap: 12,
              alignItems: "center",
              padding: "12px 14px",
              border: "none",
              borderBottom: idx < instructors.length - 1 ? `1px solid ${p.lineSoft}` : "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: SANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = p.card; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ color: p.text, fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{instructor.name}</div>
            <div style={{ color: p.textSub, fontFamily: MONO, fontSize: 11 }}>{instructor.sections}</div>
            <div>{instructor.avgGpa > 0 ? <GpaBadge gpa={instructor.avgGpa} darkMode={darkMode} /> : <span style={{ color: p.textMute }}>—</span>}</div>
            {!isMobile && <GradeMiniBar dist={instructor.gradeDistribution} darkMode={darkMode} />}
          </button>
        );
      })}
    </div>
  );
}

function GradeAnalyticsSection({ instructors, selectedId, onSelect, darkMode, isMobile }) {
  const dm = darkMode;
  const p = palette(dm);
  const [activeBand, setActiveBand] = useState("A");
  const selectedInstructor = selectedId === "all"
    ? null
    : instructors.find(instructor => instructor.id === selectedId) || null;
  const dist = selectedInstructor
    ? normalizeGradeDistribution(selectedInstructor.gradeDistribution)
    : buildAggregateDistribution(instructors);
  const groups = gradeGroups(dist);
  const strongest = groups.reduce((best, group) => group.value > best.value ? group : best, groups[0]);
  const activeGroup = groups.find(group => group.key === activeBand) || strongest || groups[0];
  const scopeLabel = selectedInstructor ? selectedInstructor.name : "all professors on record";

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px" }}>
          Grade analytics
        </div>
        {strongest && (
          <div style={{ color: strongest.color, fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase" }}>
            Peak {strongest.label} · {Math.round(strongest.value)}%
          </div>
        )}
      </div>

      <div style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: isMobile ? 14 : 16 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${p.lineSoft || p.line}` }}>
          <GradeScopeChip active={selectedId === "all"} label="All professors" onClick={() => onSelect("all")} darkMode={dm} />
          {instructors.slice(0, 10).map(instructor => (
            <GradeScopeChip key={instructor.id} active={selectedId === instructor.id} label={instructor.name} onClick={() => onSelect(instructor.id)} darkMode={dm} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 260px", gap: 12, marginBottom: 14 }}>
          <div style={{ border: `1px solid ${activeGroup.color}`, background: `linear-gradient(135deg, ${activeGroup.colorSoft}, ${dm ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.5)"})`, borderRadius: RADIUS.sm, padding: "12px 14px" }}>
            <div style={{ color: activeGroup.color, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>
              Selected band · {activeGroup.label}
            </div>
            <div style={{ color: p.text, fontSize: 14, fontWeight: 800, lineHeight: 1.4 }}>
              About {Math.round(activeGroup.value)}% of outcomes for {scopeLabel} land in the {activeGroup.label} range.
            </div>
            <div style={{ color: p.textSub, fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
              {gradeBandInsight(activeGroup)}
            </div>
          </div>
          <div style={{ border: `1px solid ${p.lineSoft || p.line}`, borderRadius: RADIUS.sm, padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
              Tip
            </div>
            <div style={{ color: p.textSub, fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
              Switch professors above, then click a grade band in any chart to compare where outcomes concentrate.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.9fr 0.9fr", gap: 14, alignItems: "stretch" }}>
          <HistogramChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
          <RadarChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
          <PieChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
        </div>
      </div>
    </div>
  );
}

function ProfessorRecommendation({ instructors, darkMode, isMobile, onProfClick, rmpMap }) {
  const p = palette(darkMode);
  const recommendation = buildProfessorRecommendation(instructors);

  if (!recommendation) {
    return (
      <div style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: isMobile ? 16 : 18, marginBottom: 28 }}>
        <div style={{ fontFamily: MONO, fontSize: isMobile ? 12 : 13, fontWeight: 900, color: ACCENT, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 8 }}>
          AI recommendation
        </div>
        <div style={{ color: p.textSub, fontSize: 13, lineHeight: 1.6 }}>
          Not enough grade data to recommend a professor for this scope.
        </div>
      </div>
    );
  }

  const { professor, runnerUp, reason, confidence } = recommendation;
  const rmp = rmpMap?.[professor.name];
  const profObj = rmp
    ? { id: professor.name, name: rmp.name || professor.name, rmpRating: rmp.rmp_rating, rmpDifficulty: rmp.rmp_difficulty, rmpCount: rmp.rmp_count, rmpTags: rmp.rmp_tags ?? [], rmpReviews: rmp.rmp_reviews ?? [], rmpId: rmp.rmp_id ?? null }
    : { id: professor.name, name: professor.name };
  const dist = normalizeGradeDistribution(professor.gradeDistribution);
  const risk = Math.round(dist.F || 0);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${confidence.panelBg}, ${darkMode ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.75)"})`,
      border: `1px solid ${confidence.panelBorder}`,
      borderRadius: RADIUS.md,
      padding: isMobile ? 16 : 18,
      marginBottom: 28,
      boxShadow: darkMode ? "0 18px 50px rgba(0,0,0,0.18)" : `0 14px 34px ${confidence.shadow}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 12 : 13, fontWeight: 900, color: ACCENT, letterSpacing: "1.4px", textTransform: "uppercase" }}>
            AI recommendation
          </div>
        </div>
        <span style={{ color: confidence.color, background: confidence.bg, border: `1px solid ${confidence.border}`, borderRadius: RADIUS.pill, padding: "5px 10px", fontFamily: MONO, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.8px" }}>
          {confidence.label} confidence
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.35fr) minmax(260px, 0.65fr)", gap: 14, alignItems: "stretch" }}>
        <div style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.sm, background: darkMode ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.6)", padding: "15px 16px" }}>
          <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 7 }}>
            Best fit from grade data
          </div>
          <button
            type="button"
            onClick={() => onProfClick?.(profObj)}
            style={{ padding: 0, border: "none", background: "transparent", color: p.text, fontSize: isMobile ? 22 : 26, fontWeight: 900, lineHeight: 1.1, cursor: "pointer", textAlign: "left", fontFamily: SANS }}
          >
            {professor.name}
          </button>
          <p style={{ margin: "10px 0 0", color: p.textSub, fontSize: 13, lineHeight: 1.65 }}>
            {reason}
          </p>
          {runnerUp && (
            <div style={{ marginTop: 10, color: p.textMute, fontSize: 12, lineHeight: 1.5 }}>
              Closest alternative: <span style={{ color: p.textSub, fontWeight: 800 }}>{runnerUp.name}</span> with {runnerUp.avgGpa.toFixed(2)} avg GPA.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <RecommendationStat label="Avg GPA" value={professor.avgGpa.toFixed(2)} tone={gpaColor(professor.avgGpa) || "#22c55e"} darkMode={darkMode} />
          <RecommendationStat label="A/B share" value={`${Math.round((dist.A || 0) + (dist.B || 0))}%`} tone="#22c55e" darkMode={darkMode} />
          <RecommendationStat label="F risk" value={`${risk}%`} tone={risk <= 5 ? "#22c55e" : risk <= 12 ? "#f59e0b" : "#ef4444"} darkMode={darkMode} />
          <RecommendationStat label="Records" value={String(professor.sections)} tone={p.text} darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}

function RecommendationStat({ label, value, tone, darkMode }) {
  const p = palette(darkMode);
  return (
    <div style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.sm, background: darkMode ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.56)", padding: "11px 12px" }}>
      <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 7, fontWeight: 800 }}>{label}</div>
      <div style={{ color: tone, fontFamily: MONO, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function CourseEchoSection({ course, instructors, reviews, stats, loading, error, showForm, setShowForm, onSubmit, isSignedIn, onRequireSignIn, darkMode, isMobile }) {
  const p = palette(darkMode);
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px" }}>Echo</div>
          <div style={{ color: p.textSub, fontSize: 12, marginTop: 4 }}>Darvis-native student feedback for this course.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isSignedIn) onRequireSignIn?.();
            else setShowForm(v => !v);
          }}
          style={{
            background: showForm ? "rgba(255,255,255,0.06)" : ACCENT,
            color: showForm ? p.text : "white",
            border: `1px solid ${showForm ? p.line : "rgba(134,31,65,0.9)"}`,
            borderRadius: RADIUS.pill,
            padding: "8px 14px",
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {showForm ? "Close" : "Add Echo"}
        </button>
      </div>

      {showForm && (
        <CourseEchoForm
          course={course}
          instructors={instructors}
          darkMode={darkMode}
          isMobile={isMobile}
          onCancel={() => setShowForm(false)}
          onSubmit={onSubmit}
        />
      )}

      <div style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: isMobile ? 14 : 16 }}>
        {loading ? (
          <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            {Array.from({ length: isMobile ? 1 : 3 }).map((_, i) => <Skeleton key={i} darkMode={darkMode} height={140} radius={RADIUS.sm} />)}
          </div>
        ) : reviews.length > 0 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
              <EchoStat label="Course quality" value={stats.quality} suffix="/5" darkMode={darkMode} />
              <EchoStat label="Difficulty" value={stats.difficulty} suffix="/5" darkMode={darkMode} />
              <EchoStat label="Would retake" value={stats.takeAgainPct} suffix="%" darkMode={darkMode} />
              <EchoStat label="Entries" value={reviews.length} darkMode={darkMode} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {reviews.slice(0, 3).map(review => <EchoCard key={review.id} review={review} darkMode={darkMode} />)}
            </div>
          </>
        ) : (
          <div style={{ color: p.textSub, fontSize: 13, lineHeight: 1.6 }}>
            {error || `No Echo yet. Be the first to leave Darvis-native feedback for ${course.subject} ${course.number}.`}
          </div>
        )}
      </div>
      <div style={{ color: p.textMute, fontSize: 12, lineHeight: 1.55, marginTop: 10, padding: "0 2px" }}>
        Echo is student-submitted and subjective. Focus on course experience, workload, structure, and planning tradeoffs.
      </div>
    </div>
  );
}

const ECHO_TAGS = [
  "Clear structure", "Heavy workload", "Project-based", "Test heavy", "Reading heavy",
  "Useful assignments", "Group projects", "Attendance matters", "Fair grading",
  "Fast paced", "Good for major", "Good elective", "Needs prep", "Online friendly",
];

const ECHO_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "P/F", "Prefer not to say"];

function CourseEchoForm({ course, instructors, darkMode, isMobile, onCancel, onSubmit }) {
  const p = palette(darkMode);
  const [form, setForm] = useState({
    professorName: "",
    qualityRating: 4,
    difficultyRating: 3,
    wouldTakeAgain: null,
    forCredit: true,
    usedTextbook: null,
    attendanceMandatory: null,
    gradeReceived: "",
    tags: [],
    reviewText: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = form.qualityRating && form.difficultyRating && form.reviewText.trim().length >= 20;
  const toggleTag = tag => {
    setForm(prev => {
      const has = prev.tags.includes(tag);
      if (has) return { ...prev, tags: prev.tags.filter(t => t !== tag) };
      if (prev.tags.length >= 3) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
  };
  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(form);
    } catch {
      setError("Echo could not save. Try again in a moment.");
      setSaving(false);
    }
  };

  return (
    <div style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: isMobile ? 16 : 18, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ color: p.text, fontWeight: 900, fontSize: 15 }}>Add Echo</div>
          <div style={{ color: p.textSub, fontSize: 12, marginTop: 4 }}>Help students understand {course.subject} {course.number} workload, pacing, and expectations.</div>
        </div>
        <button type="button" onClick={onCancel} style={{ background: "transparent", border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, color: p.textSub, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={echoLabelStyle(p)}>Professor context</span>
          <select value={form.professorName} onChange={e => setForm(prev => ({ ...prev, professorName: e.target.value }))} style={echoInputStyle(p)}>
            <option value="">General course feedback</option>
            {instructors.map(instructor => <option key={instructor.id} value={instructor.name}>{instructor.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={echoLabelStyle(p)}>Grade received</span>
          <select value={form.gradeReceived} onChange={e => setForm(prev => ({ ...prev, gradeReceived: e.target.value }))} style={echoInputStyle(p)}>
            <option value="">Optional</option>
            {ECHO_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginTop: 14 }}>
        <EchoRatingScale label="Course quality" low="Poor" high="Excellent" value={form.qualityRating} onChange={value => setForm(prev => ({ ...prev, qualityRating: value }))} darkMode={darkMode} />
        <EchoRatingScale label="Difficulty" low="Very easy" high="Very difficult" value={form.difficultyRating} onChange={value => setForm(prev => ({ ...prev, difficultyRating: value }))} darkMode={darkMode} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
        <EchoYesNo label="Would retake?" value={form.wouldTakeAgain} onChange={value => setForm(prev => ({ ...prev, wouldTakeAgain: value }))} darkMode={darkMode} />
        <EchoYesNo label="For credit?" value={form.forCredit} onChange={value => setForm(prev => ({ ...prev, forCredit: value }))} darkMode={darkMode} />
        <EchoYesNo label="Textbook used?" value={form.usedTextbook} onChange={value => setForm(prev => ({ ...prev, usedTextbook: value }))} darkMode={darkMode} />
        <EchoYesNo label="Attendance mandatory?" value={form.attendanceMandatory} onChange={value => setForm(prev => ({ ...prev, attendanceMandatory: value }))} darkMode={darkMode} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={echoLabelStyle(p)}>Select up to 3 tags</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
          {ECHO_TAGS.map(tag => {
            const active = form.tags.includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleTag(tag)} style={{
                background: active ? "rgba(134,31,65,0.22)" : "rgba(255,255,255,0.045)",
                border: `1px solid ${active ? "rgba(134,31,65,0.75)" : p.line}`,
                color: active ? ACCENT : p.textSub,
                borderRadius: RADIUS.pill,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}>{tag}</button>
            );
          })}
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16 }}>
        <span style={echoLabelStyle(p)}>Write feedback</span>
        <textarea
          value={form.reviewText}
          onChange={e => setForm(prev => ({ ...prev, reviewText: e.target.value.slice(0, 700) }))}
          placeholder="What should other students know about this course?"
          style={{ ...echoInputStyle(p), minHeight: 130, resize: "vertical", lineHeight: 1.55 }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 8 }}>
        <div style={{ color: error ? "#f87171" : p.textMute, fontSize: 11, lineHeight: 1.5 }}>
          {error || "Guideline: focus on academic experience, not personal attacks or private information."}
        </div>
        <div style={{ color: form.reviewText.length < 20 ? "#f59e0b" : p.textMute, fontFamily: MONO, fontSize: 11 }}>{form.reviewText.length}/700</div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" disabled={!canSubmit || saving} onClick={submit} style={{
          background: canSubmit && !saving ? ACCENT : "rgba(255,255,255,0.08)",
          color: canSubmit && !saving ? "white" : p.textMute,
          border: "none",
          borderRadius: RADIUS.pill,
          padding: "10px 16px",
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          cursor: canSubmit && !saving ? "pointer" : "not-allowed",
        }}>{saving ? "Saving" : "Publish Echo"}</button>
      </div>
    </div>
  );
}

function EchoRatingScale({ label, low, high, value, onChange, darkMode }) {
  const p = palette(darkMode);
  return (
    <div>
      <div style={echoLabelStyle(p)}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 3, marginTop: 9 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} style={{
            height: 34,
            border: `1px solid ${n <= value ? "rgba(134,31,65,0.8)" : p.line}`,
            background: n <= value ? "rgba(134,31,65,0.32)" : "rgba(255,255,255,0.045)",
            color: n <= value ? "#fff" : p.textSub,
            fontFamily: MONO,
            fontWeight: 900,
            cursor: "pointer",
            borderRadius: n === 1 ? "16px 5px 5px 16px" : n === 5 ? "5px 16px 16px 5px" : 5,
          }}>{n}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: p.textMute, fontSize: 11, marginTop: 6 }}>
        <span>1 · {low}</span><span>5 · {high}</span>
      </div>
    </div>
  );
}

function EchoYesNo({ label, value, onChange, darkMode }) {
  const p = palette(darkMode);
  return (
    <div>
      <div style={echoLabelStyle(p)}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        {[["Yes", true], ["No", false]].map(([labelText, bool]) => {
          const active = value === bool;
          return (
            <button key={labelText} type="button" onClick={() => onChange(bool)} style={{
              background: active ? "rgba(134,31,65,0.25)" : "rgba(255,255,255,0.04)",
              color: active ? ACCENT : p.textSub,
              border: `1px solid ${active ? "rgba(134,31,65,0.75)" : p.line}`,
              borderRadius: RADIUS.pill,
              padding: "7px 10px",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
            }}>{labelText}</button>
          );
        })}
      </div>
    </div>
  );
}

function EchoStat({ label, value, suffix = "", darkMode }) {
  const p = palette(darkMode);
  const display = typeof value === "number" ? (suffix === "/5" ? value.toFixed(1) : Math.round(value)) : "—";
  return (
    <div style={{ border: `1px solid ${p.lineSoft || p.line}`, borderRadius: RADIUS.sm, padding: "11px 12px", background: darkMode ? "rgba(255,255,255,0.025)" : "rgba(134,31,65,0.025)" }}>
      <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
      <div style={{ color: label.includes("quality") ? ACCENT : p.text, fontFamily: MONO, fontSize: 18, fontWeight: 900 }}>{display}{display !== "—" ? suffix : ""}</div>
    </div>
  );
}

function EchoCard({ review, darkMode }) {
  const p = palette(darkMode);
  return (
    <div style={{ border: `1px solid ${p.lineSoft || p.line}`, borderRadius: RADIUS.sm, padding: "14px 15px", background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(134,31,65,0.025)", minHeight: 160 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
        <div>
          <div style={{ color: p.text, fontWeight: 900, fontSize: 13 }}>{review.displayName}</div>
          <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 10, marginTop: 3 }}>{formatEchoDate(review.createdAt)}</div>
        </div>
        <div style={{ color: ACCENT, fontFamily: MONO, fontSize: 12, fontWeight: 900 }}>{review.qualityRating?.toFixed?.(1) || "—"}/5</div>
      </div>
      {(review.professorName || review.gradeReceived) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
          {review.professorName && <EchoMiniChip>{review.professorName}</EchoMiniChip>}
          {review.gradeReceived && <EchoMiniChip>Grade {review.gradeReceived}</EchoMiniChip>}
          {review.wouldTakeAgain != null && <EchoMiniChip>{review.wouldTakeAgain ? "Would retake" : "Would not retake"}</EchoMiniChip>}
        </div>
      )}
      <p style={{ color: p.textSub, fontSize: 13, lineHeight: 1.55, margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{review.reviewText}</p>
      {review.tags?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {review.tags.slice(0, 3).map(tag => <EchoMiniChip key={tag}>{tag}</EchoMiniChip>)}
        </div>
      )}
    </div>
  );
}

function EchoMiniChip({ children }) {
  return <span style={{ color: ACCENT, background: "rgba(134,31,65,0.14)", border: "1px solid rgba(134,31,65,0.34)", borderRadius: RADIUS.pill, padding: "3px 7px", fontFamily: MONO, fontSize: 9.5, fontWeight: 800 }}>{children}</span>;
}

function echoLabelStyle(p) {
  return { color: p.textMute, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" };
}

function echoInputStyle(p) {
  return {
    background: "rgba(255,255,255,0.045)",
    border: `1px solid ${p.line}`,
    borderRadius: RADIUS.sm,
    color: p.text,
    padding: "11px 12px",
    fontFamily: SANS,
    fontSize: 13,
    outline: "none",
  };
}

function buildEchoStats(reviews) {
  const avg = key => reviews.length ? reviews.reduce((sum, review) => sum + (review[key] || 0), 0) / reviews.length : null;
  const answeredRetake = reviews.filter(review => review.wouldTakeAgain != null);
  return {
    quality: avg("qualityRating"),
    difficulty: avg("difficultyRating"),
    takeAgainPct: answeredRetake.length ? (answeredRetake.filter(review => review.wouldTakeAgain).length / answeredRetake.length) * 100 : null,
  };
}

function formatEchoDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return ""; }
}

function GradeScopeChip({ active, label, onClick, darkMode }) {
  const p = palette(darkMode);
  return (
    <button type="button" onClick={onClick} style={{
      border: `1px solid ${active ? "rgba(134,31,65,0.75)" : p.line}`,
      background: active ? "rgba(134,31,65,0.22)" : "transparent",
      color: active ? ACCENT : p.textSub,
      borderRadius: RADIUS.pill,
      padding: "6px 11px",
      fontFamily: MONO,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.6px",
      whiteSpace: "nowrap",
      cursor: "pointer",
    }}>{label}</button>
  );
}

function ChartShell({ title, subtitle, children, darkMode }) {
  const p = palette(darkMode);
  return (
    <div style={{ minHeight: 230, background: darkMode ? "rgba(255,255,255,0.025)" : "rgba(134,31,65,0.025)", border: `1px solid ${p.lineSoft || p.line}`, borderRadius: RADIUS.sm, padding: 14, display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: p.text, fontWeight: 800, fontSize: 13 }}>{title}</div>
        <div style={{ color: p.textMute, fontSize: 11, marginTop: 3 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function HistogramChart({ groups, activeBand, onBandSelect, darkMode }) {
  const p = palette(darkMode);
  const max = Math.max(...groups.map(group => group.value), 1);
  return (
    <ChartShell title="Histogram" subtitle="Click a bar to inspect that band" darkMode={darkMode}>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 10, minHeight: 154 }}>
        {groups.map(group => {
          const active = activeBand === group.key;
          return (
            <button key={group.key} type="button" onClick={() => onBandSelect(group.key)} title={`${group.label}: ${Math.round(group.value)}%`} style={{ flex: 1, minWidth: 42, height: "100%", border: "none", background: "transparent", padding: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 8, cursor: "pointer", opacity: active || !activeBand ? 1 : 0.62 }}>
              <div style={{ width: "100%", height: `${Math.max(10, (group.value / max) * 132)}px`, borderRadius: "10px 10px 4px 4px", background: `linear-gradient(180deg, ${group.color}, ${group.colorSoft})`, boxShadow: active ? `0 0 0 2px ${group.color}, 0 16px 34px ${group.shadow}` : `0 12px 30px ${group.shadow}`, transition: "height 180ms ease, transform 180ms ease", transform: active ? "translateY(-4px)" : "translateY(0)" }} />
              <div style={{ color: p.textSub, fontFamily: MONO, fontSize: 10, fontWeight: 800 }}>{group.label}</div>
              <div style={{ color: group.color, fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>{Math.round(group.value)}%</div>
            </button>
          );
        })}
      </div>
    </ChartShell>
  );
}

function RadarChart({ groups, activeBand, onBandSelect, darkMode }) {
  const p = palette(darkMode);
  const center = 72;
  const maxRadius = 58;
  const points = groups.map((group, index) => {
    const angle = (-90 + index * (360 / groups.length)) * Math.PI / 180;
    const radius = Math.max(8, (Math.min(group.value, 100) / 100) * maxRadius);
    return {
      ...group,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      lx: center + Math.cos(angle) * (maxRadius + 16),
      ly: center + Math.sin(angle) * (maxRadius + 16),
    };
  });
  const polygon = points.map(point => `${point.x},${point.y}`).join(" ");

  return (
    <ChartShell title="Radar" subtitle="Click a point to focus the chart" darkMode={darkMode}>
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <svg width="180" height="170" viewBox="0 0 144 144" role="img" aria-label="Radar chart of grade distribution">
          {[20, 40, 60].map(radius => <circle key={radius} cx={center} cy={center} r={radius} fill="none" stroke={p.lineSoft || p.line} strokeWidth="1" />)}
          {points.map(point => <line key={point.key} x1={center} y1={center} x2={point.lx} y2={point.ly} stroke={p.lineSoft || p.line} strokeWidth="1" />)}
          <polygon points={polygon} fill="rgba(134,31,65,0.26)" stroke={ACCENT} strokeWidth="2" />
          {points.map(point => (
            <g key={point.key} onClick={() => onBandSelect(point.key)} style={{ cursor: "pointer", opacity: activeBand === point.key ? 1 : 0.68 }}>
              <circle cx={point.x} cy={point.y} r={activeBand === point.key ? "5.2" : "3.4"} fill={point.color} stroke={activeBand === point.key ? "white" : "none"} strokeWidth="1.5" />
              <text x={point.lx} y={point.ly + 3} fill={activeBand === point.key ? point.color : p.textSub} fontSize="8" fontFamily={MONO} fontWeight={activeBand === point.key ? "800" : "500"} textAnchor="middle">{point.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </ChartShell>
  );
}

function PieChart({ groups, activeBand, onBandSelect, darkMode }) {
  const p = palette(darkMode);
  const total = groups.reduce((sum, group) => sum + group.value, 0) || 1;
  let cursor = 0;
  const gradientStops = groups.map(group => {
    const start = cursor;
    cursor += (group.value / total) * 100;
    return `${group.color} ${start}% ${cursor}%`;
  }).join(", ");

  return (
    <ChartShell title="Pie" subtitle="Use the legend to compare shares" darkMode={darkMode}>
      <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr auto", gap: 12, placeItems: "center" }}>
        <div style={{ width: 132, height: 132, borderRadius: "50%", background: `conic-gradient(${gradientStops})`, boxShadow: "inset 0 0 0 18px rgba(0,0,0,0.18), 0 18px 40px rgba(0,0,0,0.2)", border: `1px solid ${p.line}`, display: "grid", placeItems: "center" }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", background: p.card, border: `1px solid ${p.line}`, display: "grid", placeItems: "center", color: p.text, fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>
            {activeBand}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
          {groups.map(group => (
            <button key={group.key} type="button" onClick={() => onBandSelect(group.key)} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: activeBand === group.key ? group.color : p.textSub, fontSize: 10, fontFamily: MONO, border: `1px solid ${activeBand === group.key ? group.color : "transparent"}`, background: activeBand === group.key ? group.colorSoft : "transparent", borderRadius: RADIUS.pill, padding: "3px 6px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: group.color }} />
              {group.label} {Math.round(group.value)}%
            </button>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

function normalizeGradeDistribution(dist = {}) {
  return {
    A: (Number(dist.A) || 0) + (Number(dist["A-"]) || 0),
    B: (Number(dist["B+"]) || 0) + (Number(dist.B) || 0) + (Number(dist["B-"]) || 0),
    C: (Number(dist["C+"]) || 0) + (Number(dist.C) || 0) + (Number(dist["C-"]) || 0),
    D: (Number(dist["D+"]) || 0) + (Number(dist.D) || 0) + (Number(dist["D-"]) || 0),
    F: Number(dist.F) || 0,
  };
}

function buildAggregateDistribution(items) {
  const totals = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  if (!items.length) return totals;
  items.forEach(item => {
    const dist = normalizeGradeDistribution(item.gradeDistribution);
    Object.keys(totals).forEach(key => { totals[key] += dist[key] || 0; });
  });
  Object.keys(totals).forEach(key => { totals[key] = totals[key] / items.length; });
  return totals;
}

function gradeGroups(dist) {
  return [
    { key: "A", label: "A", value: dist.A || 0, color: "#22c55e", colorSoft: "rgba(34,197,94,0.26)", shadow: "rgba(34,197,94,0.15)" },
    { key: "B", label: "B", value: dist.B || 0, color: "#06b6d4", colorSoft: "rgba(6,182,212,0.24)", shadow: "rgba(6,182,212,0.14)" },
    { key: "C", label: "C", value: dist.C || 0, color: "#f59e0b", colorSoft: "rgba(245,158,11,0.24)", shadow: "rgba(245,158,11,0.14)" },
    { key: "D", label: "D", value: dist.D || 0, color: "#f97316", colorSoft: "rgba(249,115,22,0.24)", shadow: "rgba(249,115,22,0.14)" },
    { key: "F", label: "F", value: dist.F || 0, color: "#ef4444", colorSoft: "rgba(239,68,68,0.24)", shadow: "rgba(239,68,68,0.14)" },
  ];
}

function gradeBandInsight(group) {
  if (!group) return "Use this to compare how outcomes shift between professors.";
  if (group.key === "A") return "A larger A band usually signals stronger top-end outcomes, but compare it with B/C bands before assuming the course is easy.";
  if (group.key === "B") return "A strong B band often means outcomes are clustered around solid performance rather than extreme highs or lows.";
  if (group.key === "C") return "A larger C band can indicate a more demanding professor/course pairing or wider variation in student preparedness.";
  if (group.key === "D") return "Watch this band when balancing schedule risk; even a modest D share can matter in a packed semester.";
  if (group.key === "F") return "Use the F band as a risk signal, especially when pairing this class with other difficult courses.";
  return "Use this to compare how outcomes shift between professors.";
}

function GradeMiniBar({ dist, darkMode }) {
  const dm = darkMode;
  const groups = [
    { key: "A", color: "#16a34a", value: (dist?.A || 0) + (dist?.["A-"] || 0) },
    { key: "B", color: "#0891b2", value: (dist?.["B+"] || 0) + (dist?.B || 0) + (dist?.["B-"] || 0) },
    { key: "C", color: "#d97706", value: (dist?.["C+"] || 0) + (dist?.C || 0) + (dist?.["C-"] || 0) },
    { key: "D", color: "#ea580c", value: (dist?.["D+"] || 0) + (dist?.D || 0) + (dist?.["D-"] || 0) },
    { key: "F", color: "#dc2626", value: dist?.F || 0 },
  ].filter(group => group.value > 0);
  const total = groups.reduce((sum, group) => sum + group.value, 0) || 1;
  return (
    <div style={{ height: 18, borderRadius: 8, overflow: "hidden", background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", display: "flex", border: dm ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.04)" }}>
      {groups.map(group => (
        <div key={group.key} title={`${group.key}: ${Math.round(group.value)}%`} style={{ width: `${(group.value / total) * 100}%`, minWidth: group.value > 0 ? 3 : 0, background: group.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9, fontWeight: 800 }}>
          {group.value >= 12 ? `${Math.round(group.value)}%` : ""}
        </div>
      ))}
    </div>
  );
}

function buildInstructorGradeSummaries(sections) {
  const map = {};
  sections.forEach(section => {
    const name = section.instructor || "Unknown";
    if (!map[name]) map[name] = { id: name, name, rows: [] };
    map[name].rows.push(section);
  });
  return Object.values(map).map(item => {
    const totalEnroll = item.rows.reduce((sum, row) => sum + (Number(row.gradedEnrollment) || 0), 0);
    const weighted = getter => {
      if (!totalEnroll) return 0;
      return item.rows.reduce((sum, row) => sum + getter(row) * (Number(row.gradedEnrollment) || 0), 0) / totalEnroll;
    };
    const dist = {};
    ["A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"].forEach(grade => {
      dist[grade] = Math.round(weighted(row => Number(row.gradeDistribution?.[grade]) || 0));
    });
    return {
      id: item.id,
      name: item.name,
      sections: item.rows.length,
      enrollment: totalEnroll,
      avgGpa: Math.round(weighted(row => Number(row.gpa) || 0) * 100) / 100,
      gradeDistribution: dist,
    };
  }).sort((a, b) => (b.avgGpa || 0) - (a.avgGpa || 0));
}

function buildProfessorRecommendation(instructors) {
  const eligible = instructors.filter(instructor => instructor.avgGpa > 0 && instructor.enrollment > 0);
  if (!eligible.length) return null;

  const maxEnrollment = Math.max(...eligible.map(instructor => instructor.enrollment), 1);
  const scored = eligible.map(instructor => {
    const dist = normalizeGradeDistribution(instructor.gradeDistribution);
    const abShare = (dist.A || 0) + (dist.B || 0);
    const fRisk = dist.F || 0;
    const sampleScore = Math.min(1, Math.log10(Math.max(instructor.enrollment, 1)) / Math.log10(Math.max(maxEnrollment, 10)));
    const score =
      (instructor.avgGpa / 4) * 46 +
      (abShare / 100) * 30 +
      ((100 - fRisk) / 100) * 16 +
      sampleScore * 8;
    return { ...instructor, dist, abShare, fRisk, score };
  }).sort((a, b) => b.score - a.score);

  const professor = scored[0];
  const runnerUp = scored[1] || null;
  const scoreGap = runnerUp ? professor.score - runnerUp.score : 18;
  const confidence = scoreGap >= 10 && professor.sections >= 3
    ? { label: "High", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.32)", panelBg: "rgba(34,197,94,0.16)", panelBorder: "rgba(34,197,94,0.42)", shadow: "rgba(34,197,94,0.10)" }
    : scoreGap >= 5
      ? { label: "Moderate", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.32)", panelBg: "rgba(245,158,11,0.16)", panelBorder: "rgba(245,158,11,0.42)", shadow: "rgba(245,158,11,0.10)" }
      : { label: "Low", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.32)", panelBg: "rgba(239,68,68,0.14)", panelBorder: "rgba(239,68,68,0.36)", shadow: "rgba(239,68,68,0.08)" };

  const reasonBits = [
    `${professor.avgGpa.toFixed(2)} average GPA`,
    `${Math.round(professor.abShare)}% A/B outcomes`,
    `${Math.round(professor.fRisk)}% F risk`,
    `${professor.sections} historical record${professor.sections === 1 ? "" : "s"}`,
  ];
  const runnerText = runnerUp
    ? ` The margin over ${runnerUp.name} is ${Math.max(0, scoreGap).toFixed(1)} model points, so compare both if schedules are close.`
    : "";

  return {
    professor,
    runnerUp,
    confidence,
    reason: `${professor.name} is the strongest grade-data pick because this professor combines ${reasonBits.join(", ")}.${runnerText}`,
  };
}

function buildCourseGradeMetrics(sections, course) {
  const instructors = buildInstructorGradeSummaries(sections);
  const sourceDist = instructors.length
    ? buildAggregateDistribution(instructors)
    : normalizeGradeDistribution(course?.gradeDistribution || {});
  const groups = gradeGroups(sourceDist);
  const peak = groups.reduce((best, group) => group.value > best.value ? group : best, groups[0]);
  const best = instructors[0];
  const totalEnroll = sections.reduce((sum, row) => sum + (Number(row.gradedEnrollment) || 0), 0);
  const avg = totalEnroll
    ? sections.reduce((sum, row) => sum + (Number(row.gpa) || 0) * (Number(row.gradedEnrollment) || 0), 0) / totalEnroll
    : Number(course?.avgGpa) || 0;
  return {
    avgGpa: avg > 0 ? avg.toFixed(2) : "—",
    bestGpa: best?.avgGpa > 0 ? best.avgGpa.toFixed(2) : "—",
    bestInstructor: best?.name || "",
    sections: String(sections.length),
    peakBand: peak?.label || "—",
    peakPct: Math.round(peak?.value || 0),
    peakColor: peak?.color || ACCENT,
  };
}

// ── Course Detail Modal ───────────────────────────────────────────
// Splits prerequisite text into plain text + clickable "SUBJ NNNN" course
// references, mirroring how catalog.vt.edu links course codes inline.
function renderPrerequisiteText(text, onCourseClick, accentColor) {
  if (!text) return null;
  const regex = /\b([A-Z]{2,6})\s?(\d{4})\b/g;
  const parts = [];
  let lastIndex = 0;
  let m;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    const subject = m[1], number = m[2];
    const label = `${subject} ${number}`;
    if (onCourseClick) {
      parts.push(
        <button key={`prereq-${key++}`}
          onClick={() => onCourseClick({
            subject, number, title: label, id: `${subject}-${number}`,
            credits: 0, avgGpa: 0, gradeDistribution: {}, description: "", prerequisites: "", pathways: [],
          })}
          style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: accentColor, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
        >{label}</button>
      );
    } else {
      parts.push(label);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function CourseDetail({ course, darkMode, schedule, onAdd, onRemove, onClose, onProfClick, onCourseClick, initialTab = "description", currentUser, isSignedIn, onRequireSignIn }) {
  const dm = darkMode;
  const p = palette(dm);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [liveDescription, setLiveDescription] = useState(null);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const [tab, setTab] = useState('description');
  const [showAllInstructors, setShowAllInstructors] = useState(false);
  const [selectedGradeInstructorId, setSelectedGradeInstructorId] = useState("all");
  const [echoReviews, setEchoReviews] = useState([]);
  const [echoLoading, setEchoLoading] = useState(false);
  const [echoError, setEchoError] = useState("");
  const [showEchoForm, setShowEchoForm] = useState(false);
  const INSTR_LIMIT = 10;
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);
  const showDetailLoading = useMinimumLoading(detailLoading);
  const showSectionsLoading = useMinimumLoading(sectionsLoading);
  const showDescriptionLoading = useMinimumLoading(descriptionLoading);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    setDetailLoading(true); setDetail(null); setTab(initialTab); setShowAllInstructors(false); setSelectedGradeInstructorId("all");
    API.getCourse(course.subject, course.number)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [course.subject, course.number, initialTab]);

  useEffect(() => {
    setSectionsLoading(true); setSections([]);
    API.getSections(course.subject, course.number)
      .then(rows => { setSections(rows); setSectionsLoading(false); })
      .catch(() => setSectionsLoading(false));
  }, [course.subject, course.number]);

  useEffect(() => {
    let cancelled = false;
    const storedDescription = (course.description || detail?.description || "").trim();
    setLiveDescription(null);
    setDescriptionError("");

    if (detailLoading || storedDescription) {
      setDescriptionLoading(false);
      return () => { cancelled = true; };
    }

    setDescriptionLoading(true);
    API.getLiveCourseDescription(course.subject, course.number)
      .then(result => {
        if (!cancelled) setLiveDescription(result || { description: "" });
      })
      .catch(() => {
        if (!cancelled) setDescriptionError("Catalog description unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) setDescriptionLoading(false);
      });

    return () => { cancelled = true; };
  }, [course.subject, course.number, course.description, detail?.description, detailLoading]);

  useEffect(() => {
    let cancelled = false;
    setEchoReviews([]);
    setEchoError("");
    setShowEchoForm(false);
    setEchoLoading(true);
    API.getEchoReviews({ targetType: "course", subject: course.subject, number: course.number, limit: 12 })
      .then(reviews => { if (!cancelled) setEchoReviews(reviews); })
      .catch(() => { if (!cancelled) setEchoError("Echo is unavailable right now."); })
      .finally(() => { if (!cancelled) setEchoLoading(false); });
    return () => { cancelled = true; };
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
  const descriptionText = (course.description || detail?.description || liveDescription?.description || "").trim();
  const liveDescriptionSourceUrl = !course.description && !detail?.description ? liveDescription?.sourceUrl : "";
  const gradeSections = detail?.rawSections || [];
  const instructorGradeSummaries = useMemo(() => buildInstructorGradeSummaries(gradeSections), [gradeSections]);
  const gradeMetrics = useMemo(() => buildCourseGradeMetrics(gradeSections, course), [gradeSections, course]);
  const echoStats = buildEchoStats(echoReviews);
  useEffect(() => {
    if (selectedGradeInstructorId !== "all" && !instructorGradeSummaries.some(instructor => instructor.id === selectedGradeInstructorId)) {
      setSelectedGradeInstructorId("all");
    }
  }, [instructorGradeSummaries, selectedGradeInstructorId]);
  const displayName = currentUser?.fullName || currentUser?.primaryEmailAddress?.emailAddress?.split("@")[0] || "Darvis student";
  const handleEchoSubmit = async (form) => {
    if (!isSignedIn || !currentUser?.id) {
      onRequireSignIn?.();
      return;
    }
    const saved = await API.createEchoReview({
      ...form,
      userId: currentUser.id,
      displayName,
      targetType: "course",
      professorName: form.professorName || null,
      courseSubject: course.subject,
      courseNumber: course.number,
      courseTitle: course.title,
      status: "published",
    });
    setEchoReviews(prev => [saved, ...prev]);
    setShowEchoForm(false);
  };
  const metricCard = (label, value, sub, tone = p.text) => (
    <div style={{
      background: p.card,
      border: `1px solid ${p.line}`,
      borderRadius: RADIUS.md,
      padding: isMobile ? "14px 16px" : "16px 18px",
      minHeight: 82,
      boxSizing: "border-box",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: p.textMute, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: tone, lineHeight: 1 }}>{value}</div>
      <div style={{ color: p.textSub, fontSize: 12, marginTop: 8 }}>{sub}</div>
    </div>
  );

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
                {course.avgGpa > 0
                  ? <GpaBadge gpa={course.avgGpa} darkMode={dm} />
                  : <span style={{ fontSize: 11, fontFamily: MONO, color: p.textMute, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "2px 10px" }}>No grade data</span>
                }
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
          {[['description','Description'],['grades','Grades'],['instructors',`Instructors${profs.length ? ` (${profs.length})` : ''}`],['sections',`Sections${!showSectionsLoading && sections.length ? ` (${sections.length})` : ''}`]].map(([id, label]) => (
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
            {descriptionText ? (
              <>
                <p style={{ margin: 0, fontSize: 15, color: p.text, lineHeight: 1.75, fontFamily: SANS }}>{descriptionText}</p>
                {liveDescriptionSourceUrl && (
                  <a
                    href={liveDescriptionSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-flex", marginTop: 16, color: ACCENT, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", textDecoration: "none" }}
                  >
                    Source: Virginia Tech Catalog ↗
                  </a>
                )}
              </>
            ) : showDescriptionLoading ? (
              <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
                <Skeleton darkMode={dm} height={14} width="88%" radius={6} />
                <Skeleton darkMode={dm} height={14} width="76%" radius={6} />
                <span style={{ marginTop: 2, fontSize: 12, color: p.textMute, fontFamily: MONO, letterSpacing: "0.8px", textTransform: "uppercase" }}>Loading catalog description</span>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: p.textMute, fontStyle: "italic", fontFamily: SANS }}>{descriptionError || "Catalog description unavailable."}</p>
            )}
            {(detail?.prerequisites || course.prerequisites) && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 8 }}>Prerequisites</div>
                <p style={{ margin: 0, fontSize: 14, color: p.textSub, lineHeight: 1.6, fontFamily: SANS }}>
                  {renderPrerequisiteText(detail?.prerequisites || course.prerequisites, onCourseClick, ACCENT)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Grades */}
        {tab === 'grades' && (
          <div style={{ padding: isMobile ? "20px" : "28px 32px 34px" }}>
            {showDetailLoading ? (
              <SkeletonTable darkMode={dm} rows={7} cols={5} />
            ) : detail && detail.rawSections.length > 0 ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 28 }}>
                  {metricCard("Overall avg GPA", gradeMetrics.avgGpa, "Across all recorded sections", gpaColor(Number(gradeMetrics.avgGpa)) || p.text)}
                  {metricCard("Best professor GPA", gradeMetrics.bestGpa, gradeMetrics.bestInstructor || "Highest instructor average", "#22c55e")}
                  {metricCard("Sections", gradeMetrics.sections, "Historical records in UDC")}
                  {metricCard("Peak grade band", gradeMetrics.peakBand, `${gradeMetrics.peakPct}% of outcomes`, gradeMetrics.peakColor)}
                </div>

                <ProfessorRecommendation
                  instructors={instructorGradeSummaries}
                  darkMode={dm}
                  isMobile={isMobile}
                  onProfClick={onProfClick}
                  rmpMap={rmpMap}
                />

                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 12 }}>
                  Professors on record
                  <span style={{ color: p.textSub, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontFamily: SANS, fontSize: 12 }}> — {instructorGradeSummaries.length} on record</span>
                </div>
                <InstructorGradeTable instructors={instructorGradeSummaries} darkMode={dm} isMobile={isMobile} onProfClick={onProfClick} rmpMap={rmpMap} />

                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginTop: 28, marginBottom: 12 }}>
                  Grade distributions — strongest professors
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 28 }}>
                  {instructorGradeSummaries.slice(0, 4).map(instructor => (
                    <button key={instructor.id} type="button" onClick={() => setSelectedGradeInstructorId(instructor.id)} style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: "16px 18px", textAlign: "left", cursor: "pointer", fontFamily: SANS }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ color: p.text, fontWeight: 800, fontSize: 14, lineHeight: 1.35 }}>
                          <span style={{ color: ACCENT, fontFamily: MONO, fontSize: 12 }}>{instructor.sections} section{instructor.sections === 1 ? "" : "s"}</span>
                          <br />{instructor.name}
                        </div>
                        {instructor.avgGpa > 0 && <GpaBadge gpa={instructor.avgGpa} darkMode={dm} />}
                      </div>
                      <GradeGrid dist={instructor.gradeDistribution} darkMode={dm} />
                    </button>
                  ))}
                </div>

                <GradeAnalyticsSection
                  instructors={instructorGradeSummaries}
                  selectedId={selectedGradeInstructorId}
                  onSelect={setSelectedGradeInstructorId}
                  darkMode={dm}
                  isMobile={isMobile}
                />

                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginTop: 28, marginBottom: 12 }}>
                  Section-by-section breakdown
                  <span style={{ color: p.textSub, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontFamily: SANS, fontSize: 12 }}> — {gradeSections.length} on record</span>
                </div>
                <SectionBreakdown sections={gradeSections} darkMode={dm} />

                <CourseEchoSection
                  course={course}
                  instructors={instructorGradeSummaries}
                  reviews={echoReviews}
                  stats={echoStats}
                  loading={echoLoading}
                  error={echoError}
                  showForm={showEchoForm}
                  setShowForm={setShowEchoForm}
                  onSubmit={handleEchoSubmit}
                  isSignedIn={isSignedIn}
                  onRequireSignIn={onRequireSignIn}
                  darkMode={dm}
                  isMobile={isMobile}
                />
              </>
            ) : (
              <>
                <div style={{ color: p.textSub, fontSize: 13, fontFamily: SANS, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: 24 }}>No grade data available.</div>
                <CourseEchoSection
                  course={course}
                  instructors={[]}
                  reviews={echoReviews}
                  stats={echoStats}
                  loading={echoLoading}
                  error={echoError}
                  showForm={showEchoForm}
                  setShowForm={setShowEchoForm}
                  onSubmit={handleEchoSubmit}
                  isSignedIn={isSignedIn}
                  onRequireSignIn={onRequireSignIn}
                  darkMode={dm}
                  isMobile={isMobile}
                />
              </>
            )}
          </div>
        )}

        {/* Instructors */}
        {tab === 'instructors' && (
          <div style={{ padding: isMobile ? "12px 0 16px" : "16px 0 20px" }}>
            {showDetailLoading ? (
              <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12, padding: isMobile ? "20px" : "24px 32px" }}>
                {Array.from({ length: 4 }).map((_, i) => <SkeletonProfessorCard key={i} darkMode={dm} />)}
              </div>
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
            {showSectionsLoading ? (
              <div style={{ padding: 16 }}><SkeletonTable darkMode={dm} rows={7} cols={6} /></div>
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

// sections.instructor now stores canonical names matching instructors.name exactly.
// Plain exact-match lookup — no fallback disambiguation needed.
function lookupRmp(name, map) {
  if (!map || !name) return null;
  return map[name] ?? map[name.trim().replace(/\s+/g, " ")] ?? null;
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
        {course.credits != null && (
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: p.textSub }}>
            {course.credits} {course.credits === 1 ? "Credit" : "Credits"}
          </span>
        )}
        {gpa > 0
          ? <GpaBadge gpa={gpa} darkMode={dm} />
          : <span style={{ fontSize: 11, fontFamily: MONO, color: p.textMute, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "2px 10px" }}>No grade data</span>
        }
        <span style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          color: course.fallSections > 0 ? "#22c55e" : p.textMute,
          background: course.fallSections > 0 ? "rgba(34,197,94,0.12)" : p.card,
          border: `1px solid ${course.fallSections > 0 ? "rgba(34,197,94,0.28)" : p.line}`,
          borderRadius: RADIUS.pill,
          padding: "2px 8px",
        }}>
          {course.fallSections > 0 ? `${course.fallSections} Fall 2026` : "Not Fall 2026"}
        </span>
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
          <div aria-busy="true" style={{ display: "grid", gap: 8 }}>
            <Skeleton darkMode={dm} width="34%" height={11} />
            <Skeleton darkMode={dm} width="88%" height={30} radius={RADIUS.sm} />
          </div>
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
                const openSection = () => onClick(course, "sections");
                const baseSectionBg = dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
                const hoverSectionBg = dm ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)";
                const sectionLabel = `Open details for section ${sec.crn} of ${course.subject} ${course.number}`;

                return (
                  <div
                    key={sec.crn}
                    role="button"
                    tabIndex={0}
                    aria-label={sectionLabel}
                    title={sectionLabel}
                    onClick={openSection}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openSection();
                      }
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.18)" : "rgba(26,18,15,0.18)";
                      e.currentTarget.style.background = hoverSectionBg;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = p.line;
                      e.currentTarget.style.background = baseSectionBg;
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = ACCENT;
                      e.currentTarget.style.background = hoverSectionBg;
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = p.line;
                      e.currentTarget.style.background = baseSectionBg;
                    }}
                    style={{
                      border: `1px solid ${p.line}`,
                      borderRadius: RADIUS.md,
                      padding: "10px 14px",
                      background: baseSectionBg,
                      cursor: "pointer",
                      outline: "none",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
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
                        onClick={e => {
                          e.stopPropagation();
                          onProfClick?.(sec.rmp ?? { name: sec.instructor });
                        }}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 500, color: p.textSub, transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = ACCENT}
                        onMouseLeave={e => e.currentTarget.style.color = p.textSub}
                      >
                        {sec.rmp?.name || sec.instructor}
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
function FilterPanel({ subjects, selectedSubjects, setSelectedSubjects, sortMode, setSortMode, creditsFilter, setCreditsFilter, gpaOnly, setGpaOnly, fallOnly, setFallOnly, darkMode, isMobile, onClear }) {
  const dm = darkMode;
  const p  = palette(dm);
  const hasActive = selectedSubjects.length > 0 || creditsFilter.length > 0 || gpaOnly || fallOnly;

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
          <option value="sections_desc">Most Fall 2026 Sections</option>
          <option value="sections_asc">Fewest Fall 2026 Sections</option>
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

      <S title="Offering">
        <button
          onClick={() => setFallOnly(v => !v)}
          style={{ ...pillStyle(fallOnly), width: "100%", textAlign: "center", padding: "7px 12px" }}
        >Offered Fall 2026</button>
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
  const [fallOnly, setFallOnly]         = useState(false);
  const [pathwaysFilter, setPathwaysFilter] = useState([]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showFilters, setShowFilters] = useState(() => window.innerWidth >= 768);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [coursePool, setCoursePool] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [instructorMap, setInstructorMap] = useState({});
  const showLoading = useMinimumLoading(loading);
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
      list.forEach(i => { map[i.name] = i; });
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
    return coursePool.filter(c => `${c.subject} ${c.number}`.toLowerCase().includes(lower) || c.title.toLowerCase().includes(lower) || c.subject.toLowerCase().startsWith(lower) || (c.description || '').toLowerCase().includes(lower)).slice(0, 8);
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
    if (fallOnly) list = list.filter(c => (c.fallSections || 0) > 0);
    if (pathwaysFilter.length > 0) list = list.filter(c => pathwaysFilter.every(pw => (c.pathways || []).includes(pw)));
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
      if (sortMode === "sections_desc") return (b.fallSections || 0) - (a.fallSections || 0) || alpha;
      if (sortMode === "sections_asc")  return (a.fallSections || 0) - (b.fallSections || 0) || alpha;
      return alpha;
    });
    return list;
  }, [courses, sortMode, creditsFilter, gpaOnly, fallOnly, pathwaysFilter]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCourses = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = pg => { setPage(pg); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const activeFilters = selSubjects.length + creditsFilter.length + (gpaOnly ? 1 : 0) + (fallOnly ? 1 : 0) + pathwaysFilter.length;

  return (
    <div style={{ minHeight: "100vh", fontFamily: SANS }}>
      <header style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "36px 16px 24px" : "72px 64px 36px", boxSizing: "border-box", borderBottom: `1px solid ${p.line}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "1.8px", color: ACCENT, textTransform: "uppercase" }}>Course Catalog</span>
        <h1 style={{ margin: "18px 0 14px", fontSize: "clamp(42px, 5.5vw, 78px)", fontWeight: 400, fontFamily: SERIF, color: p.text, letterSpacing: "-1px", lineHeight: 1.02 }}>
          Browse <em style={{ color: ACCENT, fontStyle: "italic" }}>courses.</em>
        </h1>
        <p style={{ margin: "0 0 36px", maxWidth: 520, fontFamily: SANS, fontSize: 15, color: p.textSub, lineHeight: 1.7 }}>
          {showLoading ? <Skeleton darkMode={dm} width={280} height={15} /> : `${filtered.length} courses · grade data · RMP ratings.`}
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

      {/* ── Horizontal filter bar ── */}
      <div style={{ borderBottom: `1px solid ${p.line}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "14px 16px" : "16px 64px", boxSizing: "border-box" }}>
          {/* Row 1: subject search + sort + result count */}
          <div style={{ display: "flex", flexWrap: isMobile ? "nowrap" : "wrap", alignItems: "center", gap: 10, marginBottom: 10, overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
            {/* Subject multi-select — compact inline version */}
            <div style={{ position: "relative", minWidth: 180, flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
              <SubjectSearch subjects={subjects} selected={selSubjects} onChange={v => { setSelSubjects(v); setPage(1); }} darkMode={dm} />
            </div>

            {/* Sort */}
            <select value={sortMode} onChange={e => { setSortMode(e.target.value); setPage(1); }}
              style={{ padding: "7px 10px", borderRadius: RADIUS.xs, border: `1px solid ${p.line}`, background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", color: p.text, fontFamily: MONO, fontSize: 11, cursor: "pointer", outline: "none", flexShrink: 0 }}>
              <option value="alpha">A → Z</option>
              <option value="gpa_desc">GPA ↓</option>
              <option value="gpa_asc">GPA ↑</option>
              <option value="sections_desc">Fall sections ↓</option>
              <option value="sections_asc">Fall sections ↑</option>
            </select>

            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: p.textFaint, flexShrink: 0 }}>{filtered.length} results</span>
            {activeFilters > 0 && (
              <button onClick={() => { setSelSubjects([]); setCreditsFilter([]); setGpaOnly(false); setFallOnly(false); setPathwaysFilter([]); setPage(1); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontWeight: 600, fontSize: 11, color: p.textFaint, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = ACCENT}
                onMouseLeave={e => e.currentTarget.style.color = p.textFaint}
              >Clear · {activeFilters}</button>
            )}
          </div>

          {/* Row 2: credits pills + current offering + GPA toggle */}
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 6, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: isMobile ? 4 : 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: p.textFaint, textTransform: "uppercase", letterSpacing: "1px", marginRight: 4 }}>Credits</span>
            {["1","2","3","4+"].map(cr => {
              const on = creditsFilter.includes(cr);
              return (
                <button key={cr} onClick={() => { setCreditsFilter(f => on ? f.filter(x => x !== cr) : [...f, cr]); setPage(1); }}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: on ? 600 : 400, borderRadius: RADIUS.pill, cursor: "pointer", padding: "4px 12px", border: `1px solid ${on ? "rgba(134,31,65,0.40)" : p.line}`, background: on ? "rgba(134,31,65,0.12)" : "transparent", color: on ? ACCENT : p.textSub, transition: "all 0.14s" }}>
                  {cr}
                </button>
              );
            })}
            <div style={{ width: 1, height: 18, background: p.line, margin: "0 4px", flexShrink: 0 }} />
            <button onClick={() => { setGpaOnly(v => !v); setPage(1); }}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: gpaOnly ? 600 : 400, borderRadius: RADIUS.pill, cursor: "pointer", padding: "4px 12px", border: `1px solid ${gpaOnly ? "rgba(134,31,65,0.40)" : p.line}`, background: gpaOnly ? "rgba(134,31,65,0.12)" : "transparent", color: gpaOnly ? ACCENT : p.textSub, transition: "all 0.14s" }}>
              Has GPA data
            </button>
            <button onClick={() => { setFallOnly(v => !v); setPage(1); }}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: fallOnly ? 600 : 400, borderRadius: RADIUS.pill, cursor: "pointer", padding: "4px 12px", border: `1px solid ${fallOnly ? "rgba(134,31,65,0.40)" : p.line}`, background: fallOnly ? "rgba(134,31,65,0.12)" : "transparent", color: fallOnly ? ACCENT : p.textSub, transition: "all 0.14s" }}>
              Offered Fall 2026
            </button>
          </div>

          {/* Row 3: pathways pills */}
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 6, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch", marginTop: 8, paddingBottom: isMobile ? 4 : 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: p.textFaint, textTransform: "uppercase", letterSpacing: "1px", marginRight: 4, flexShrink: 0 }}>Pathways</span>
            {MOCK.pathwaysOptions.map(pw => {
              const on = pathwaysFilter.includes(pw.code);
              return (
                <button key={pw.code} title={pw.label}
                  onClick={() => { setPathwaysFilter(f => on ? f.filter(x => x !== pw.code) : [...f, pw.code]); setPage(1); }}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: on ? 600 : 400, borderRadius: RADIUS.pill, cursor: "pointer", padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? "rgba(134,31,65,0.40)" : p.line}`, background: on ? "rgba(134,31,65,0.12)" : "transparent", color: on ? ACCENT : p.textSub, transition: "all 0.14s" }}>
                  {pw.code.toUpperCase()}{pw.suspended ? " ✦" : ""}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Card grid ── */}
      <div ref={topRef} style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "36px 64px 96px", boxSizing: "border-box" }}>
        {showLoading ? (
          <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
            {Array.from({ length: isMobile ? 5 : 8 }).map((_, i) => <SkeletonCourseCard key={i} darkMode={dm} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "120px 0", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>No matches</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, color: p.text, marginBottom: 8 }}>Nothing fits those filters.</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: p.textSub }}>Try loosening a constraint or clearing the search.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
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
  );
}
