// Profile page — LinkedIn-style with transcript upload + liquid glass
import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { db } from "../supabase.js";
import { glassCard, glassInput, palette, ACCENT, SANS, SERIF } from "../theme.jsx";

const MAJORS = [
  "Aerospace Engineering","Agriculture","Animal & Poultry Sciences","Architecture","Biochemistry",
  "Biological Sciences","Biomedical Engineering","Building Construction","Business Information Technology",
  "Chemical Engineering","Chemistry","Civil Engineering","Communication","Computer Engineering",
  "Computer Science","Construction Engineering & Management","Crop & Soil Sciences","Economics",
  "Electrical Engineering","Engineering Science & Mechanics","English","Environmental Science",
  "Finance","Food Science & Technology","Geography","History","Hospitality & Tourism Management",
  "Human Development","Industrial & Systems Engineering","Information Technology","Interdisciplinary Studies",
  "International Relations","Landscape Architecture","Management","Marketing","Material Science & Engineering",
  "Mathematics","Mechanical Engineering","Mining Engineering","Music","Neuroscience","Ocean Engineering",
  "Philosophy","Physics","Political Science","Psychology","Public Health","Real Estate","Sociology",
  "Statistics","Theatre Arts","Urban Affairs & Planning",
];

const YEARS      = ["Freshman","Sophomore","Junior","Senior","Graduate","Other"];
const TERMS      = ["Fall 2024","Spring 2025","Summer 2025","Fall 2025","Spring 2026","Summer 2026"];
const GRAD_TERMS = ["Spring 2025","Summer 2025","Fall 2025","Spring 2026","Fall 2026","Spring 2027","Fall 2027","Spring 2028"];

const INTEREST_SUGGESTIONS = [
  "Machine Learning","Web Development","Systems Programming","Cybersecurity","Data Science",
  "Mobile Apps","Game Development","Robotics","Research","Startups","Open Source",
  "Cloud Computing","Competitive Programming","Finance / Quant","Product Management",
];

