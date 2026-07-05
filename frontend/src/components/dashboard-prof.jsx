// Dashboard + Professor Profile components
import { useState, useEffect } from "react";
import { db } from "../supabase.js";
import { MOCK } from "../mock-data.js";
import { StarRating } from "./nav-auth.jsx";
import { GpaBadge, GradeGrid } from "./courses.jsx";
import { BookIcon, ClockIcon, MapPinIcon, UserIcon, CalendarIcon } from "./icons.jsx";
import { SkeletonCard, SkeletonChart, useMinimumLoading } from "./skeletons.jsx";

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

  const ratingBar = (label, val) => val == null ? null : (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: colors.sub, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>{val.toFixed(1)} / 5</span>
      </div>
      <div style={{ height: 8, background: dm ? "rgba(255,255,255,0.1)" : "#e5e0ea", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(val / 5) * 100}%`, background: "#861F41", borderRadius: 4, transition: "width 0.5s" }} />
      </div>
    </div>
  );

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: isMobile ? 0 : "32px 24px",
        overflowY: "auto",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{
        background: colors.bg,
        borderRadius: isMobile ? "20px 20px 0 0" : 20,
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        width: "100%", maxWidth: 960,
        border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        marginBottom: isMobile ? 0 : 40,
        ...(isMobile ? { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "92vh", overflowY: "auto" } : {}),
      }}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: dm ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
          </div>
        )}

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #6b1833 0%, #861F41 60%, #a02850 100%)", padding: isMobile ? "16px 20px 20px" : "28px 32px 24px", borderRadius: isMobile ? 0 : "20px 20px 0 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
              <div style={{
                width: isMobile ? 48 : 64, height: isMobile ? 48 : 64, borderRadius: "50%",
                background: "#f0c050", color: "#861F41",
                fontWeight: 700, fontSize: isMobile ? 20 : 26,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "3px solid rgba(255,255,255,0.3)", flexShrink: 0,
              }}>{(prof?.name || "?").charAt(0)}</div>
              <div>
                <h2 style={{ margin: 0, color: "white", fontWeight: 800, fontSize: isMobile ? 18 : 22 }}>{prof?.name}</h2>
                {dept && (
                  <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, marginTop: 3 }}>
                    {deptNames[dept] ? `Department of ${deptNames[dept]}` : dept}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8,
              color: "white", width: 34, height: 34, cursor: "pointer",
              fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>✕</button>
          </div>
        </div>

      <div style={{ padding: isMobile ? "16px 16px 24px" : "24px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "300px 1fr", gap: 20, alignItems: "flex-start" }}>
          {/* Left: RMP card */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: colors.card, border: `1.5px solid ${colors.border}`, borderRadius: 16, padding: "24px" }}>
              {rmpRating != null ? (
                <>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 52, fontWeight: 700, color: "#861F41", lineHeight: 1 }}>{rmpRating.toFixed(1)}</div>
                    <StarRating rating={rmpRating} size={18} />
                    <div style={{ color: colors.sub, fontSize: 13, marginTop: 6 }}>Based on {rmpCount} ratings</div>
                    <div style={{ display: "inline-block", marginTop: 8, background: "#fdf4f6", border: "1px solid #f5c0cc", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#861F41" }}>
                      RateMyProfessors
                    </div>
                  </div>
                  {ratingBar("Overall Quality", rmpRating)}
                  {ratingBar("Difficulty", rmpDiff)}
                  {tags.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: colors.sub, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Student Tags</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map(t => (
                          <span key={t} style={{ background: dm ? "rgba(255,255,255,0.08)" : "#f0edf8", color: dm ? "rgba(255,255,255,0.7)" : "#5a3a6a", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <img
                    src="/images/no-rmp-data.png"
                    alt=""
                    style={{
                      width: 42,
                      height: 42,
                      objectFit: "contain",
                      marginBottom: 8,
                      opacity: dm ? 0.92 : 0.86,
                    }}
                  />
                  <div style={{ fontWeight: 700, fontSize: 14, color: colors.text, marginBottom: 6 }}>No RMP data</div>
                  <div style={{ fontSize: 13, color: colors.sub, lineHeight: 1.5 }}>
                    This instructor doesn't have a Rate My Professors profile yet.
                  </div>
                </div>
              )}
            </div>

            {/* Grade summary card */}
            {courses.length > 0 && (
              <div style={{ background: colors.card, border: `1.5px solid ${colors.border}`, borderRadius: 16, padding: "20px" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: colors.text }}>Grade Summary</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: colors.sub }}>Courses taught</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{courses.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: colors.sub }}>Best avg GPA</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a7a38" }}>{courses[0]?.avgGpa?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: colors.sub }}>Overall avg GPA</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                      {courses.length > 0 ? (courses.reduce((s, c) => s + c.avgGpa, 0) / courses.length).toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: courses + grade distributions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: colors.text }}>Courses Taught</h2>
              {showLoading ? (
                <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                  {Array.from({ length: isMobile ? 4 : 6 }).map((_, i) => <SkeletonCard key={i} darkMode={dm} height={118} />)}
                </div>
              ) : courses.length === 0 ? (
                <div style={{ color: colors.sub, fontSize: 14 }}>No course data found for this instructor.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                  {courses.map(course => (
                    <button key={course.id} onClick={() => onCourseClick({ subject: course.subject, number: course.number, title: course.title, avgGpa: course.avgGpa, gradeDistribution: course.gradeDistribution, id: course.id, credits: 3, description: "", pathways: [] })} style={{
                      background: colors.card, border: `1.5px solid ${colors.border}`,
                      borderRadius: 14, padding: "16px", cursor: "pointer", textAlign: "left",
                      fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#861F41"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(134,31,65,0.12)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ background: "#861F41", color: "white", borderRadius: 7, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>
                          {course.subject} {course.number}
                        </span>
                        {course.avgGpa > 0 && <GpaBadge gpa={course.avgGpa} />}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>{course.title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grade distributions */}
            {showLoading ? (
              <div>
                <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: colors.text }}>Grade Distributions</h2>
                <SkeletonChart darkMode={dm} height={120} />
              </div>
            ) : courses.length > 0 && (
              <div>
                <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: colors.text }}>Grade Distributions</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {courses.slice(0, 4).map(course => (
                    <div key={course.id} style={{ background: colors.card, border: `1.5px solid ${colors.border}`, borderRadius: 14, padding: "18px 20px" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: colors.text, marginBottom: 12 }}>
                        {course.subject} {course.number}: {course.title}
                      </div>
                      <GradeGrid dist={course.gradeDistribution} darkMode={dm} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Student Reviews */}
            {rmpRating != null && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: colors.text }}>Student Reviews</h2>
                  <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 13, color: "#861F41", fontWeight: 700, textDecoration: "none",
                  }}>View on RMP ↗</a>
                </div>

                {rmpReviews.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {rmpReviews.slice(0, 6).map((review, i) => (
                      <ReviewCard key={i} review={review} darkMode={dm} colors={colors} />
                    ))}
                    {rmpReviews.length > 6 && (
                      <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                        display: "block", textAlign: "center", padding: "12px",
                        background: colors.card, border: `1.5px solid ${colors.border}`,
                        borderRadius: 12, color: "#861F41", fontWeight: 700, fontSize: 14,
                        textDecoration: "none",
                      }}>
                        View all {rmpReviews.length} reviews on RateMyProfessors ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{
                    background: colors.card, border: `1.5px solid ${colors.border}`,
                    borderRadius: 14, padding: "28px 24px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: colors.text, marginBottom: 6 }}>
                      {rmpCount} ratings on RateMyProfessors
                    </div>
                    <div style={{ fontSize: 13, color: colors.sub, marginBottom: 16, lineHeight: 1.5 }}>
                      We don't store individual reviews locally yet. Read them directly on RMP.
                    </div>
                    <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-block", background: "#861F41", color: "white",
                      borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 14,
                      textDecoration: "none",
                    }}>Read reviews on RateMyProfessors ↗</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
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
