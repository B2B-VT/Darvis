// Schedule Builder component
import { useState, useEffect } from "react";
import { API } from "../api.js";
import { ClockIcon, MapPinIcon, UserIcon, AlertTriangleIcon, CalendarIcon, GridIcon, ListIcon } from "./icons.jsx";

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const DAY_MAP = { "M":"Mon","T":"Tue","W":"Wed","R":"Thu","F":"Fri" };
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

const COURSE_COLORS = [
  { bg:"#fde8ee", border:"#861F41", text:"#861F41" },
  { bg:"#e8f0fe", border:"#1a4480", text:"#1a4480" },
  { bg:"#e8fdf0", border:"#1a7a38", text:"#1a7a38" },
  { bg:"#fef3c7", border:"#b45309", text:"#b45309" },
  { bg:"#f3e8ff", border:"#6b21a8", text:"#6b21a8" },
  { bg:"#fff1e8", border:"#c2410c", text:"#c2410c" },
  { bg:"#e8f8ff", border:"#0369a1", text:"#0369a1" },
];

function timeToMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTop(mins) {
  return ((mins - START_HOUR * 60) / TOTAL_MINS) * 100;
}

function minsToPct(mins) {
  return (mins / TOTAL_MINS) * 100;
}

// "14:30" → "2:30 PM"
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function hasConflict(sections) {
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i], b = sections[j];
      const sharedDay = a.days.some(d => b.days.includes(d));
      if (!sharedDay) continue;
      const aStart = timeToMins(a.startTime), aEnd = timeToMins(a.endTime);
      const bStart = timeToMins(b.startTime), bEnd = timeToMins(b.endTime);
      if (aStart < bEnd && bStart < aEnd) return [a.crn, b.crn];
    }
  }
  return null;
}

// Returns true for online/arranged sections that have no physical meeting time.
// Banner stores these as "----- (ARR) -----" in time fields and "ONLINE" in endTime.
function isVirtual(sec) {
  if (!sec) return false;
  const loc   = (sec.location  || '').toUpperCase();
  const start = (sec.startTime || '').toUpperCase();
  const end   = (sec.endTime   || '').toUpperCase();
  if (loc.includes('ONLINE') || loc === 'ARR') return true;
  if (start.includes('ARR') || start.includes('-----')) return true;
  if (end.includes('ONLINE') || end.includes('ARR')) return true;
  const days = sec.days || [];
  if (days.length === 0) return true;
  if (days.some(d => (d || '').toUpperCase().includes('ARR'))) return true;
  return false;
}