const BANNER_PRESETS = [
  { key: "vt-default",  label: "VT Maroon",   style: "linear-gradient(135deg, #4a0e25 0%, #861F41 45%, #a02850 70%, #c47340 100%)" },
  { key: "midnight",    label: "Midnight",     style: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  { key: "ocean",       label: "Ocean",        style: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
  { key: "forest",      label: "Forest",       style: "linear-gradient(135deg, #134e5e 0%, #1a6b4a 50%, #71b280 100%)" },
  { key: "sunset",      label: "Sunset",       style: "linear-gradient(135deg, #f7971e 0%, #e05c6a 50%, #6b1883 100%)" },
  { key: "slate",       label: "Slate",        style: "linear-gradient(135deg, #1c1c2e 0%, #2d2d44 50%, #3a3a5c 100%)" },
  { key: "rose",        label: "Rose",         style: "linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)" },
  { key: "copper",      label: "Copper",       style: "linear-gradient(135deg, #b8860b 0%, #c47340 50%, #8b4513 100%)" },
];

const HOBBY_SUGGESTIONS = [
  "Hiking","Photography","Reading","Gaming","Music","Cooking","Travel","Art","Sports",
  "Fitness","Chess","Podcasts","Writing","Volunteering","Woodworking",
];

// ── Tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder, suggestions = [], dm, id }) {
  const [input, setInput]   = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const p = palette(dm);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s));

  const add = val => { const v = val.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(""); setShowSugg(false); };
  const remove = tag => onChange(tags.filter(t => t !== tag));

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px",
        border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
        borderRadius: 10, background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        minHeight: 44, alignItems: "center", cursor: "text",
      }} onClick={() => document.getElementById(id)?.focus()}>
        {tags.map(tag => (
          <span key={tag} style={{
            background: "rgba(134,31,65,0.2)", color: dm ? "#f5a0b5" : "#861F41",
            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {tag}
            <button onClick={e => { e.stopPropagation(); remove(tag); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", fontSize: 13, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input id={id} value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
            if (e.key === "Backspace" && !input && tags.length) remove(tags[tags.length - 1]);
          }}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          style={{ background: "none", border: "none", outline: "none", color: p.text, fontSize: 13, fontFamily: SANS, flex: 1, minWidth: 100 }}
        />
      </div>
      {showSugg && input && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
          ...glassCard(dm), borderRadius: 10, marginTop: 4, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {filtered.slice(0, 6).map(s => (
            <button key={s} onMouseDown={() => add(s)} style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "9px 14px", color: p.text, fontSize: 13, fontFamily: SANS, cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(134,31,65,0.12)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transcript upload / parser ────────────────────────────────────
function TranscriptUpload({ onCoursesFound, dm }) {
  const [status, setStatus]     = useState("idle");
  const [found, setFound]       = useState([]);
  const [selected, setSelected] = useState([]);
  const fileRef = useRef(null);

  const parseText = text => {
    const pattern = /\b([A-Z]{2,5})[\s\-](\d{4}[A-Z]?)\b/g;
    const matches = new Set();
    let m;
    while ((m = pattern.exec(text)) !== null) matches.add(`${m[1]} ${m[2]}`);
    return [...matches];
  };

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("reading");
    try {
      const text = await file.text();
      const courses = parseText(text);
      if (courses.length === 0) { setStatus("error"); }
      else { setFound(courses); setSelected(courses); setStatus("results"); }
    } catch { setStatus("error"); }
    e.target.value = "";
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".txt,.pdf,.csv" onChange={handleFile} style={{ display: "none" }} />
      {status === "idle" && (
        <button onClick={() => fileRef.current?.click()} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10,
          border: `1.5px dashed ${dm ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)"}`,
          background: "transparent", color: dm ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: SANS, transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)"; e.currentTarget.style.color = dm ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)"; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload transcript to auto-import courses
        </button>
      )}
      {status === "reading" && <div style={{ fontSize: 13, color: palette(dm).textSub, fontFamily: SANS }}>Reading file…</div>}
      {status === "error" && (
        <div style={{ fontSize: 13, color: "#e74c3c", fontFamily: SANS }}>
          Couldn't extract courses. Try saving your transcript as a .txt file.{" "}
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: SANS }}>Try again</button>
        </div>
      )}
      {status === "results" && (
        <div style={{ ...glassCard(dm), borderRadius: 12, padding: "16px", marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette(dm).text, marginBottom: 10 }}>
            Found {found.length} course{found.length !== 1 ? "s" : ""} — select which to add:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {found.map(c => {
              const on = selected.includes(c);
              return (
                <button key={c} onClick={() => setSelected(prev => on ? prev.filter(x => x !== c) : [...prev, c])} style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${on ? ACCENT : (dm ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)")}`,
                  background: on ? "rgba(134,31,65,0.18)" : "transparent",
                  color: on ? ACCENT : palette(dm).textSub, cursor: "pointer", fontFamily: SANS,
                }}>{c}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onCoursesFound(selected); setStatus("idle"); setFound([]); setSelected([]); }}
              disabled={selected.length === 0} style={{
              background: ACCENT, color: "white", border: "none", borderRadius: 8,
              padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: selected.length === 0 ? "default" : "pointer",
              fontFamily: SANS, opacity: selected.length === 0 ? 0.5 : 1,
            }}>Add {selected.length} course{selected.length !== 1 ? "s" : ""}</button>
            <button onClick={() => { setStatus("idle"); setFound([]); setSelected([]); }} style={{
              background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              color: palette(dm).textSub, borderRadius: 8, padding: "7px 14px",
              fontSize: 13, cursor: "pointer", fontFamily: SANS,
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Glass section card ─────────────────────────────────────────────
function SCard({ title, dm, onEdit, children }) {
  const glass = glassCard(dm);
  const p = palette(dm);
  return (
    <div style={{ ...glass, borderRadius: 16, padding: "22px 24px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: p.text, fontFamily: SANS }}>{title}</span>
        {onEdit && (
          <button onClick={onEdit} style={{
            background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
            borderRadius: 8, padding: "5px 12px",
            color: dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: SANS, transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"; e.currentTarget.style.color = dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)"; }}>Edit</button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ user, size = 80 }) {
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("")
    || (user?.username?.[0] || "?").toUpperCase();
  if (user?.imageUrl && !user.imageUrl.includes("gravatar") && !user.imageUrl.endsWith("default")) {
    return <img src={user.imageUrl} alt="Profile"
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "4px solid rgba(255,255,255,0.4)", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)",
      color: "white", fontWeight: 700, fontSize: Math.round(size * 0.34),
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "4px solid rgba(255,255,255,0.4)", flexShrink: 0,
    }}>{initials}</div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────
function EditModal({ dm, onClose, onSave, saving, error, form, set, courseSuggestions }) {
  const p = palette(dm);
  const glass = glassCard(dm);

  const IS = {
    width: "100%", padding: "10px 14px",
    background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    borderRadius: 10, color: p.text, fontSize: 14, fontFamily: SANS,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
  };
  const LS = { fontSize: 11, fontWeight: 700, color: p.textSub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6, display: "block" };
  const SL = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginTop: 16, marginBottom: 12, paddingTop: 16, borderTop: `1px solid ${dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` }}>{children}</div>
  );
  const onF = e => { e.currentTarget.style.borderColor = ACCENT; };
  const onB = e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"; };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...glass, borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", padding: "32px", fontFamily: SANS }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: p.text }}>Edit Profile</h2>
          <button onClick={onClose} style={{ background: dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: "none", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, color: p.textSub }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Identity */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LS}>First name</label><input value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="First name" style={IS} onFocus={onF} onBlur={onB} /></div>
            <div><label style={LS}>Last name</label><input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Last name" style={IS} onFocus={onF} onBlur={onB} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LS}>Username</label><input value={form.username} onChange={e => set("username", e.target.value)} placeholder="@username" style={IS} onFocus={onF} onBlur={onB} /></div>
            <div><label style={LS}>Location</label><input value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Blacksburg, VA" style={IS} onFocus={onF} onBlur={onB} /></div>
          </div>
          <div><label style={LS}>Headline</label><input value={form.headline} onChange={e => set("headline", e.target.value)} placeholder="e.g. CS student at Virginia Tech" style={IS} onFocus={onF} onBlur={onB} /></div>
          <div><label style={LS}>About / Bio</label><textarea value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Tell people about yourself…" rows={4} style={{ ...IS, resize: "vertical", lineHeight: 1.6 }} onFocus={onF} onBlur={onB} /></div>

          <SL>Links</SL>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LS}>LinkedIn URL</label><input value={form.linkedIn} onChange={e => set("linkedIn", e.target.value)} placeholder="linkedin.com/in/…" style={IS} onFocus={onF} onBlur={onB} /></div>
            <div><label style={LS}>GitHub URL</label><input value={form.github} onChange={e => set("github", e.target.value)} placeholder="github.com/…" style={IS} onFocus={onF} onBlur={onB} /></div>
          </div>
          <div><label style={LS}>Personal website</label><input value={form.website} onChange={e => set("website", e.target.value)} placeholder="yoursite.com" style={IS} onFocus={onF} onBlur={onB} /></div>

          <SL>Academic</SL>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={LS}>Major</label>
              <input list="majors-modal" value={form.major} onChange={e => set("major", e.target.value)} placeholder="e.g. Computer Science" style={IS} onFocus={onF} onBlur={onB} />
              <datalist id="majors-modal">{MAJORS.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div><label style={LS}>Minor</label><input value={form.minor} onChange={e => set("minor", e.target.value)} placeholder="e.g. Mathematics" style={IS} onFocus={onF} onBlur={onB} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LS}>Year</label>
              <select value={form.year} onChange={e => set("year", e.target.value)} style={{ ...IS, appearance: "none", cursor: "pointer" }} onFocus={onF} onBlur={onB}>
                <option value="" disabled>Select year</option>
                {YEARS.map(y => <option key={y} value={y} style={{ color: "black", background: "white" }}>{y}</option>)}
              </select></div>
            <div><label style={LS}>Current Term</label>
              <select value={form.term} onChange={e => set("term", e.target.value)} style={{ ...IS, appearance: "none", cursor: "pointer" }} onFocus={onF} onBlur={onB}>
                <option value="" disabled>Select term</option>
                {TERMS.map(t => <option key={t} value={t} style={{ color: "black", background: "white" }}>{t}</option>)}
              </select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LS}>Cumulative GPA</label><input type="number" min="0" max="4" step="0.01" value={form.gpa} onChange={e => set("gpa", e.target.value)} placeholder="e.g. 3.72" style={IS} onFocus={onF} onBlur={onB} /></div>
            <div><label style={LS}>Expected Graduation</label>
              <select value={form.gradTerm} onChange={e => set("gradTerm", e.target.value)} style={{ ...IS, appearance: "none", cursor: "pointer" }} onFocus={onF} onBlur={onB}>
                <option value="" disabled>Select term</option>
                {GRAD_TERMS.map(t => <option key={t} value={t} style={{ color: "black", background: "white" }}>{t}</option>)}
              </select></div>
          </div>

          <SL>Skills & Interests</SL>
          <TagInput tags={form.interests} onChange={val => set("interests", val)} placeholder="Type an interest, press Enter…" suggestions={INTEREST_SUGGESTIONS} dm={dm} id="interests-input" />

          <SL>Hobbies</SL>
          <TagInput tags={form.hobbies} onChange={val => set("hobbies", val)} placeholder="Type a hobby, press Enter…" suggestions={HOBBY_SUGGESTIONS} dm={dm} id="hobbies-input" />

          <SL>Courses Taken</SL>
          <TagInput tags={form.coursesTaken} onChange={val => set("coursesTaken", val)} placeholder="e.g. CS 2114, MATH 2224…" suggestions={courseSuggestions} dm={dm} id="courses-taken-input" />
          <div style={{ fontSize: 11, color: p.textSub }}>Press Enter or comma after each course code.</div>
          <TranscriptUpload dm={dm} onCoursesFound={courses => set("coursesTaken", [...new Set([...form.coursesTaken, ...courses])])} />
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", borderRadius: 8, color: "#e74c3c", fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button onClick={onSave} disabled={saving} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 12, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: SANS, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
          <button onClick={onClose} style={{ background: "none", color: p.textSub, border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 12, padding: "11px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function ProfilePage({ darkMode }) {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const dm = darkMode;
  const p  = palette(dm);

  const [editing, setEditing]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");
  const [courseSuggestions, setCourseSugs] = useState([]);
  const [isMobile, setIsMobile]           = useState(() => window.innerWidth < 768);
  const [bannerEditing, setBannerEditing] = useState(false);
  const [bannerSaving, setBannerSaving]   = useState(false);

  useEffect(() => {
    if (!bannerEditing) return;
    const close = (e) => {
      if (!e.target.closest("[data-banner-picker]") && !e.target.closest("[data-banner-trigger]")) {
        setBannerEditing(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [bannerEditing]);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    db.rpc("get_distinct_course_codes")
      .then(({ data }) => { if (data) setCourseSugs(data.map(r => r.course_code)); });
  }, []);

  const meta = user?.unsafeMetadata || {};

  const freshForm = () => ({
    firstName: user?.firstName || "", lastName: user?.lastName || "",
    username: user?.username || "",
    major: meta.major || "", minor: meta.minor || "",
    year: meta.year || "", term: meta.term || "",
    gpa: meta.gpa || "", gradTerm: meta.gradTerm || "",
    interests: meta.interests || [], coursesTaken: meta.coursesTaken || [],
    bio: meta.bio || "", location: meta.location || "",
    headline: meta.headline || "", hobbies: meta.hobbies || [],
    linkedIn: meta.linkedIn || "", github: meta.github || "", website: meta.website || "",
  });

  const [form, setForm] = useState(freshForm);
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      await user.update({
        firstName: form.firstName || undefined,
        lastName:  form.lastName  || undefined,
        username:  form.username  || undefined,
        unsafeMetadata: {
          ...meta, onboardingComplete: true,
          major: form.major, minor: form.minor,
          year: form.year, term: form.term,
          gpa: form.gpa, gradTerm: form.gradTerm,
          interests: form.interests, coursesTaken: form.coursesTaken,
          bio: form.bio, location: form.location, headline: form.headline,
          hobbies: form.hobbies, linkedIn: form.linkedIn,
          github: form.github, website: form.website,
        },
      });
      setEditing(false);
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || e?.message || "Something went wrong.");
    }
    setSaving(false);
  };

  if (!isLoaded) return null;

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "User";
  const gpaNum = parseFloat(meta.gpa);
  const gpaColor = !isNaN(gpaNum) ? (gpaNum >= 3.5 ? "#22a84a" : gpaNum >= 3.0 ? "#b45309" : "#c0392b") : ACCENT;
  const autoHeadline = meta.headline || [meta.major, meta.year ? `${meta.year} at Virginia Tech` : "Virginia Tech"].filter(Boolean).join(" · ");

  const Chip = ({ children }) => (
    <span style={{ background: "rgba(134,31,65,0.15)", color: ACCENT, border: "1px solid rgba(134,31,65,0.28)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, fontFamily: SANS }}>{children}</span>
  );

  const CoursePill = ({ code }) => (
    <span style={{ background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: p.text, fontFamily: "'JetBrains Mono', monospace" }}>{code}</span>
  );

  const startEdit = () => { setForm(freshForm()); setError(""); setEditing(true); };

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", fontFamily: SANS, paddingBottom: 80 }}>

      {/* Cover banner */}
      {(() => {
        const preset = BANNER_PRESETS.find(b => b.key === meta.bannerPreset) || BANNER_PRESETS[0];
        const bannerBg = meta.bannerUrl
          ? `url(${meta.bannerUrl}) center/cover no-repeat`
          : preset.style;
        return (
          <div data-banner-trigger style={{ background: bannerBg, height: isMobile ? 120 : 180, position: "relative", cursor: "pointer" }}
            onClick={() => setBannerEditing(v => !v)}>
            {!meta.bannerUrl && (
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(134,31,65,0.3) 0%, transparent 60%)" }} />
            )}
            {/* Edit banner hint */}
            <div style={{
              position: "absolute", bottom: 10, right: 14,
              background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
              borderRadius: 8, padding: "5px 12px",
              fontSize: 12, fontWeight: 600, color: "white",
              display: "flex", alignItems: "center", gap: 6,
              opacity: bannerEditing ? 1 : 0, transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "1"}
            onMouseLeave={e => { if (!bannerEditing) e.currentTarget.style.opacity = "0"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit banner
            </div>

            {/* Banner picker popover */}
            {bannerEditing && (
              <div
                data-banner-picker
                onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute", bottom: -8, right: 14,
                  transform: "translateY(100%)",
                  zIndex: 50,
                  background: dm ? "rgba(18,14,12,0.96)" : "rgba(255,255,255,0.97)",
                  backdropFilter: "blur(20px)",
                  border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
                  borderRadius: 14,
                  padding: "16px",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
                  minWidth: 280,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Choose banner</div>

                {/* Preset grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                  {BANNER_PRESETS.map(b => {
                    const active = !meta.bannerUrl && (meta.bannerPreset || "vt-default") === b.key;
                    return (
                      <button key={b.key} title={b.label}
                        onClick={async () => {
                          setBannerSaving(true);
                          try {
                            await user.update({ unsafeMetadata: { ...meta, bannerPreset: b.key, bannerUrl: "" } });
                          } finally { setBannerSaving(false); }
                        }}
                        style={{
                          height: 36, borderRadius: 8, cursor: "pointer",
                          background: b.style,
                          border: active ? "2.5px solid white" : "2px solid transparent",
                          boxShadow: active ? "0 0 0 2px #861F41" : "none",
                          transition: "all 0.12s",
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Custom URL */}
                <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 6 }}>Or paste an image URL</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    placeholder="https://…"
                    defaultValue={meta.bannerUrl || ""}
                    id="banner-url-input"
                    style={{
                      flex: 1, padding: "7px 10px",
                      background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                      border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                      borderRadius: 8, color: p.text, fontSize: 12,
                      fontFamily: SANS, outline: "none",
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = ACCENT}
                    onBlur={e => e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}
                  />
                  <button
                    disabled={bannerSaving}
                    onClick={async () => {
                      const url = document.getElementById("banner-url-input")?.value?.trim();
                      setBannerSaving(true);
                      try {
                        await user.update({ unsafeMetadata: { ...meta, bannerUrl: url || "", bannerPreset: url ? "" : (meta.bannerPreset || "vt-default") } });
                      } finally { setBannerSaving(false); }
                    }}
                    style={{
                      background: ACCENT, color: "white", border: "none",
                      borderRadius: 8, padding: "7px 12px",
                      fontSize: 12, fontWeight: 700, cursor: bannerSaving ? "default" : "pointer",
                      fontFamily: SANS, opacity: bannerSaving ? 0.7 : 1,
                    }}>
                    {bannerSaving ? "…" : "Apply"}
                  </button>
                </div>

                <button onClick={() => setBannerEditing(false)} style={{
                  marginTop: 12, width: "100%", background: "none",
                  border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                  borderRadius: 8, padding: "6px", color: p.textSub,
                  fontSize: 12, cursor: "pointer", fontFamily: SANS,
                }}>Done</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Profile header */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "0 16px" : "0 40px" }}>
        <div style={{
          display: "flex", flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "flex-end",
          gap: isMobile ? 12 : 20,
          marginTop: isMobile ? -44 : -56,
          paddingBottom: 20,
          borderBottom: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          position: "relative", zIndex: 2,
        }}>
          <div style={{ border: `4px solid ${dm ? "#0A0908" : "#FAF6F0"}`, borderRadius: "50%", flexShrink: 0 }}>
            <Avatar user={user} size={isMobile ? 72 : 96} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? 0 : 4 }}>
            <h1 style={{ margin: "0 0 4px", color: p.text, fontWeight: 400, fontSize: isMobile ? 22 : 28, fontFamily: SERIF, letterSpacing: "-0.4px" }}>{displayName}</h1>
            <div style={{ color: p.textSub, fontSize: 14, marginBottom: 4, fontWeight: 500 }}>{autoHeadline}</div>
            {meta.location && (
              <div style={{ color: p.textMute, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {meta.location}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0, paddingBottom: 4 }}>
            <button onClick={startEdit} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}>Edit profile</button>
            <button onClick={() => openUserProfile()} style={{ background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`, color: p.textSub, borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Account</button>
            <button onClick={() => signOut()} style={{ background: "transparent", border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, color: p.textMute, borderRadius: 10, padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Sign out</button>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: 16, marginTop: 16, alignItems: "start" }}>

          {/* Main column */}
          <div>
            {meta.bio && (
              <SCard title="About" dm={dm} onEdit={startEdit}>
                <p style={{ margin: 0, fontSize: 14, color: p.text, lineHeight: 1.75 }}>{meta.bio}</p>
              </SCard>
            )}

            <SCard title="Skills & Interests" dm={dm} onEdit={startEdit}>
              {(meta.interests || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{meta.interests.map(t => <Chip key={t}>{t}</Chip>)}</div>
              ) : (
                <div style={{ color: p.textSub, fontSize: 14 }}>No interests added yet. <button onClick={startEdit} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS }}>Add some →</button></div>
              )}
            </SCard>

            {(meta.hobbies || []).length > 0 && (
              <SCard title="Hobbies" dm={dm} onEdit={startEdit}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.hobbies.map(h => (
                    <span key={h} style={{ background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: p.text }}>{h}</span>
                  ))}
                </div>
              </SCard>
            )}

            <SCard title="Courses Taken" dm={dm} onEdit={startEdit}>
              {(meta.coursesTaken || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{meta.coursesTaken.map(c => <CoursePill key={c} code={c} />)}</div>
              ) : (
                <div style={{ color: p.textSub, fontSize: 14 }}>No courses added yet. <button onClick={startEdit} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS }}>Add or upload transcript →</button></div>
              )}
            </SCard>

            {!meta.bio && (
              <div style={{ ...glassCard(dm), borderRadius: 16, padding: "22px 24px", marginBottom: 12, textAlign: "center" }}>
                <div style={{ color: p.textSub, fontSize: 14, marginBottom: 12 }}>Your profile is looking bare. Add a bio, interests, and your courses taken.</div>
                <button onClick={startEdit} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Complete your profile</button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div>
            <SCard title="Academic Details" dm={dm} onEdit={startEdit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "Major", value: meta.major },
                  { label: "Minor", value: meta.minor },
                  { label: "Year", value: meta.year },
                  { label: "Current Term", value: meta.term },
                  { label: "Expected Grad", value: meta.gradTerm },
                  { label: "GPA", value: meta.gpa ? parseFloat(meta.gpa).toFixed(2) : null, accent: gpaColor },
                ].map(({ label, value, accent }) => value ? (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: p.textSub, fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: accent || p.text }}>{value}</span>
                  </div>
                ) : null)}
                {!meta.major && !meta.year && <div style={{ fontSize: 13, color: p.textSub }}>No academic info yet.</div>}
              </div>
            </SCard>

            {(meta.linkedIn || meta.github || meta.website || user?.emailAddresses?.[0]?.emailAddress) && (
              <SCard title="Contact" dm={dm}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { href: `mailto:${user?.emailAddresses?.[0]?.emailAddress}`, label: user?.emailAddresses?.[0]?.emailAddress, show: !!user?.emailAddresses?.[0]?.emailAddress },
                    { href: meta.linkedIn, label: "LinkedIn", show: !!meta.linkedIn },
                    { href: meta.github, label: "GitHub", show: !!meta.github },
                    { href: meta.website, label: "Website", show: !!meta.website },
                  ].filter(l => l.show).map(({ href, label }) => (
                    <a key={label} href={href?.startsWith("http") ? href : href?.startsWith("mailto") ? href : `https://${href}`}
                      target={href?.startsWith("mailto") ? "_self" : "_blank"} rel="noreferrer"
                      style={{ color: p.textSub, fontSize: 13, textDecoration: "none", fontFamily: SANS }}
                      onMouseEnter={e => e.currentTarget.style.color = ACCENT}
                      onMouseLeave={e => e.currentTarget.style.color = p.textSub}>{label}</a>
                  ))}
                </div>
              </SCard>
            )}

            <div style={{ fontSize: 12, color: p.textMute, padding: "4px", lineHeight: 1.5 }}>
              Change email, password, or photo in{" "}
              <button onClick={() => openUserProfile()} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: ACCENT, fontWeight: 700, fontSize: 12, fontFamily: SANS, textDecoration: "underline" }}>Account settings</button>.
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditModal dm={dm} onClose={() => setEditing(false)} onSave={save} saving={saving} error={error} form={form} set={set} courseSuggestions={courseSuggestions} />
      )}
    </div>
  );
}
