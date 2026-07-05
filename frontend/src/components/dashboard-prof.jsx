// Dashboard + Professor Profile components
import { useState, useEffect } from "react";
import { db } from "../supabase.js";
import { MOCK } from "../mock-data.js";
import { StarRating } from "./nav-auth.jsx";
import { GpaBadge, GradeGrid } from "./courses.jsx";
import { BookIcon, ClockIcon, MapPinIcon, UserIcon, CalendarIcon } from "./icons.jsx";
import { SkeletonCard, SkeletonChart, useMinimumLoading } from "./skeletons.jsx";
import { ACCENT, MONO, RADIUS, SANS, SERIF, SHADOW, palette } from "../theme.jsx";

const COURSE_COLORS = [
  { bg:"#fde8ee", border:"#861F41", text:"#861F41" },
  { bg:"#e8f0fe", border:"#1a4480", text:"#1a4480" },
  { bg:"#e8fdf0", border:"#1a7a38", text:"#1a7a38" },
  { bg:"#fef3c7", border:"#b45309", text:"#b45309" },
  { bg:"#f3e8ff", border:"#6b21a8", text:"#6b21a8" },
  { bg:"#fff1e8", border:"#c2410c", text:"#c2410c" },
  { bg:"#e8f8ff", border:"#0369a1", text:"#0369a1" },
];