// ── Schedule Grid View ────────────────────────────────────────────
function ScheduleGrid({ sections, colorMap, darkMode, onRemove, courseMap, onCourseClick }) {
  const dm = darkMode;
  const colors = {
    bg:       dm ? "#111111"                    : "#ffffff",
    border:   dm ? "rgba(255,255,255,0.08)"     : "rgba(0,0,0,0.08)",
    text:     dm ? "#f0edf3"                    : "#1c1a1e",
    sub:      dm ? "rgba(255,255,255,0.38)"     : "rgba(0,0,0,0.38)",
    gridLine: dm ? "rgba(255,255,255,0.05)"     : "rgba(0,0,0,0.05)",
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  // Group blocks by day
  const blocksByDay = {};
  DAYS.forEach(d => blocksByDay[d] = []);
  sections.forEach(sec => {
    sec.days.forEach(rawDay => {
      const day = DAY_MAP[rawDay];
      if (!day) return;
      blocksByDay[day].push(sec);
    });
  });

  const gridHeight = 680;
  const hourHeight = gridHeight / (END_HOUR - START_HOUR);

  return (
    <div style={{
      background: colors.bg, borderRadius: 16, border: `1.5px solid ${colors.border}`,
      overflow: "hidden", fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(5, 1fr)", borderBottom: `1.5px solid ${colors.border}` }}>
        <div style={{ padding: "10px 8px", borderRight: `1px solid ${colors.border}` }} />
        {DAYS.map(d => (
          <div key={d} style={{
            padding: "12px 8px", textAlign: "center",
            borderRight: `1px solid ${colors.border}`,
            fontWeight: 800, fontSize: 13, color: colors.text,
          }}>{d}</div>
        ))}
      </div>

      {/* Time grid */}
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(5, 1fr)", position: "relative" }}>
        {/* Hour labels */}
        <div style={{ borderRight: `1px solid ${colors.border}` }}>
          {hours.map(h => (
            <div key={h} style={{
              height: hourHeight, display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
              paddingRight: 8, paddingTop: 2,
              borderBottom: `1px solid ${colors.gridLine}`,
              fontSize: 10, color: colors.sub, fontWeight: 600,
            }}>
              {h > 12 ? `${h-12}PM` : h === 12 ? "12PM" : `${h}AM`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map(day => (
          <div key={day} style={{ borderRight: `1px solid ${colors.border}`, position: "relative", height: gridHeight }}>
            {/* Hour lines */}
            {hours.map(h => (
              <div key={h} style={{
                position: "absolute", top: (h - START_HOUR) * hourHeight,
                left: 0, right: 0, height: 1,
                background: colors.gridLine,
              }} />
            ))}
            {/* Half-hour lines */}
            {hours.map(h => (
              <div key={`h${h}`} style={{
                position: "absolute", top: (h - START_HOUR) * hourHeight + hourHeight / 2,
                left: 0, right: 0, height: 1,
                background: colors.gridLine, opacity: 0.5,
                borderTop: `1px dashed ${colors.gridLine}`,
              }} />
            ))}
            {/* Course blocks */}
            {blocksByDay[day].map(sec => {
              if (!sec.startTime || !sec.endTime) return null;
              const startMins = timeToMins(sec.startTime) - START_HOUR * 60;
              const endMins = timeToMins(sec.endTime) - START_HOUR * 60;
              if (startMins < 0 || endMins <= startMins) return null;
              const top = (startMins / TOTAL_MINS) * gridHeight;
              const height = Math.max(((endMins - startMins) / TOTAL_MINS) * gridHeight, 24);
              const courseKey = `${sec.subject}-${sec.courseNumber}`;
              const colIdx = colorMap[courseKey] || 0;
              const col = COURSE_COLORS[colIdx % COURSE_COLORS.length];
              return (
                <div key={sec.crn + day}
                  onClick={() => onCourseClick && courseMap[`${sec.subject}-${sec.courseNumber}`] && onCourseClick(courseMap[`${sec.subject}-${sec.courseNumber}`])}
                  style={{
                    position: "absolute", left: 3, right: 3, top, height,
                    background: col.bg, border: `2px solid ${col.border}`,
                    borderRadius: 8, padding: "4px 7px", overflow: "hidden",
                    cursor: onCourseClick ? "pointer" : "default", zIndex: 2,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => { if (onCourseClick) e.currentTarget.style.opacity = "0.82"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  <div style={{ fontWeight: 800, fontSize: 11, color: col.text, lineHeight: 1.2 }}>
                    {sec.subject} {sec.courseNumber}
                  </div>
                  {height > 36 && (
                    <div style={{ fontSize: 10, color: col.text, opacity: 0.8, lineHeight: 1.2 }}>
                      {formatTime(sec.startTime)}
                    </div>
                  )}
                  {height > 52 && (
                    <div style={{ fontSize: 10, color: col.text, opacity: 0.7, lineHeight: 1.2 }}>
                      {sec.location}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Schedule List View ────────────────────────────────────────────
function ScheduleList({ sections, colorMap, darkMode, onRemove, courseMap, onCourseClick }) {
  const dm = darkMode;
  const colors = {
    bg:     dm ? "#111111"                : "#ffffff",
    border: dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text:   dm ? "#f0edf3"               : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.45)",
    meta:   dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };
  const totalCredits = sections.reduce((s, sec) => s + (parseFloat(sec.credits) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px", background: "rgba(134,31,65,0.12)",
        borderRadius: 12, border: `1.5px solid rgba(134,31,65,0.4)`,
      }}>
        <span style={{ fontWeight: 700, color: "#861F41", fontSize: 14 }}>Total Credits</span>
        <span style={{ fontWeight: 800, color: "#861F41", fontSize: 22 }}>{totalCredits} cr</span>
      </div>

      {sections.map(sec => {
        const courseKey = `${sec.subject}-${sec.courseNumber}`;
        const colIdx = colorMap[courseKey] || 0;
        const col = COURSE_COLORS[colIdx % COURSE_COLORS.length];
        const courseDetail = courseMap?.[courseKey];
        const handleCardClick = (e) => {
          // Don't open modal if the Remove button was clicked
          if (e.target.closest('button')) return;
          if (onCourseClick && courseDetail) onCourseClick(courseDetail);
        };
        return (
          <div key={sec.crn}
            onClick={handleCardClick}
            style={{
              background: colors.bg, border: `1.5px solid ${colors.border}`,
              borderRadius: 14, overflow: "hidden",
              boxShadow: dm ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
              cursor: courseDetail && onCourseClick ? "pointer" : "default",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => { if (courseDetail && onCourseClick) e.currentTarget.style.borderColor = col.border; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; }}
          >
            <div style={{ height: 5, background: col.border }} />
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: courseDetail?.title ? 4 : 6, flexWrap: "wrap" }}>
                  <span style={{ background: col.border, color: "white", borderRadius: 7, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>
                    {sec.subject} {sec.courseNumber}
                  </span>
                  <span style={{ background: colors.meta, color: colors.sub, fontWeight: 700, fontSize: 12, padding: "3px 8px", borderRadius: 7 }}>
                    {sec.credits} cr
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: colors.sub }}>CRN: {sec.crn}</span>
                </div>
                {courseDetail?.title && (
                  <div style={{ fontWeight: 700, fontSize: 14, color: colors.text, marginBottom: 8, lineHeight: 1.3 }}>
                    {courseDetail.title}
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: colors.sub, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <ClockIcon size={13} />
                    {isVirtual(sec)
                      ? <span style={{ color: "#0369a1", fontWeight: 600 }}>Meets virtually</span>
                      : <>{sec.days.map(d => DAY_MAP[d] || d).join(", ")} · {formatTime(sec.startTime)} – {formatTime(sec.endTime)}</>
                    }
                  </span>
                  {!isVirtual(sec) && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <MapPinIcon size={13} />{sec.location}
                    </span>
                  )}
                  {sec.instructor && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <UserIcon size={13} />{sec.instructor}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => onRemove(sec.crn)} style={{
                background: "rgba(192,57,43,0.18)", color: "#f87171", border: "1.5px solid rgba(248,113,113,0.2)",
                borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
                flexShrink: 0,
              }}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule Builder Page ─────────────────────────────────────────
function ScheduleBuilder({ darkMode, schedule, onAdd, onRemove, setPage, onCourseClick }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [view, setView] = useState(() => window.innerWidth < 768 ? "list" : "grid");
  const [courseMap, setCourseMap] = useState({}); // keyed by "SUBJECT-number"
  const dm = darkMode;

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Fetch course details for every unique course in the schedule so we
  // can show titles and open the detail modal when a card is clicked.
  useEffect(() => {
    const uniqueKeys = [...new Set(schedule.map(s => `${s.subject}-${s.courseNumber}`))];
    const missing = uniqueKeys.filter(k => !courseMap[k]);
    if (missing.length === 0) return;

    missing.forEach(key => {
      const [subject, ...rest] = key.split("-");
      const number = rest.join("-");
      API.getCourse(subject, number)
        .then(detail => {
          setCourseMap(prev => ({ ...prev, [key]: detail }));
        })
        .catch(() => {});
    });
  }, [schedule]);

  const colors = {
    bg:     "transparent",
    text:   dm ? "#f0edf3"               : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.45)",
    border: dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  };

  // schedule is already an array of full section objects
  const sections = schedule;
  const courseKeys = [...new Set(sections.map(s => `${s.subject}-${s.courseNumber}`))];
  const colorMap = {};
  courseKeys.forEach((key, i) => colorMap[key] = i);

  const conflict = hasConflict(sections);

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${colors.border}`, padding: isMobile ? "24px 16px 20px" : "32px 24px 28px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px",
            fontFamily: "'JetBrains Mono', monospace",
            color: "#861F41", textTransform: "uppercase", display: "block", marginBottom: 10,
          }}>Fall 2026</span>
          <h1 style={{
            margin: "0 0 6px", color: colors.text, fontWeight: 400,
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: isMobile ? 32 : 42, letterSpacing: "-0.5px", lineHeight: 1.05,
          }}>Schedule <span style={{ color: "#861F41", fontStyle: "italic" }}>builder.</span></h1>
          <p style={{ margin: 0, color: colors.sub, fontSize: 14 }}>
            Fall 2026 · {sections.length} section{sections.length !== 1 ? "s" : ""} · {courseKeys.length} course{courseKeys.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px 16px 60px" : "24px" }}>
        {/* Conflict alert */}
        {conflict && (
          <div style={{
            background: "rgba(192,57,43,0.12)", border: "1.5px solid rgba(248,113,113,0.3)", borderRadius: 12,
            padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertTriangleIcon size={20} color="#f87171" />
            <div>
              <div style={{ fontWeight: 800, color: "#f87171", fontSize: 14 }}>Schedule Conflict Detected</div>
              <div style={{ color: "rgba(248,113,113,0.8)", fontSize: 13 }}>Two or more of your sections overlap. Please remove a conflicting section.</div>
            </div>
          </div>
        )}

        {sections.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: colors.sub }}>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", color: colors.sub }}><CalendarIcon size={48} /></div>
            <div style={{
              fontWeight: 400, fontSize: 28, color: colors.text, marginBottom: 8,
              fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: "italic",
            }}>Your schedule is empty.</div>
            <div style={{ fontSize: 15, marginBottom: 24 }}>Browse courses and add sections to build your schedule</div>
            <button onClick={() => setPage("search")} style={{
              background: "#861F41", color: "white", border: "none", borderRadius: 999,
              padding: "12px 28px", fontWeight: 600, fontSize: 14.5, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 18px rgba(134,31,65,0.3)",
            }}>Browse Courses →</button>
          </div>
        ) : (
          <>
            {/* View toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[["grid", <><GridIcon size={14} /> Weekly Grid</>],["list", <><ListIcon size={14} /> List View</>]].map(([v, label]) => (
                <button key={v} onClick={() => setView(v)} style={{
                  background: view === v ? "#861F41" : colors.bg,
                  color: view === v ? "white" : colors.text,
                  border: `1.5px solid ${view === v ? "#861F41" : colors.border}`,
                  borderRadius: 9, padding: "8px 18px", cursor: "pointer",
                  fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>{label}</button>
              ))}
            </div>

            {view === "grid" ? (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <div style={{ minWidth: 600 }}>
                  <ScheduleGrid sections={sections} colorMap={colorMap} darkMode={dm} onRemove={onRemove} courseMap={courseMap} onCourseClick={onCourseClick} />
                </div>
              </div>
            ) : (
              <ScheduleList sections={sections} colorMap={colorMap} darkMode={dm} onRemove={onRemove} courseMap={courseMap} onCourseClick={onCourseClick} />
            )}
          </>
        )}

      </div>
    </div>
  );
}

export default ScheduleBuilder;
