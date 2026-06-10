// Profile setup modal — shown after first sign-in
import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { db } from "../supabase.js";

const VT_MAJORS = [
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

const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate", "Other"];

const INTEREST_SUGGESTIONS = [
  "Machine Learning", "Web Development", "Systems Programming", "Cybersecurity",
  "Data Science", "Mobile Apps", "Game Development", "Robotics", "Research",
  "Startups", "Open Source", "Cloud Computing", "Competitive Programming",
  "Finance / Quant", "Product Management",
];

function TagInput({ tags, onChange, placeholder, suggestions = [] }) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  );

  const add = (val) => {
    const v = val.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setInput("");
    setShowSuggestions(false);
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  const handleKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      add(input);
    }
    if (e.key === "Backspace" && !input && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px",
        border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10,
        background: "rgba(255,255,255,0.04)", minHeight: 44,
        alignItems: "center", cursor: "text",
      }}
      onClick={() => document.getElementById(`tag-input-${placeholder}`)?.focus()}
      >
        {tags.map(tag => (
          <span key={tag} style={{
            background: "rgba(134,31,65,0.2)", color: "#f5a0b5",
            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {tag}
            <button
              onClick={e => { e.stopPropagation(); remove(tag); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#f5a0b5", padding: 0, fontSize: 12, lineHeight: 1,
                display: "flex", alignItems: "center",
              }}
            >×</button>
          </span>
        ))}
        <input
          id={`tag-input-${placeholder}`}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true); }}
          onKeyDown={handleKey}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          style={{
            background: "none", border: "none", outline: "none",
            color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 500,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            flex: 1, minWidth: 120,
          }}
        />
      </div>
      {showSuggestions && input && filteredSuggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
          background: "#1a1520", border: "1.5px solid rgba(255,255,255,0.12)",
          borderRadius: 10, marginTop: 4, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {filteredSuggestions.slice(0, 6).map(s => (
            <button
              key={s}
              onMouseDown={() => add(s)}
              style={{
                width: "100%", textAlign: "left", background: "none", border: "none",
                padding: "9px 14px", color: "rgba(255,255,255,0.78)", fontSize: 13,
                fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: "pointer",
                fontWeight: 500, transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(134,31,65,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileModal({ onClose, darkMode = true }) {
  const { user } = useUser();
  const [step, setStep] = useState("welcome"); // "welcome" | "form"
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    major: "",
    year: "",
    gpa: "",
    interests: [],
    coursesTaken: [],
  });
  const [courseSuggestions, setCourseSuggestions] = useState([]);

  // Load catalog course codes when the form step opens.
  // Uses an RPC (server-side DISTINCT) to bypass PostgREST's 1000-row limit.
  useEffect(() => {
    if (step !== "form" || courseSuggestions.length > 0) return;
    db.rpc("get_distinct_course_codes")
      .then(({ data }) => {
        if (data) {
          setCourseSuggestions(data.map(r => r.course_code));
        }
      });
  }, [step]);

  const firstName = user?.firstName || "there";

  const skip = async () => {
    setSaving(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          onboardingComplete: true,
          profileSkipped: true,
        },
      });
    } catch (e) {
      console.error("Failed to save onboarding state:", e);
    }
    setSaving(false);
    onClose();
  };

  const save = async () => {
    setSaving(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          onboardingComplete: true,
          profileSkipped: false,
          major: form.major,
          year: form.year,
          gpa: form.gpa,
          interests: form.interests,
          coursesTaken: form.coursesTaken,
        },
      });
    } catch (e) {
      console.error("Failed to save profile:", e);
    }
    setSaving(false);
    onClose();
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const inputStyle = {
    width: "100%", padding: "10px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.12)",
    borderRadius: 10, color: "rgba(255,255,255,0.88)",
    fontSize: 14, fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase", letterSpacing: "0.7px",
    marginBottom: 7, display: "block",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      padding: "24px",
    }}>
      <div style={{
        background: "#0f0d14",
        border: "1.5px solid rgba(255,255,255,0.1)",
        borderRadius: 20,
        width: "100%", maxWidth: step === "form" ? 560 : 440,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>

        {/* ── Welcome step ── */}
        {step === "welcome" && (
          <div style={{ padding: "48px 40px", textAlign: "center" }}>
            <div style={{ marginBottom: 20 }}>
              <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="Darvis" style={{ width: 60, height: 60 }} />
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#861F41",
              letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: 16,
            }}>Welcome to Darvis</div>
            <h2 style={{
              margin: "0 0 12px",
              fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.5px",
            }}>
              Hey {firstName}!
            </h2>
            <p style={{
              margin: "0 0 36px",
              fontSize: 15, color: "rgba(255,255,255,0.50)", lineHeight: 1.65,
            }}>
              Set up your profile in 30 seconds so we can tailor your results. Or skip it and jump straight in.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                onClick={() => setStep("form")}
                style={{
                  background: "#861F41", color: "white", border: "none",
                  borderRadius: 12, padding: "13px 24px",
                  fontWeight: 700, fontSize: 15, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                Set up my profile
              </button>
              <button
                onClick={skip}
                disabled={saving}
                style={{
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)",
                  border: "1.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: "12px 24px",
                  fontWeight: 600, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.09)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* ── Profile form step ── */}
        {step === "form" && (
          <div style={{ padding: "36px 36px 32px" }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#861F41",
                letterSpacing: "2px", textTransform: "uppercase", marginBottom: 10,
              }}>Your Profile</div>
              <h2 style={{
                margin: 0, fontSize: 22, fontWeight: 800, color: "white", letterSpacing: "-0.4px",
              }}>
                Tell us about yourself
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.38)" }}>
                All fields are optional — fill in what you'd like.
              </p>
            </div>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Major + Year row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Major</label>
                  <input
                    list="vt-majors"
                    value={form.major}
                    onChange={e => set("major", e.target.value)}
                    placeholder="e.g. Computer Science"
                    style={inputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                  />
                  <datalist id="vt-majors">
                    {VT_MAJORS.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Year</label>
                  <select
                    value={form.year}
                    onChange={e => set("year", e.target.value)}
                    style={{
                      ...inputStyle,
                      appearance: "none",
                      color: form.year ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.32)",
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                  >
                    <option value="" disabled>Select year</option>
                    {YEARS.map(y => <option key={y} value={y} style={{ color: "black", background: "white" }}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* GPA */}
              <div style={{ maxWidth: 160 }}>
                <label style={labelStyle}>Cumulative GPA</label>
                <input
                  type="number"
                  min="0" max="4" step="0.01"
                  value={form.gpa}
                  onChange={e => set("gpa", e.target.value)}
                  placeholder="e.g. 3.72"
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = "#861F41"}
                  onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>

              {/* Interests */}
              <div>
                <label style={labelStyle}>Interests</label>
                <TagInput
                  tags={form.interests}
                  onChange={val => set("interests", val)}
                  placeholder="Type an interest, press Enter…"
                  suggestions={INTEREST_SUGGESTIONS}
                />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 5 }}>
                  Press Enter or comma to add a tag.
                </div>
              </div>

              {/* Courses taken */}
              <div>
                <label style={labelStyle}>Courses Taken</label>
                <TagInput
                  tags={form.coursesTaken}
                  onChange={val => set("coursesTaken", val)}
                  placeholder="e.g. CS 2114, MATH 2224…"
                  suggestions={courseSuggestions}
                />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 5 }}>
                  Type a course code and pick from the list, or press Enter to add.
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  flex: 1, background: "#861F41", color: "white", border: "none",
                  borderRadius: 12, padding: "13px 24px",
                  fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
                }}
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <button
                onClick={skip}
                disabled={saving}
                style={{
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)",
                  border: "1.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: "12px 20px",
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Skip
              </button>
            </div>

            <button
              onClick={() => setStep("welcome")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.28)", fontSize: 12,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginTop: 14, padding: 0, display: "block",
              }}
            >← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
