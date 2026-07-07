// Dashboard + Professor Profile components
import { useState, useEffect } from "react";
import { db } from "../supabase.js";
import { API } from "../api.js";
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
export default function ProfessorProfile({ prof, darkMode, onCourseClick, onClose, currentUser, isSignedIn, onRequireSignIn }) {
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
  const [liveRmpReviews, setLiveRmpReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [echoReviews, setEchoReviews] = useState([]);
  const [echoLoading, setEchoLoading] = useState(false);
  const [echoError, setEchoError] = useState("");
  const [showEchoForm, setShowEchoForm] = useState(false);
  const [selectedGradeCourseId, setSelectedGradeCourseId] = useState("all");
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

  useEffect(() => {
    setSelectedGradeCourseId("all");
  }, [prof?.name]);

  // Derive department from courses or instructor row (field is "department" from getInstructors)
  const dept = courses[0]?.subject || prof?.dept || prof?.department || null;
  const deptNames = { CS: "Computer Science", MATH: "Mathematics", ECE: "Electrical & Computer Engineering", BIOL: "Biological Sciences", PHYS: "Physics", CHEM: "Chemistry", HIST: "History", PSYC: "Psychology", STAT: "Statistics", ACIS: "Accounting & Information Systems", ME: "Mechanical Engineering", AOE: "Aerospace & Ocean Engineering", CEE: "Civil & Environmental Engineering" };

  // Safe RMP values
  const rmpRating  = typeof prof?.rmpRating === "number" ? prof.rmpRating : null;
  const rmpDiff    = typeof prof?.rmpDifficulty === "number" ? prof.rmpDifficulty : null;
  const rmpCount   = prof?.rmpCount || 0;
  const tags       = prof?.rmpTags || prof?.tags || [];
  const rmpId      = prof?.rmpId ?? null;
  // RMP profile search URL (VT school ID = 1349)
  const rmpSearchUrl = `https://www.ratemyprofessors.com/search/professors/1349?q=${encodeURIComponent((prof?.name || "").split(" ").pop())}`;
  useEffect(() => {
    let cancelled = false;
    setLiveRmpReviews([]);
    setReviewsError("");
    if (!rmpId) {
      setReviewsLoading(false);
      return () => { cancelled = true; };
    }

    setReviewsLoading(true);
    API.getRmpReviews(rmpId, 12)
      .then(reviews => {
        if (cancelled) return;
        const shuffled = [...reviews].sort(() => Math.random() - 0.5).slice(0, 3);
        setLiveRmpReviews(shuffled);
      })
      .catch(() => {
        if (cancelled) return;
        setReviewsError("RateMyProfessors reviews are temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });

    return () => { cancelled = true; };
  }, [rmpId]);
  const p = palette(dm);
  useEffect(() => {
    let cancelled = false;
    setEchoReviews([]);
    setEchoError("");
    if (!prof?.name) return () => { cancelled = true; };

    setEchoLoading(true);
    API.getEchoReviews({ targetType: "professor", professorName: prof.name, limit: 12 })
      .then(reviews => { if (!cancelled) setEchoReviews(reviews); })
      .catch(() => { if (!cancelled) setEchoError("Echo is unavailable right now."); })
      .finally(() => { if (!cancelled) setEchoLoading(false); });

    return () => { cancelled = true; };
  }, [prof?.name]);

  const bestGpa = courses.length ? courses[0]?.avgGpa : null;
  const overallGpa = courses.length
    ? courses.reduce((sum, course) => sum + (course.avgGpa || 0), 0) / courses.length
    : null;
  const echoStats = buildEchoStats(echoReviews);
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
      targetType: "professor",
      professorName: prof.name,
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
              <GradeAnalyticsSection
                courses={courses}
                selectedId={selectedGradeCourseId}
                onSelect={setSelectedGradeCourseId}
                darkMode={dm}
                isMobile={isMobile}
              />
            </>
          )}

          <div style={{ marginTop: !showLoading && courses.length === 0 ? (isMobile ? 24 : 34) : 0, marginBottom: rmpRating != null ? 30 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px" }}>Echo</div>
                <div style={{ color: p.textSub, fontSize: 12, marginTop: 4 }}>Darvis-native student reviews for this instructor.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSignedIn) onRequireSignIn?.();
                  else setShowEchoForm(v => !v);
                }}
                style={{
                  background: showEchoForm ? "rgba(255,255,255,0.06)" : ACCENT,
                  color: showEchoForm ? p.text : "white",
                  border: `1px solid ${showEchoForm ? p.line : "rgba(134,31,65,0.9)"}`,
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
                {showEchoForm ? "Close" : "Add Echo"}
              </button>
            </div>

            {showEchoForm && (
              <EchoReviewForm
                courses={courses}
                darkMode={dm}
                isMobile={isMobile}
                onCancel={() => setShowEchoForm(false)}
                onSubmit={handleEchoSubmit}
              />
            )}

            <div style={{
              background: p.card,
              border: `1px solid ${p.line}`,
              borderRadius: RADIUS.md,
              padding: isMobile ? 14 : 16,
            }}>
              {echoLoading ? (
                <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  {Array.from({ length: isMobile ? 1 : 3 }).map((_, i) => <SkeletonCard key={i} darkMode={dm} height={140} />)}
                </div>
              ) : echoReviews.length > 0 ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                    <EchoStat label="Quality" value={echoStats.quality} suffix="/5" darkMode={dm} />
                    <EchoStat label="Difficulty" value={echoStats.difficulty} suffix="/5" darkMode={dm} />
                    <EchoStat label="Take again" value={echoStats.takeAgainPct} suffix="%" darkMode={dm} />
                    <EchoStat label="Reviews" value={echoReviews.length} darkMode={dm} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {echoReviews.slice(0, 3).map(review => (
                      <EchoReviewCard key={review.id} review={review} darkMode={dm} />
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: p.textSub, fontSize: 13, lineHeight: 1.6 }}>
                  {echoError || "No Echo yet. Be the first to leave Darvis-native feedback for this instructor."}
                </div>
              )}
            </div>
            <div style={{ color: p.textMute, fontSize: 12, lineHeight: 1.55, marginTop: 10, padding: "0 2px" }}>
              Echo is user-submitted and subjective. Do not include private information, harassment, or unsupported claims about a person.
            </div>
          </div>

          {rmpRating != null && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: "uppercase", letterSpacing: "1.4px" }}>External RMP reviews</div>
                <a href={rmpSearchUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: ACCENT, fontWeight: 700, textDecoration: "none", fontFamily: MONO }}>View on RMP ↗</a>
              </div>
              <div style={{
                background: p.card,
                border: `1px solid ${p.line}`,
                borderRadius: RADIUS.md,
                padding: liveRmpReviews.length > 0 ? (isMobile ? "14px" : "16px") : "18px 20px",
              }}>
                {reviewsLoading ? (
                  <div aria-busy="true" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {Array.from({ length: isMobile ? 1 : 3 }).map((_, i) => (
                      <SkeletonCard key={i} darkMode={dm} height={132} />
                    ))}
                  </div>
                ) : liveRmpReviews.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(liveRmpReviews.length, 3)}, minmax(0, 1fr))`, gap: 12 }}>
                    {liveRmpReviews.map((review, index) => (
                      <ReviewCard key={`${review?.id || review?.date || "review"}-${index}`} review={review} darkMode={dm} colors={{ ...colors, card: dm ? "rgba(255,255,255,0.035)" : "rgba(134,31,65,0.035)", border: p.lineSoft || p.line, text: p.text, sub: p.textSub }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: p.textSub, fontSize: 13, lineHeight: 1.6 }}>
                    {reviewsError || "No public RateMyProfessors review excerpts are available for this instructor yet."}
                  </div>
                )}
              </div>
              <div style={{
                color: p.textSub,
                fontSize: 12.5,
                lineHeight: 1.6,
                marginTop: 10,
                padding: "0 2px",
              }}>
                {rmpCount} rating{rmpCount === 1 ? "" : "s"} available on RateMyProfessors. Darvis fetches public review excerpts from RMP when available and links out for the full profile.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

}

function GradeAnalyticsSection({ courses, selectedId, onSelect, darkMode, isMobile }) {
  const dm = darkMode;
  const p = palette(dm);
  const [activeBand, setActiveBand] = useState("A");
  const selectedCourse = selectedId === "all"
    ? null
    : courses.find(course => course.id === selectedId) || null;
  const dist = selectedCourse
    ? normalizeGradeDistribution(selectedCourse.gradeDistribution)
    : buildAggregateDistribution(courses);
  const groups = gradeGroups(dist);
  const strongest = groups.reduce((best, group) => group.value > best.value ? group : best, groups[0]);
  const activeGroup = groups.find(group => group.key === activeBand) || strongest || groups[0];
  const scopeLabel = selectedCourse ? `${selectedCourse.subject} ${selectedCourse.number}` : "all taught courses";

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 14,
        marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 600,
            color: ACCENT,
            textTransform: "uppercase",
            letterSpacing: "1.4px",
          }}>
            Grade analytics
          </div>
        </div>
        {strongest && (
          <div style={{
            color: strongest.color,
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
          }}>
            Peak {strongest.label} · {Math.round(strongest.value)}%
          </div>
        )}
      </div>

      <div style={{
        background: p.card,
        border: `1px solid ${p.line}`,
        borderRadius: RADIUS.md,
        padding: isMobile ? 14 : 16,
      }}>
        <div style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 12,
          marginBottom: 14,
          borderBottom: `1px solid ${p.lineSoft || p.line}`,
        }}>
          <GradeScopeChip
            active={selectedId === "all"}
            label="All courses"
            onClick={() => onSelect("all")}
            darkMode={dm}
          />
          {courses.slice(0, 8).map(course => (
            <GradeScopeChip
              key={course.id}
              active={selectedId === course.id}
              label={`${course.subject} ${course.number}`}
              onClick={() => onSelect(course.id)}
              darkMode={dm}
            />
          ))}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 260px",
          gap: 12,
          marginBottom: 14,
        }}>
          <div style={{
            border: `1px solid ${activeGroup.color}`,
            background: `linear-gradient(135deg, ${activeGroup.colorSoft}, ${dm ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.5)"})`,
            borderRadius: RADIUS.sm,
            padding: "12px 14px",
          }}>
            <div style={{ color: activeGroup.color, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>
              Selected band · {activeGroup.label}
            </div>
            <div style={{ color: p.text, fontSize: 14, fontWeight: 800, lineHeight: 1.4 }}>
              About {Math.round(activeGroup.value)}% of outcomes in {scopeLabel} land in the {activeGroup.label} range.
            </div>
            <div style={{ color: p.textSub, fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
              {gradeBandInsight(activeGroup)}
            </div>
          </div>
          <div style={{
            border: `1px solid ${p.lineSoft || p.line}`,
            borderRadius: RADIUS.sm,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div style={{ color: p.textMute, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
              Tip
            </div>
            <div style={{ color: p.textSub, fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
              Switch courses above, then click a grade band in any chart to compare where outcomes concentrate.
            </div>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.9fr 0.9fr",
          gap: 14,
          alignItems: "stretch",
        }}>
          <HistogramChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
          <RadarChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
          <PieChart groups={groups} activeBand={activeBand} onBandSelect={setActiveBand} darkMode={dm} />
        </div>
      </div>
    </div>
  );
}

const ECHO_TAGS = [
  "Clear lectures", "Tough grader", "Lots of homework", "Test heavy", "Project-based",
  "Helpful feedback", "Accessible outside class", "Participation matters", "Fair exams",
  "Group projects", "Organized", "Lecture heavy", "Caring", "Fast paced", "Online savvy",
];

const ECHO_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "P/F", "Prefer not to say"];

function EchoReviewForm({ courses, darkMode, isMobile, onCancel, onSubmit }) {
  const p = palette(darkMode);
  const [form, setForm] = useState({
    courseId: courses[0]?.id || "",
    qualityRating: 4,
    difficultyRating: 3,
    wouldTakeAgain: null,
    forCredit: null,
    usedTextbook: null,
    attendanceMandatory: null,
    gradeReceived: "",
    tags: [],
    reviewText: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedCourse = courses.find(course => course.id === form.courseId);
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
      await onSubmit({
        ...form,
        courseSubject: selectedCourse?.subject || null,
        courseNumber: selectedCourse?.number || null,
        courseTitle: selectedCourse?.title || null,
      });
    } catch (err) {
      setError("Echo could not save your review. Try again in a moment.");
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: p.card,
      border: `1px solid ${p.line}`,
      borderRadius: RADIUS.md,
      padding: isMobile ? 16 : 18,
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ color: p.text, fontWeight: 900, fontSize: 15 }}>Add Echo</div>
          <div style={{ color: p.textSub, fontSize: 12, marginTop: 4 }}>Help students understand teaching style, workload, and course experience.</div>
        </div>
        <button type="button" onClick={onCancel} style={{ background: "transparent", border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, color: p.textSub, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={echoLabelStyle(p)}>Course context</span>
          <select
            value={form.courseId}
            onChange={e => setForm(prev => ({ ...prev, courseId: e.target.value }))}
            style={echoInputStyle(p)}
          >
            <option value="">General professor review</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>{course.subject} {course.number} · {course.title}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={echoLabelStyle(p)}>Grade received</span>
          <select
            value={form.gradeReceived}
            onChange={e => setForm(prev => ({ ...prev, gradeReceived: e.target.value }))}
            style={echoInputStyle(p)}
          >
            <option value="">Optional</option>
            {ECHO_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginTop: 14 }}>
        <EchoRatingScale label="Rate the professor" low="Awful" high="Excellent" value={form.qualityRating} onChange={value => setForm(prev => ({ ...prev, qualityRating: value }))} darkMode={darkMode} />
        <EchoRatingScale label="Difficulty" low="Very easy" high="Very difficult" value={form.difficultyRating} onChange={value => setForm(prev => ({ ...prev, difficultyRating: value }))} darkMode={darkMode} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
        <EchoYesNo label="Take again?" value={form.wouldTakeAgain} onChange={value => setForm(prev => ({ ...prev, wouldTakeAgain: value }))} darkMode={darkMode} />
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
        <span style={echoLabelStyle(p)}>Write a review</span>
        <textarea
          value={form.reviewText}
          onChange={e => setForm(prev => ({ ...prev, reviewText: e.target.value.slice(0, 700) }))}
          placeholder="What should other students know about this professor?"
          style={{ ...echoInputStyle(p), minHeight: 130, resize: "vertical", lineHeight: 1.55 }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 8 }}>
        <div style={{ color: error ? "#f87171" : p.textMute, fontSize: 11, lineHeight: 1.5 }}>
          {error || "Guideline: focus on course experience, not personal attacks or private information."}
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
      <div style={{ color: label === "Quality" ? ACCENT : p.text, fontFamily: MONO, fontSize: 18, fontWeight: 900 }}>{display}{display !== "—" ? suffix : ""}</div>
    </div>
  );
}

function EchoReviewCard({ review, darkMode }) {
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
      {(review.courseSubject || review.gradeReceived) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
          {review.courseSubject && <EchoMiniChip>{review.courseSubject} {review.courseNumber}</EchoMiniChip>}
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
    <button
      type="button"
      onClick={onClick}
      style={{
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
      }}
    >
      {label}
    </button>
  );
}

function ChartShell({ title, subtitle, children, darkMode }) {
  const p = palette(darkMode);
  return (
    <div style={{
      minHeight: 230,
      background: darkMode ? "rgba(255,255,255,0.025)" : "rgba(134,31,65,0.025)",
      border: `1px solid ${p.lineSoft || p.line}`,
      borderRadius: RADIUS.sm,
      padding: 14,
      display: "flex",
      flexDirection: "column",
    }}>
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
          <button
            key={group.key}
            type="button"
            onClick={() => onBandSelect(group.key)}
            title={`${group.label}: ${Math.round(group.value)}%`}
            style={{
              flex: 1,
              minWidth: 42,
              height: "100%",
              border: "none",
              background: "transparent",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              opacity: active || !activeBand ? 1 : 0.62,
            }}
          >
            <div style={{
              width: "100%",
              height: `${Math.max(10, (group.value / max) * 132)}px`,
              borderRadius: "10px 10px 4px 4px",
              background: `linear-gradient(180deg, ${group.color}, ${group.colorSoft})`,
              boxShadow: active ? `0 0 0 2px ${group.color}, 0 16px 34px ${group.shadow}` : `0 12px 30px ${group.shadow}`,
              transition: "height 180ms ease, transform 180ms ease",
              transform: active ? "translateY(-4px)" : "translateY(0)",
            }} />
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
          {[20, 40, 60].map(radius => (
            <circle key={radius} cx={center} cy={center} r={radius} fill="none" stroke={p.lineSoft || p.line} strokeWidth="1" />
          ))}
          {points.map(point => (
            <line key={point.key} x1={center} y1={center} x2={point.lx} y2={point.ly} stroke={p.lineSoft || p.line} strokeWidth="1" />
          ))}
          <polygon points={polygon} fill="rgba(134,31,65,0.26)" stroke={ACCENT} strokeWidth="2" />
          {points.map(point => (
            <g
              key={point.key}
              onClick={() => onBandSelect(point.key)}
              style={{ cursor: "pointer", opacity: activeBand === point.key ? 1 : 0.68 }}
            >
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
        <div style={{
          width: 132,
          height: 132,
          borderRadius: "50%",
          background: `conic-gradient(${gradientStops})`,
          boxShadow: "inset 0 0 0 18px rgba(0,0,0,0.18), 0 18px 40px rgba(0,0,0,0.2)",
          border: `1px solid ${p.line}`,
          display: "grid",
          placeItems: "center",
        }}>
          <div style={{
            width: 62,
            height: 62,
            borderRadius: "50%",
            background: p.card,
            border: `1px solid ${p.line}`,
            display: "grid",
            placeItems: "center",
            color: p.text,
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 800,
          }}>
            {activeBand}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
          {groups.map(group => (
            <button
              key={group.key}
              type="button"
              onClick={() => onBandSelect(group.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: activeBand === group.key ? group.color : p.textSub,
                fontSize: 10,
                fontFamily: MONO,
                border: `1px solid ${activeBand === group.key ? group.color : "transparent"}`,
                background: activeBand === group.key ? group.colorSoft : "transparent",
                borderRadius: RADIUS.pill,
                padding: "3px 6px",
                cursor: "pointer",
              }}
            >
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
    A: (dist.A || 0) + (dist["A-"] || 0),
    B: (dist["B+"] || 0) + (dist.B || 0) + (dist["B-"] || 0),
    C: (dist["C+"] || 0) + (dist.C || 0) + (dist["C-"] || 0),
    D: (dist["D+"] || 0) + (dist.D || 0) + (dist["D-"] || 0),
    F: dist.F || 0,
  };
}

function buildAggregateDistribution(courses) {
  const totals = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  if (!courses.length) return totals;
  courses.forEach(course => {
    const dist = normalizeGradeDistribution(course.gradeDistribution);
    Object.keys(totals).forEach(key => { totals[key] += dist[key] || 0; });
  });
  Object.keys(totals).forEach(key => { totals[key] = totals[key] / courses.length; });
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
  if (!group) return "Use this to compare how outcomes shift between instructors and courses.";
  if (group.key === "A") return "A larger A band usually signals stronger top-end outcomes, but compare it with B/C bands before assuming the course is easy.";
  if (group.key === "B") return "A strong B band often means outcomes are clustered around solid performance rather than extreme highs or lows.";
  if (group.key === "C") return "A larger C band can indicate a more demanding course or wider variation in student preparedness.";
  if (group.key === "D") return "Watch this band when balancing schedule risk; even a modest D share can matter in a packed semester.";
  if (group.key === "F") return "Use the F band as a risk signal, especially when pairing this class with other difficult courses.";
  return "Use this to compare how outcomes shift between instructors and courses.";
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
      background: colors.card,
      border: `1px solid ${colors.border}`,
      borderRadius: RADIUS.sm,
      padding: "14px 16px",
      minHeight: 132,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: comment ? 10 : 0, flexWrap: "wrap" }}>
        {quality != null && (
          <span style={{
            background: quality >= 4 ? "rgba(34,197,94,0.15)" : quality >= 3 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
            border: `1px solid ${quality >= 4 ? "rgba(34,197,94,0.28)" : quality >= 3 ? "rgba(251,191,36,0.3)" : "rgba(248,113,113,0.3)"}`,
            color: quality >= 4 ? "#22c55e" : quality >= 3 ? "#f59e0b" : "#f87171",
            fontWeight: 800,
            fontSize: 12,
            padding: "3px 9px",
            borderRadius: RADIUS.pill,
            fontFamily: MONO,
          }}>{quality.toFixed(1)} / 5</span>
        )}
        {difficulty != null && (
          <span style={{ fontSize: 11, color: colors.sub, fontWeight: 700, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.7px" }}>
            Difficulty: {difficulty.toFixed(1)}
          </span>
        )}
        {className && (
          <span style={{
            background: dm ? "rgba(255,255,255,0.08)" : "#f0edf8",
            color: dm ? "rgba(255,255,255,0.65)" : "#5a3a6a",
            fontWeight: 700,
            fontSize: 11,
            padding: "3px 9px",
            borderRadius: RADIUS.pill,
            fontFamily: MONO,
          }}>{className}</span>
        )}
        {date && (
          <span style={{ fontSize: 11, color: colors.sub, marginLeft: "auto", fontFamily: MONO }}>
            {new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      {comment && (
        <p style={{
          margin: 0,
          fontSize: 13,
          color: colors.text,
          lineHeight: 1.65,
          display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
          opacity: dm ? 0.9 : 0.82,
        }}>{comment}</p>
      )}
    </div>
  );
}
