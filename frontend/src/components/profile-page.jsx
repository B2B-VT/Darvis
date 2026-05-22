// Profile page — unified Clerk + site profile
import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { db } from "../supabase.js";

const MAJORS = [
  "Aerospace Engineering", "Agriculture", "Animal & Poultry Sciences",
  "Architecture", "Biochemistry", "Biological Sciences", "Biomedical Engineering",
  "Building Construction", "Business Information Technology", "Chemical Engineering",
  "Chemistry", "Civil Engineering", "Communication", "Computer Engineering",
  "Computer Science", "Construction Engineering & Management", "Crop & Soil Sciences",
  "Economics", "Electrical Engineering", "Engineering Science & Mechanics",
  "English", "Environmental Science", "Finance", "Food Science & Technology",
  "Geography", "History", "Hospitality & Tourism Management", "Human Development",
  "Industrial & Systems Engineering", "Information Technology",
  "Interdisciplinary Studies", "International Relations", "Landscape Architecture",
  "Management", "Marketing", "Material Science & Engineering", "Mathematics",
  "Mechanical Engineering", "Mining Engineering", "Music", "Neuroscience",
  "Ocean Engineering", "Philosophy", "Physics", "Political Science", "Psychology",
  "Public Health", "Real Estate", "Sociology", "Statistics", "Theatre Arts",
  "Urban Affairs & Planning",
];

const YEARS      = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate", "Other"];
const TERMS      = ["Fall 2024", "Spring 2025", "Summer 2025", "Fall 2025", "Spring 2026", "Summer 2026"];
const GRAD_TERMS = ["Spring 2025", "Summer 2025", "Fall 2025", "Spring 2026", "Fall 2026", "Spring 2027", "Fall 2027", "Spring 2028"];
const INTEREST_SUGGESTIONS = [
  "Machine Learning", "Web Development", "Systems Programming", "Cybersecurity",
  "Data Science", "Mobile Apps", "Game Development", "Robotics", "Research",
  "Startups", "Open Source", "Cloud Computing", "Competitive Programming",
  "Finance / Quant", "Product Management",
];

// ── Tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder, suggestions = [], dm }) {
  const [input, setInput] = useState("");
  const [showSugg, setShowSugg] = useState(false);

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  );

  const add = (val) => {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput(""); setShowSugg(false);
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  const handleKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault(); add(input);
    }
    if (e.key === "Backspace" && !input && tags.length) remove(tags[tags.length - 1]);
  };

  const border = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const bg     = dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const text   = dm ? "rgba(255,255,255,0.88)" : "#1a1210";

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px",
        border: `1.5px solid ${border}`, borderRadius: 10,
        background: bg, minHeight: 44, alignItems: "center", cursor: "text",
      }}
      onClick={() => document.getElementById(`ti-${placeholder}`)?.focus()}
      >
        {tags.map(tag => (
          <span key={tag} style={{
            background: "rgba(134,31,65,0.2)", color: dm ? "#f5a0b5" : "#861F41",
            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {tag}
            <button onClick={e => { e.stopPropagation(); remove(tag); }} style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              color: "inherit", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center",
            }}>×</button>
          </span>
        ))}
        <input
          id={`ti-${placeholder}`}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={handleKey}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          style={{
            background: "none", border: "none", outline: "none",
            color: text, fontSize: 13, fontWeight: 500,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            flex: 1, minWidth: 100,
          }}
        />
      </div>
      {showSugg && input && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
          background: dm ? "#1a1520" : "white",
          border: `1.5px solid ${border}`,
          borderRadius: 10, marginTop: 4, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {filtered.slice(0, 6).map(s => (
            <button key={s} onMouseDown={() => add(s)} style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "9px 14px", color: text, fontSize: 13,
              fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: "pointer", fontWeight: 500,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(134,31,65,0.12)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function InfoCard({ label, value, accent, dm }) {
  const c = dm
    ? { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", sub: "rgba(255,255,255,0.38)", text: "#fff" }
    : { bg: "rgba(0,0,0,0.03)",       border: "rgba(0,0,0,0.08)",       sub: "rgba(0,0,0,0.42)",       text: "#1a1210" };
  return (
    <div style={{
      background: c.bg, border: `1.5px solid ${c.border}`,
      borderRadius: 14, padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.sub, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || c.text, letterSpacing: "-0.3px" }}>
        {value || <span style={{ color: c.sub, fontWeight: 500, fontSize: 15 }}>Not set</span>}
      </div>
    </div>
  );
}

// ── Avatar — Clerk photo or initials fallback ──────────────────────
function Avatar({ user, size = 68 }) {
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean).map(n => n[0]).join("") || (user?.username?.[0] || "?").toUpperCase();

  if (user?.imageUrl && !user.imageUrl.includes("gravatar") && !user.imageUrl.endsWith("default")) {
    return (
      <img
        src={user.imageUrl}
        alt="Profile"
        style={{
          width: size, height: size, borderRadius: Math.round(size * 0.18),
          objectFit: "cover",
          border: "3px solid rgba(255,255,255,0.3)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.18),
      background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)", color: "white",
      fontWeight: 900, fontSize: Math.round(size * 0.36),
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "3px solid rgba(255,255,255,0.3)",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── Main profile page ─────────────────────────────────────────────
export default function ProfilePage({ darkMode }) {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const dm = darkMode;

  const c = dm ? {
    bg:          "#080808",
    head:        "#ffffff",
    text:        "rgba(255,255,255,0.88)",
    sub:         "rgba(255,255,255,0.45)",
    border:      "rgba(255,255,255,0.08)",
    card:        "rgba(255,255,255,0.04)",
    input:       "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.12)",
    divider:     "rgba(255,255,255,0.06)",
  } : {
    bg:          "#f7f4f0",
    head:        "#1a1210",
    text:        "#1a1210",
    sub:         "rgba(0,0,0,0.45)",
    border:      "rgba(0,0,0,0.08)",
    card:        "rgba(0,0,0,0.03)",
    input:       "white",
    inputBorder: "rgba(0,0,0,0.12)",
    divider:     "rgba(0,0,0,0.06)",
  };

  const meta = user?.unsafeMetadata || {};

  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [courseSuggestions, setCourseSuggestions] = useState([]);

  // Load catalog course codes once on mount
  useEffect(() => {
    db.from("major_requirements")
      .select("course_code")
      .not("course_code", "is", null)
      .order("course_code")
      .limit(20000)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(r => r.course_code))].sort();
          setCourseSuggestions(unique);
        }
      });
  }, []);

  const freshForm = () => ({
    // Clerk-managed fields
    firstName:    user?.firstName    || "",
    lastName:     user?.lastName     || "",
    username:     user?.username     || "",
    // Site metadata fields
    major:        meta.major        || "",
    minor:        meta.minor        || "",
    year:         meta.year         || "",
    term:         meta.term         || "",
    gpa:          meta.gpa          || "",
    gradTerm:     meta.gradTerm     || "",
    interests:    meta.interests    || [],
    coursesTaken: meta.coursesTaken || [],
  });

  const [form, setForm] = useState(freshForm);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const startEdit = () => {
    setForm(freshForm());
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await user.update({
        firstName: form.firstName || undefined,
        lastName:  form.lastName  || undefined,
        username:  form.username  || undefined,
        unsafeMetadata: {
          ...meta,
          onboardingComplete: true,
          major:        form.major,
          minor:        form.minor,
          year:         form.year,
          term:         form.term,
          gpa:          form.gpa,
          gradTerm:     form.gradTerm,
          interests:    form.interests,
          coursesTaken: form.coursesTaken,
        },
      });
      setEditing(false);
    } catch (e) {
      const msg = e?.errors?.[0]?.longMessage || e?.message || "Something went wrong. Try again.";
      setError(msg);
    }
    setSaving(false);
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px",
    background: c.input,
    border: `1.5px solid ${c.inputBorder}`,
    borderRadius: 10, color: c.text,
    fontSize: 14, fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: c.sub,
    textTransform: "uppercase", letterSpacing: "0.7px",
    marginBottom: 7, display: "block",
  };

  const selectStyle = {
    ...inputStyle, appearance: "none", cursor: "pointer",
  };

  if (!isLoaded) return null;

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ")
    || user?.username || "User";

  const gpaNum = parseFloat(meta.gpa);
  const gpaColor = !isNaN(gpaNum)
    ? (gpaNum >= 3.5 ? "#22a84a" : gpaNum >= 3.0 ? "#b45309" : "#c0392b")
    : undefined;

  return (
    <div style={{
      background: c.bg, minHeight: "calc(100vh - 60px)",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      paddingBottom: 80,
    }}>
      {/* Header banner */}
      <div style={{
        background: "linear-gradient(135deg, #6b1833 0%, #861F41 60%, #a02850 100%)",
        padding: "36px 0 32px",
      }}>
        <div style={{ maxWidth: 840, margin: "0 auto", padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Avatar user={user} size={68} />
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: "0 0 4px", color: "white", fontWeight: 800, fontSize: 24, letterSpacing: "-0.4px" }}>
                {displayName}
              </h1>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>
                {user?.username && <span style={{ marginRight: 12 }}>@{user.username}</span>}
                {user?.emailAddresses?.[0]?.emailAddress}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!editing && (
                <button onClick={startEdit} style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  color: "white", borderRadius: 10,
                  padding: "9px 20px", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                >
                  Edit profile
                </button>
              )}
              <button
                onClick={() => openUserProfile()}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.75)", borderRadius: 10,
                  padding: "9px 16px", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                title="Change email, password, or profile photo"
              >
                Account settings
              </button>
              <button
                onClick={() => signOut()}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.55)", borderRadius: 10,
                  padding: "9px 16px", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "32px 40px 0" }}>

        {/* ── View mode ── */}
        {!editing && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
              <InfoCard label="Major"        value={meta.major}   dm={dm} />
              <InfoCard label="Year"         value={meta.year}    dm={dm} />
              <InfoCard label="Current Term" value={meta.term}    dm={dm} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
              <InfoCard label="GPA"            value={meta.gpa ? `${parseFloat(meta.gpa).toFixed(2)}` : ""} accent={gpaColor} dm={dm} />
              <InfoCard label="Minor"          value={meta.minor}    dm={dm} />
              <InfoCard label="Expected Grad"  value={meta.gradTerm} dm={dm} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                Interests
              </div>
              {(meta.interests || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.interests.map(t => (
                    <span key={t} style={{
                      background: "rgba(134,31,65,0.15)", color: "#861F41",
                      border: "1px solid rgba(134,31,65,0.3)",
                      borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 700,
                    }}>{t}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: c.sub, fontSize: 14 }}>No interests added yet.</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                Courses Taken
              </div>
              {(meta.coursesTaken || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.coursesTaken.map(t => (
                    <span key={t} style={{
                      background: c.card, border: `1px solid ${c.border}`,
                      borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 700, color: c.text,
                    }}>{t}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: c.sub, fontSize: 14 }}>No courses added yet.</div>
              )}
            </div>
          </>
        )}

        {/* ── Edit mode ── */}
        {editing && (
          <div style={{
            background: c.card, border: `1.5px solid ${c.border}`,
            borderRadius: 18, padding: "32px",
          }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 800, color: c.head, letterSpacing: "-0.3px" }}>
              Edit profile
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* ── Identity section ── */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 900, color: "#861F41",
                  letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14,
                }}>Identity</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>First name</label>
                    <input
                      value={form.firstName}
                      onChange={e => set("firstName", e.target.value)}
                      placeholder="First name"
                      style={inputStyle}
                      onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                      onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last name</label>
                    <input
                      value={form.lastName}
                      onChange={e => set("lastName", e.target.value)}
                      placeholder="Last name"
                      style={inputStyle}
                      onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                      onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                    />
                  </div>
                </div>
                <div style={{ maxWidth: 280 }}>
                  <label style={labelStyle}>Username</label>
                  <input
                    value={form.username}
                    onChange={e => set("username", e.target.value)}
                    placeholder="@username"
                    style={inputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                    onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: c.sub }}>
                  To change your email, password, or profile photo, use{" "}
                  <button
                    onClick={() => openUserProfile()}
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: "#861F41", fontWeight: 700, fontSize: 12,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      textDecoration: "underline",
                    }}
                  >Account settings</button>.
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${c.divider}` }} />

              {/* ── Academic section ── */}
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 900, color: "#861F41",
                  letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14,
                }}>Academic</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Major</label>
                      <input
                        list="majors-edit"
                        value={form.major}
                        onChange={e => set("major", e.target.value)}
                        placeholder="e.g. Computer Science"
                        style={inputStyle}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      />
                      <datalist id="majors-edit">
                        {MAJORS.map(m => <option key={m} value={m} />)}
                      </datalist>
                    </div>
                    <div>
                      <label style={labelStyle}>Minor <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                      <input
                        value={form.minor}
                        onChange={e => set("minor", e.target.value)}
                        placeholder="e.g. Mathematics"
                        style={inputStyle}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Year</label>
                      <select value={form.year} onChange={e => set("year", e.target.value)}
                        style={{ ...selectStyle, color: form.year ? c.text : c.sub }}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      >
                        <option value="" disabled>Select year</option>
                        {YEARS.map(y => <option key={y} value={y} style={{ color: "black", background: "white" }}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Current Term</label>
                      <select value={form.term} onChange={e => set("term", e.target.value)}
                        style={{ ...selectStyle, color: form.term ? c.text : c.sub }}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      >
                        <option value="" disabled>Select term</option>
                        {TERMS.map(t => <option key={t} value={t} style={{ color: "black", background: "white" }}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Cumulative GPA</label>
                      <input
                        type="number" min="0" max="4" step="0.01"
                        value={form.gpa}
                        onChange={e => set("gpa", e.target.value)}
                        placeholder="e.g. 3.72"
                        style={inputStyle}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Expected Graduation</label>
                      <select value={form.gradTerm} onChange={e => set("gradTerm", e.target.value)}
                        style={{ ...selectStyle, color: form.gradTerm ? c.text : c.sub }}
                        onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                        onBlur={e => e.currentTarget.style.borderColor = c.inputBorder}
                      >
                        <option value="" disabled>Select term</option>
                        {GRAD_TERMS.map(t => <option key={t} value={t} style={{ color: "black", background: "white" }}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Interests</label>
                    <TagInput
                      tags={form.interests}
                      onChange={val => set("interests", val)}
                      placeholder="Type an interest, press Enter…"
                      suggestions={INTEREST_SUGGESTIONS}
                      dm={dm}
                    />
                    <div style={{ fontSize: 11, color: c.sub, marginTop: 5 }}>Press Enter or comma to add a tag.</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Courses Taken</label>
                    <TagInput
                      tags={form.coursesTaken}
                      onChange={val => set("coursesTaken", val)}
                      placeholder="e.g. CS 2114, MATH 2224…"
                      suggestions={courseSuggestions}
                      dm={dm}
                    />
                    <div style={{ fontSize: 11, color: c.sub, marginTop: 5 }}>Press Enter or comma after each course code.</div>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 16, padding: "10px 14px",
                background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)",
                borderRadius: 8, color: "#e74c3c", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={save} disabled={saving} style={{
                background: "#861F41", color: "white", border: "none",
                borderRadius: 12, padding: "12px 28px",
                fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
              }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setEditing(false)} style={{
                background: "none", color: c.sub,
                border: `1.5px solid ${c.border}`,
                borderRadius: 12, padding: "11px 20px",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