// ── Stat Card ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, darkMode }) {
  const dm = darkMode;
  return (
    <div style={{
      background: dm ? "#221e27" : "white",
      border: `1.5px solid ${dm ? "#3d3050" : "#e8e4ee"}`,
      borderRadius: 16, padding: "20px 24px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: dm ? "#998ba8" : "#75787b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || (dm ? "#f0edf3" : "#1c1a1e"), lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: dm ? "#998ba8" : "#75787b", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard({ user, schedule, darkMode, onCourseClick, onProfClick, onRemove, setPage }) {
  const dm = darkMode;
  const colors = {
    bg:     dm ? "#0a0a0a" : "#f8f7f5",
    text:   dm ? "#f0edf3" : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.38)" : "#75787b",
    border: dm ? "rgba(255,255,255,0.08)" : "#e5e0ea",
    card:   dm ? "#141414" : "white",
  };

  const sections = schedule.map(id => MOCK.sections.find(s => s.id === id)).filter(Boolean);
  const courseIds = [...new Set(sections.map(s => s.courseId))];
  const totalCredits = courseIds.reduce((s, id) => {
    const c = MOCK.getCourse(id); return s + (c ? c.credits : 0);
  }, 0);
  const avgGpa = courseIds.length
    ? (courseIds.reduce((s, id) => { const c = MOCK.getCourse(id); return s + (c ? c.avgGpa : 0); }, 0) / courseIds.length).toFixed(2)
    : "—";

  const colorMap = {};
  courseIds.forEach((id, i) => colorMap[id] = i);

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #6b1833 0%, #861F41 60%, #a02850 100%)", padding: "36px 24px 32px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "#f0c050",
              color: "#861F41", fontWeight: 700, fontSize: 22,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "3px solid rgba(255,255,255,0.3)",
            }}>{user?.name?.charAt(0) || "?"}</div>
            <div>
              <h1 style={{ margin: 0, color: "white", fontWeight: 800, fontSize: 24 }}>
                Welcome back, {user?.name?.split(" ")[0]}!
              </h1>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 2 }}>
                {user?.email} · PID: {user?.pid}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard label="Enrolled Courses" value={courseIds.length} sub="Fall 2025" darkMode={dm} />
          <StatCard label="Total Credits" value={totalCredits} sub={totalCredits >= 12 ? "Full-time student" : "Part-time"} accent={totalCredits >= 12 ? "#1a7a38" : "#b45309"} darkMode={dm} />
          <StatCard label="Projected Avg GPA" value={avgGpa} sub="Based on historical data" accent={avgGpa !== "—" && parseFloat(avgGpa) >= 3.0 ? "#1a7a38" : "#b45309"} darkMode={dm} />
          <StatCard label="Term" value="Fall 2025" sub="Registration open" darkMode={dm} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "flex-start" }}>
          {/* Enrolled courses */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: colors.text }}>My Courses</h2>
              <button onClick={() => setPage("schedule")} style={{
                background: "none", border: `1.5px solid ${colors.border}`, borderRadius: 9,
                padding: "6px 14px", cursor: "pointer", color: "#861F41",
                fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>View Schedule →</button>
            </div>

            {sections.length === 0 ? (
              <div style={{
                background: colors.card, border: `1.5px solid ${colors.border}`,
                borderRadius: 16, padding: "48px 24px", textAlign: "center",
              }}>
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", color: colors.sub }}><BookIcon size={36} /></div>
                <div style={{ fontWeight: 700, fontSize: 16, color: colors.text, marginBottom: 8 }}>No courses added yet</div>
                <div style={{ color: colors.sub, fontSize: 14, marginBottom: 20 }}>Browse courses to add sections to your schedule</div>
                <button onClick={() => setPage("search")} style={{
                  background: "#861F41", color: "white", border: "none",
                  borderRadius: 10, padding: "10px 24px", cursor: "pointer",
                  fontWeight: 800, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>Browse Courses</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sections.map(sec => {
                  const course = MOCK.getCourse(sec.courseId);
                  const prof = MOCK.getProf(sec.profId);
                  const colIdx = colorMap[sec.courseId] || 0;
                  const col = COURSE_COLORS[colIdx % COURSE_COLORS.length];
                  return (
                    <div key={sec.id} style={{
                      background: colors.card, border: `1.5px solid ${colors.border}`,
                      borderRadius: 14, overflow: "hidden",
                    }}>
                      <div style={{ height: 4, background: col.border }} />
                      <div style={{ padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, background: col.bg,
                          border: `2px solid ${col.border}`, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: 11, color: col.text, textAlign: "center", lineHeight: 1.2,
                        }}>
                          {course?.subject}<br/>{course?.number}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <button onClick={() => onCourseClick(course)} style={{
                            background: "none", border: "none", padding: 0, cursor: "pointer",
                            fontWeight: 800, fontSize: 15, color: colors.text, textAlign: "left",
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                          }}>{course?.title}</button>
                          <div style={{ display: "flex", gap: 12, marginTop: 5, fontSize: 13, color: colors.sub, flexWrap: "wrap" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><ClockIcon size={13} />{sec.days.join("")} {MOCK.formatTime(sec.startTime)}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><MapPinIcon size={13} />{sec.location}</span>
                            <span style={{ fontFamily: "monospace" }}>CRN {sec.crn}</span>
                            {prof && (
                              <button onClick={() => onProfClick(prof)} style={{
                                background: "none", border: "none", padding: 0, cursor: "pointer",
                                color: "#861F41", fontWeight: 600, fontSize: 13,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                display: "flex", alignItems: "center", gap: 5,
                              }}><UserIcon size={13} color="#861F41" />{prof.name}</button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <GpaBadge gpa={course?.avgGpa || 0} />
                          <button onClick={() => onRemove(sec.id)} style={{
                            background: "#fee2e2", color: "#c0392b", border: "none",
                            borderRadius: 7, padding: "4px 10px", cursor: "pointer",
                            fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
                          }}>Drop</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: quick tips */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              background: colors.card, border: `1.5px solid ${colors.border}`,
              borderRadius: 16, padding: "20px",
            }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: colors.text }}>Credit Load Guide</h3>
              {[
                { range: "12–15 cr", label: "Full-time (typical)", color: "#1a7a38" },
                { range: "16–18 cr", label: "Heavy load", color: "#b45309" },
                { range: "< 12 cr", label: "Part-time", color: "#75787b" },
                { range: "> 18 cr", label: "Overload (needs approval)", color: "#c0392b" },
              ].map(item => (
                <div key={item.range} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: item.color }}>{item.range}</span>
                  <span style={{ color: colors.sub }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{
              background: "#fdf4f6", border: "1.5px solid #f5c0cc",
              borderRadius: 16, padding: "18px",
            }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#861F41", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><CalendarIcon size={14} color="#861F41" />Important Dates</div>
              {[
                ["Aug 25", "Fall 2025 classes begin"],
                ["Sep 8", "Last day to add/drop"],
                ["Oct 13", "Spring 2026 registration opens"],
                ["Dec 12", "Last day of classes"],
              ].map(([date, label]) => (
                <div key={date} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13 }}>
                  <span style={{ fontWeight: 800, color: "#861F41", minWidth: 50 }}>{date}</span>
                  <span style={{ color: "#5a3040" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Professor Profile ─────────────────────────────────────────────
export default function ProfessorProfile({ prof, darkMode, onCourseClick, onClose }) {
  const dm = darkMode;
  const colors = {
    bg:     dm ? "#0f0f0f" : "#ffffff",
    text:   dm ? "#f0edf3" : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.38)" : "#75787b",
    border: dm ? "rgba(255,255,255,0.08)" : "#e5e0ea",
    card:   dm ? "#141414" : "#f8f7f5",
  };

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const showLoading = useMinimumLoading(loading);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // grades.instructor was migrated to canonical names matching instructors.name exactly.
  useEffect(() => {
    if (!prof?.name) { setLoading(false); return; }
    db
      .from("grades")
      .select("subject, course_number, course_title, gpa, a_pct, a_minus_pct, b_plus_pct, b_pct, b_minus_pct, c_plus_pct, c_pct, c_minus_pct, d_plus_pct, d_pct, d_minus_pct, f_pct, graded_enrollment")
      .eq("instructor", prof.name)
      .then(({ data }) => {
        if (!data || data.length === 0) { setLoading(false); return; }
        // Group by course, compute weighted avg GPA and grade distribution
        const map = {};
        data.forEach(row => {
          const key = `${row.subject} ${row.course_number}`;
          if (!map[key]) map[key] = { subject: row.subject, number: row.course_number, title: row.course_title, rows: [] };
          map[key].rows.push(row);
        });
        const built = Object.values(map).map(c => {
          const totalEnroll = c.rows.reduce((s, r) => s + (r.graded_enrollment || 0), 0);
          const wavg = f => totalEnroll > 0
            ? c.rows.reduce((s, r) => s + (parseFloat(r[f]) || 0) * (r.graded_enrollment || 0), 0) / totalEnroll
            : 0;
          return {
            id: `${c.subject}-${c.number}`,
            subject: c.subject,
            number: c.number,
            title: c.title,
            avgGpa: Math.round(wavg("gpa") * 100) / 100,
            gradeDistribution: {
              "A": Math.round(wavg("a_pct")), "A-": Math.round(wavg("a_minus_pct")),
              "B+": Math.round(wavg("b_plus_pct")), "B": Math.round(wavg("b_pct")), "B-": Math.round(wavg("b_minus_pct")),
              "C+": Math.round(wavg("c_plus_pct")), "C": Math.round(wavg("c_pct")), "C-": Math.round(wavg("c_minus_pct")),
              "D+": Math.round(wavg("d_plus_pct")), "D": Math.round(wavg("d_pct")), "D-": Math.round(wavg("d_minus_pct")),
              "F": Math.round(wavg("f_pct")),
            },
          };
        }).sort((a, b) => b.avgGpa - a.avgGpa);
        setCourses(built);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [prof?.name]);

  // Derive department from courses or instructor row (field is "department" from getInstructors)
  const dept = courses[0]?.subject || prof?.dept || prof?.department || null;
  const deptNames = { CS: "Computer Science", MATH: "Mathematics", ECE: "Electrical & Computer Engineering", BIOL: "Biological Sciences", PHYS: "Physics", CHEM: "Chemistry", HIST: "History", PSYC: "Psychology", STAT: "Statistics", ACIS: "Accounting & Information Systems", ME: "Mechanical Engineering", AOE: "Aerospace & Ocean Engineering", CEE: "Civil & Environmental Engineering" };

  // Safe RMP values
  const rmpRating  = typeof prof?.rmpRating === "number" ? prof.rmpRating : null;
  const rmpDiff    = typeof prof?.rmpDifficulty === "number" ? prof.rmpDifficulty : null;
  const rmpCount   = prof?.rmpCount || 0;
  const tags       = prof?.rmpTags || prof?.tags || [];
  const rmpReviews = Array.isArray(prof?.rmpReviews) ? prof.rmpReviews : [];
  const rmpId      = prof?.rmpId ?? null;
  // RMP profile search URL (VT school ID = 1349)
  const rmpSearchUrl = `https://www.ratemyprofessors.com/search/professors/1349?q=${encodeURIComponent((prof?.name || "").split(" ").pop())}`;
  const p = palette(dm);
  const bestGpa = courses.length ? courses[0]?.avgGpa : null;
  const overallGpa = courses.length
    ? courses.reduce((sum, course) => sum + (course.avgGpa || 0), 0) / courses.length
    : null;
  const metricCard = (label, value, sub, tone = p.text) => (
    <div style={{
      background: p.card,
      border: `1px solid ${p.line}`,
      borderRadius: RADIUS.md,
      padding: isMobile ? "14px 16px" : "16px 18px",
      minHeight: 82,
      boxSizing: "border-box",
    }}>
      <div style={{
        fontFamily: MONO,
        fontSize: 9.5,
        color: p.textMute,
        letterSpacing: "1.2px",
        textTransform: "uppercase",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{
        color: tone,
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1,
        fontFamily: label.includes("GPA") ? MONO : SANS,
      }}>{value}</div>
      {sub && <div style={{ color: p.textSub, fontSize: 12, marginTop: 7, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.58)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: isMobile ? 0 : "40px 24px",
        overflowY: "auto",
        backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
        fontFamily: SANS,
      }}
    >
      <div style={{
        background: dm ? "#0f0f0f" : "#ffffff",
        border: `1px solid ${p.line}`,
        borderRadius: isMobile ? `${RADIUS.xl}px ${RADIUS.xl}px 0 0` : RADIUS.xl,
        boxShadow: SHADOW.xl,
        width: "100%",
        maxWidth: 1040,
        marginBottom: isMobile ? 0 : 40,
        marginTop: isMobile ? "auto" : 0,
        overflow: "hidden",
        ...(isMobile ? { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "92vh", overflowY: "auto" } : {}),
      }}>
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: p.line }} />
          </div>
        )}

        <div style={{
          padding: isMobile ? "18px 20px 16px" : "28px 32px 20px",
          borderBottom: `1px solid ${p.line}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  color: ACCENT,
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                }}>{dept || "Instructor"}</span>
                {rmpRating != null && (
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: p.textSub,
                    background: p.card,
                    borderRadius: RADIUS.pill,
                    padding: "2px 10px",
                    border: `1px solid ${p.line}`,
                  }}>{rmpCount} RMP rating{rmpCount === 1 ? "" : "s"}</span>
                )}
                {courses.length > 0 && (
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: p.textSub,
                    background: p.card,
                    borderRadius: RADIUS.pill,
                    padding: "2px 10px",
                    border: `1px solid ${p.line}`,
                  }}>{courses.length} course{courses.length === 1 ? "" : "s"} on record</span>
                )}
              </div>
              <h2 style={{
                margin: 0,
                color: p.text,
                fontFamily: SERIF,
                fontSize: isMobile ? 24 : 30,
                fontWeight: 400,
                lineHeight: 1.15,
              }}>{prof?.name}</h2>
              {dept && (
                <div style={{ color: p.textSub, fontSize: 14, marginTop: 8 }}>
                  {deptNames[dept] ? `Department of ${deptNames[dept]}` : dept}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              background: p.card,
              border: `1px solid ${p.line}`,
              borderRadius: RADIUS.xs,
              color: p.textSub,
              width: 34,
              height: 34,
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: isMobile ? "18px 20px 24px" : "24px 32px 32px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}>
            {metricCard("RMP quality", rmpRating != null ? rmpRating.toFixed(1) : "—", rmpRating != null ? "Overall rating" : "No RMP profile", ACCENT)}
            {metricCard("Difficulty", rmpDiff != null ? rmpDiff.toFixed(1) : "—", rmpDiff != null ? "Lower is easier" : "No difficulty data")}
            {metricCard("Best avg GPA", bestGpa != null ? bestGpa.toFixed(2) : "—", courses.length ? "Highest course average" : "No grade rows", "#22c55e")}
            {metricCard("Overall avg GPA", overallGpa != null ? overallGpa.toFixed(2) : "—", courses.length ? "Across taught courses" : "No grade rows")}
          </div>

          {rmpRating != null && (
            <div style={{
              background: p.card,
              border: `1px solid ${p.line}`,
              borderRadius: RADIUS.md,
              padding: isMobile ? "14px 16px" : "16px 18px",
              marginBottom: 28,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: tags.length ? 12 : 0 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, letterSpacing: "1.4px", textTransform: "uppercase", fontWeight: 600 }}>
                    RateMyProfessors summary
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <StarRating rating={rmpRating} size={14} />
                    <span style={{ color: p.textSub, fontSize: 13 }}>{rmpRating.toFixed(1)} quality · {rmpDiff != null ? `${rmpDiff.toFixed(1)} difficulty · ` : ""}{rmpCount} rating{rmpCount === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                  color: ACCENT,
                  textDecoration: "none",
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                }}>View on RMP ↗</a>
              </div>
              {tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.slice(0, 8).map(tag => (
                    <span key={tag} style={{
                      background: dm ? "rgba(255,255,255,0.06)" : "rgba(134,31,65,0.07)",
                      color: p.textSub,
                      border: `1px solid ${p.line}`,
                      borderRadius: RADIUS.pill,
                      padding: "4px 10px",
                      fontSize: 10,
                      fontFamily: MONO,
                      fontWeight: 600,
                    }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 12 }}>
            Courses taught
            {!showLoading && <span style={{ color: p.textSub, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontFamily: SANS, fontSize: 12 }}> — {courses.length} on record</span>}
          </div>
          {showLoading ? (
            <SkeletonChart darkMode={dm} height={220} />
          ) : courses.length === 0 ? (
            <div style={{ color: p.textSub, fontSize: 13, fontFamily: SANS, background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: 24 }}>
              No course data found for this instructor.
            </div>
          ) : (
            <div style={{
              border: `1px solid ${p.line}`,
              borderRadius: RADIUS.md,
              overflow: "hidden",
              marginBottom: 28,
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "84px 1fr 70px" : "120px 1fr 90px 220px",
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
                <div>Course</div>
                <div>Title</div>
                <div>GPA</div>
                {!isMobile && <div>Grades</div>}
              </div>
              {courses.map((course, idx) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onCourseClick({ subject: course.subject, number: course.number, title: course.title, avgGpa: course.avgGpa, gradeDistribution: course.gradeDistribution, id: course.id, credits: 3, description: "", pathways: [] })}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "84px 1fr 70px" : "120px 1fr 90px 220px",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: idx < courses.length - 1 ? `1px solid ${p.lineSoft}` : "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: SANS,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = p.card; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontFamily: MONO, color: ACCENT, fontSize: 12, fontWeight: 700 }}>{course.subject} {course.number}</div>
                  <div style={{ color: p.text, fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{course.title}</div>
                  <div>{course.avgGpa > 0 ? <GpaBadge gpa={course.avgGpa} darkMode={dm} /> : <span style={{ color: p.textMute }}>—</span>}</div>
                  {!isMobile && <GradeMiniBar dist={course.gradeDistribution} darkMode={dm} />}
                </button>
              ))}
            </div>
          )}

          {!showLoading && courses.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 12 }}>
                Grade distributions — strongest courses
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: rmpRating != null ? 28 : 0 }}>
                {courses.slice(0, 4).map(course => (
                  <div key={course.id} style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ color: p.text, fontWeight: 800, fontSize: 14, lineHeight: 1.35 }}>
                        <span style={{ color: ACCENT, fontFamily: MONO, fontSize: 12 }}>{course.subject} {course.number}</span>
                        <br />{course.title}
                      </div>
                      {course.avgGpa > 0 && <GpaBadge gpa={course.avgGpa} darkMode={dm} />}
                    </div>
                    <GradeGrid dist={course.gradeDistribution} darkMode={dm} />
                  </div>
                ))}
              </div>
            </>
          )}

          {rmpRating != null && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px" }}>Student reviews</div>
                <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: ACCENT, fontWeight: 700, textDecoration: "none", fontFamily: MONO }}>View on RMP ↗</a>
              </div>
              {rmpReviews.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {rmpReviews.slice(0, 4).map((review, i) => (
                    <ReviewCard key={i} review={review} darkMode={dm} colors={{ ...colors, card: p.card, border: p.line, text: p.text, sub: p.textSub }} />
                  ))}
                </div>
              ) : (
                <div style={{ background: p.card, border: `1px solid ${p.line}`, borderRadius: RADIUS.md, padding: "18px 20px", color: p.textSub, fontSize: 13 }}>
                  {rmpCount} rating{rmpCount === 1 ? "" : "s"} available on RateMyProfessors. Darvis links out instead of storing individual review text when it is unavailable locally.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

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
    <div style={{
      height: 18,
      borderRadius: 8,
      overflow: "hidden",
      background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      display: "flex",
      border: dm ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.04)",
    }}>
      {groups.map(group => (
        <div
          key={group.key}
          title={`${group.key}: ${Math.round(group.value)}%`}
          style={{
            width: `${(group.value / total) * 100}%`,
            minWidth: group.value > 0 ? 3 : 0,
            background: group.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 9,
            fontWeight: 800,
          }}
        >
          {group.value >= 12 ? `${Math.round(group.value)}%` : ""}
        </div>
      ))}
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────
function ReviewCard({ review, darkMode, colors }) {
  const dm = darkMode;
  const quality    = review.quality    ?? review.rating      ?? null;
  const difficulty = review.difficulty ?? null;
  const comment    = review.comment    ?? review.text        ?? "";
  const className  = review.class      ?? review.courseName  ?? null;
  const date       = review.date       ?? review.createdAt   ?? null;

  return (
    <div style={{
      background: colors.card, border: `1.5px solid ${colors.border}`,
      borderRadius: 14, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: comment ? 10 : 0, flexWrap: "wrap" }}>
        {quality != null && (
          <span style={{
            background: quality >= 4 ? "#dcfce7" : quality >= 3 ? "#fef3c7" : "#fee2e2",
            color: quality >= 4 ? "#1a7a38" : quality >= 3 ? "#b45309" : "#c0392b",
            fontWeight: 800, fontSize: 13, padding: "3px 10px", borderRadius: 20,
          }}>{quality.toFixed(1)} / 5</span>
        )}
        {difficulty != null && (
          <span style={{ fontSize: 13, color: colors.sub, fontWeight: 600 }}>
            Difficulty: {difficulty.toFixed(1)}
          </span>
        )}
        {className && (
          <span style={{
            background: dm ? "rgba(255,255,255,0.08)" : "#f0edf8",
            color: dm ? "rgba(255,255,255,0.65)" : "#5a3a6a",
            fontWeight: 700, fontSize: 12, padding: "3px 9px", borderRadius: 20,
          }}>{className}</span>
        )}
        {date && (
          <span style={{ fontSize: 12, color: colors.sub, marginLeft: "auto" }}>
            {new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      {comment && (
        <p style={{
          margin: 0, fontSize: 14, color: colors.text, lineHeight: 1.6,
          display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{comment}</p>
      )}
    </div>
  );
}
