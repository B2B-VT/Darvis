// Profile page — LinkedIn-style with posts, experience, education, LinkedIn import
import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;
import { API } from "../api.js";
import { glassCard, palette, ACCENT, SANS, SERIF } from "../theme.jsx";

// ── Constants ─────────────────────────────────────────────────────
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
const HOBBY_SUGGESTIONS = [
  "Hiking","Photography","Reading","Gaming","Music","Cooking","Travel","Art","Sports",
  "Fitness","Chess","Podcasts","Writing","Volunteering","Woodworking",
];
const BANNER_PRESETS = [
  { key: "vt-default", style: "linear-gradient(135deg, #4a0e25 0%, #861F41 45%, #a02850 70%, #c47340 100%)" },
  { key: "midnight",   style: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  { key: "ocean",      style: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
  { key: "forest",     style: "linear-gradient(135deg, #134e5e 0%, #1a6b4a 50%, #71b280 100%)" },
  { key: "sunset",     style: "linear-gradient(135deg, #f7971e 0%, #e05c6a 50%, #6b1883 100%)" },
  { key: "slate",      style: "linear-gradient(135deg, #1c1c2e 0%, #2d2d44 50%, #3a3a5c 100%)" },
  { key: "rose",       style: "linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)" },
  { key: "copper",     style: "linear-gradient(135deg, #b8860b 0%, #c47340 50%, #8b4513 100%)" },
];
const POST_TYPES = [
  { key: "general",    label: "Update",     color: "#6366f1" },
  { key: "project",    label: "Project",    color: "#0ea5e9" },
  { key: "research",   label: "Research",   color: "#10b981" },
  { key: "experience", label: "Experience", color: "#f59e0b" },
];

// ── LinkedIn PDF parser ───────────────────────────────────────────
const LI_SECTIONS = [
  "Contact","Top Skills","Summary","Experience","Education","Skills",
  "Languages","Certifications","Publications","Projects","Volunteer Experience",
  "Honors-Awards","Licenses & Certifications","Recommendations received","Courses",
];
const LI_SECTION_RE = new RegExp(
  `^(${LI_SECTIONS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`
);

async function parseLinkedInPDF(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.filter(it => "str" in it && it.str.trim()).map(it => it.str).join("\n") + "\n";
  }
  return parseLinkedInText(text);
}

function parseLinkedInText(rawText) {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  const result = {};

  const sectionIdx = {};
  lines.forEach((line, i) => {
    if (LI_SECTION_RE.test(line) && !(line in sectionIdx)) sectionIdx[line] = i;
  });

  const getSection = (name) => {
    const start = sectionIdx[name];
    if (start === undefined) return [];
    const next = Object.values(sectionIdx).sort((a, b) => a - b).find(i => i > start) ?? lines.length;
    return lines.slice(start + 1, next);
  };

  // Name + Headline: scan lines before first section (capped at 20)
  const firstSection = Math.min(...Object.values(sectionIdx).filter(Boolean), 20);
  for (let i = 0; i < Math.min(firstSection, lines.length); i++) {
    const line = lines[i];
    if (LI_SECTION_RE.test(line) || line.match(/[@/]/) || line.match(/^\+?[\d\s\-().]{7,}$/)) continue;
    if (!result.firstName && line.match(/^[A-ZÀ-ž][a-zÀ-ž\-']+(\s[A-ZÀ-ž][a-zÀ-ž\-'.]+){1,3}$/)) {
      const parts = line.split(" ");
      result.firstName = parts[0];
      result.lastName  = parts.slice(1).join(" ");
    } else if (result.firstName && !result.headline && line.length >= 5) {
      const sep = line.includes("·") ? "·" : line.includes("•") ? "•" : null;
      if (sep) { const idx = line.lastIndexOf(sep); result.headline = line.slice(0, idx).trim(); result.location = line.slice(idx + 1).trim(); }
      else if (!line.match(/^\d{4}/)) result.headline = line;
    }
  }

  // Summary / Bio
  const summaryLines = getSection("Summary");
  if (summaryLines.length) result.bio = summaryLines.join(" ").trim();

  // Experience
  const expLines = getSection("Experience");
  if (expLines.length) {
    const entries = [];
    let cur = null;
    const isDate = l => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})\b/.test(l) && /[-–]/.test(l);
    for (const line of expLines) {
      if (isDate(line)) {
        if (cur) {
          const raw = line.split("·")[0].trim().split(/[-–]/);
          cur.startDate = raw[0]?.trim() || "";
          cur.endDate   = raw[1]?.trim() || "";
          cur.current   = /present/i.test(line);
        }
      } else if ((line.includes("·") || line.includes("•")) && cur && !cur.company) {
        cur.company = line.split(/[·•]/)[0].trim();
      } else if (!isDate(line) && !line.includes("·") && !line.includes("•")) {
        if (!cur || (cur.company && cur.startDate)) {
          cur = { title: line, company: "", location: "", startDate: "", endDate: "", current: false, description: "" };
          entries.push(cur);
        } else if (cur && !cur.company) {
          cur.company = line;
        }
      }
    }
    result.experience = entries.filter(e => e.title || e.company).slice(0, 10);
  }

  // Education
  const eduLines = getSection("Education");
  if (eduLines.length) {
    const entries = [];
    let cur = null;
    const isDegree = l => /\b(bachelor|master|doctor|phd|associate|mba|b\.?s|m\.?s|b\.?a)\b/i.test(l);
    const hasYears = l => /\d{4}/.test(l) && /[-–]/.test(l);
    for (const line of eduLines) {
      if (hasYears(line) && cur) {
        const years = line.match(/\d{4}/g) || [];
        cur.startYear = years[0] || "";
        cur.endYear   = years[1] || (/present/i.test(line) ? "Present" : "");
      } else if (isDegree(line) && cur) {
        const parts = line.split(/[,·•\-]/).map(s => s.trim()).filter(Boolean);
        cur.degree = parts[0] || "";
        cur.field  = parts[1] || "";
      } else if (!hasYears(line) && !isDegree(line) && line.length > 2) {
        if (!cur || cur.degree) { cur = { school: line, degree: "", field: "", startYear: "", endYear: "" }; entries.push(cur); }
        else if (!cur.field) cur.field = line;
      }
    }
    result.education = entries.filter(e => e.school).slice(0, 5);
  }

  // Skills
  const skillLines = getSection("Skills").length ? getSection("Skills") : getSection("Top Skills");
  if (skillLines.length) {
    result.interests = skillLines.filter(l => l.length > 1 && l.length < 60 && !l.match(/^\d+/)).slice(0, 20);
  }

  return result;
}

// ── Tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder, suggestions = [], dm, id }) {
  const [input, setInput] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const p = palette(dm);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s));
  const add = v => { v = v.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(""); setShowSugg(false); };
  const remove = t => onChange(tags.filter(x => x !== t));
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px",
        border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
        borderRadius: 10, background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        minHeight: 44, alignItems: "center", cursor: "text",
      }} onClick={() => document.getElementById(id)?.focus()}>
        {tags.map(t => (
          <span key={t} style={{ background: "rgba(134,31,65,0.2)", color: dm ? "#f5a0b5" : ACCENT, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            {t}<button onClick={e => { e.stopPropagation(); remove(t); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", fontSize: 13, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input id={id} value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
            if (e.key === "Backspace" && !input && tags.length) remove(tags[tags.length - 1]);
          }}
          onFocus={() => setShowSugg(true)} onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          style={{ background: "none", border: "none", outline: "none", color: p.text, fontSize: 13, fontFamily: SANS, flex: 1, minWidth: 100 }} />
      </div>
      {showSugg && input && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, ...glassCard(dm), borderRadius: 10, marginTop: 4, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          {filtered.slice(0, 6).map(s => (
            <button key={s} onMouseDown={() => add(s)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 14px", color: p.text, fontSize: 13, fontFamily: SANS, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(134,31,65,0.12)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transcript upload ─────────────────────────────────────────────
function TranscriptUpload({ onCoursesFound, dm }) {
  const [status, setStatus] = useState("idle");
  const [found, setFound]   = useState([]);
  const [sel, setSel]       = useState([]);
  const fileRef = useRef(null);
  const parseText = text => {
    const pattern = /\b([A-Z]{2,5})[\s\-](\d{4}[A-Z]?)\b/g;
    const matches = new Set(); let m;
    while ((m = pattern.exec(text)) !== null) matches.add(`${m[1]} ${m[2]}`);
    return [...matches];
  };
  const handleFile = async e => {
    const file = e.target.files[0]; if (!file) return;
    setStatus("reading");
    try { const c = parseText(await file.text()); if (!c.length) setStatus("error"); else { setFound(c); setSel(c); setStatus("results"); } }
    catch { setStatus("error"); }
    e.target.value = "";
  };
  return (
    <div>
      <input ref={fileRef} type="file" accept=".txt,.pdf,.csv" onChange={handleFile} style={{ display: "none" }} />
      {status === "idle" && (
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: `1.5px dashed ${dm ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)"}`, background: "transparent", color: dm ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: SANS }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)"; e.currentTarget.style.color = dm ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)"; }}>
          Upload transcript to auto-import courses
        </button>
      )}
      {status === "reading" && <div style={{ fontSize: 13, color: palette(dm).textSub }}>Reading…</div>}
      {status === "error" && <div style={{ fontSize: 13, color: "#e74c3c" }}>Couldn't extract courses. Save as .txt and try again. <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: SANS }}>Retry</button></div>}
      {status === "results" && (
        <div style={{ ...glassCard(dm), borderRadius: 12, padding: 16, marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette(dm).text, marginBottom: 10 }}>Found {found.length} courses — select which to add:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {found.map(c => { const on = sel.includes(c); return (
              <button key={c} onClick={() => setSel(prev => on ? prev.filter(x => x !== c) : [...prev, c])} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${on ? ACCENT : "rgba(255,255,255,0.15)"}`, background: on ? "rgba(134,31,65,0.18)" : "transparent", color: on ? ACCENT : palette(dm).textSub, cursor: "pointer", fontFamily: SANS }}>{c}</button>
            ); })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onCoursesFound(sel); setStatus("idle"); setFound([]); setSel([]); }} disabled={!sel.length} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS, opacity: sel.length ? 1 : 0.5 }}>Add {sel.length} course{sel.length !== 1 ? "s" : ""}</button>
            <button onClick={() => { setStatus("idle"); setFound([]); setSel([]); }} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: palette(dm).textSub, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LinkedIn import ────────────────────────────────────────────────
function LinkedInImport({ onImport, dm }) {
  const [status, setStatus]   = useState("idle");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const p = palette(dm);

  const handleFile = async e => {
    const file = e.target.files[0]; if (!file) return;
    setStatus("parsing");
    try {
      const data = await parseLinkedInPDF(file);
      if (!data.firstName && !data.headline && !data.bio && !data.experience?.length) {
        setStatus("error");
      } else {
        setPreview(data); setStatus("preview");
      }
    } catch (err) {
      console.error("LinkedIn parse error:", err);
      setStatus("error");
    }
    e.target.value = "";
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} style={{ display: "none" }} />
      {status === "idle" && (
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1.5px solid rgba(0,119,181,0.5)", background: "rgba(0,119,181,0.08)", color: "#0077b5", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,119,181,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,119,181,0.08)"; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#0077b5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          Import from LinkedIn Profile PDF
        </button>
      )}
      {status === "parsing" && <div style={{ fontSize: 13, color: p.textSub, fontFamily: SANS }}>Reading your LinkedIn PDF…</div>}
      {status === "error" && (
        <div style={{ fontSize: 13, color: "#e74c3c", fontFamily: SANS }}>
          Couldn't extract profile data. Make sure you uploaded a LinkedIn profile PDF (Save to PDF from your profile page).{" "}
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: SANS }}>Try again</button>
        </div>
      )}
      {status === "preview" && preview && (
        <div style={{ ...glassCard(dm), borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0077b5", marginBottom: 12 }}>LINKEDIN IMPORT PREVIEW</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {preview.firstName && <div style={{ fontSize: 13, color: p.text }}><b>Name:</b> {preview.firstName} {preview.lastName}</div>}
            {preview.headline  && <div style={{ fontSize: 13, color: p.text }}><b>Headline:</b> {preview.headline}</div>}
            {preview.location  && <div style={{ fontSize: 13, color: p.text }}><b>Location:</b> {preview.location}</div>}
            {preview.bio       && <div style={{ fontSize: 13, color: p.text }}><b>Bio:</b> {preview.bio.slice(0, 120)}{preview.bio.length > 120 ? "…" : ""}</div>}
            {preview.experience?.length > 0 && <div style={{ fontSize: 13, color: p.text }}><b>Experience:</b> {preview.experience.length} position{preview.experience.length !== 1 ? "s" : ""}</div>}
            {preview.education?.length  > 0 && <div style={{ fontSize: 13, color: p.text }}><b>Education:</b> {preview.education.length} entr{preview.education.length !== 1 ? "ies" : "y"}</div>}
            {preview.interests?.length  > 0 && <div style={{ fontSize: 13, color: p.text }}><b>Skills:</b> {preview.interests.slice(0, 5).join(", ")}{preview.interests.length > 5 ? ` +${preview.interests.length - 5} more` : ""}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onImport(preview); setStatus("idle"); setPreview(null); }} style={{ background: "#0077b5", color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Apply to profile</button>
            <button onClick={() => { setStatus("idle"); setPreview(null); }} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: p.textSub, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: p.textMute, marginTop: 8, lineHeight: 1.5 }}>
        On LinkedIn: open your profile → More → Save to PDF
      </div>
    </div>
  );
}

// ── Glass section card ────────────────────────────────────────────
function SCard({ title, dm, onEdit, children }) {
  const p = palette(dm);
  return (
    <div style={{ ...glassCard(dm), borderRadius: 16, padding: "20px 24px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: p.text, fontFamily: SANS }}>{title}</span>
        {onEdit && (
          <button onClick={onEdit} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`, borderRadius: 8, padding: "5px 12px", color: dm ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: SANS }}
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
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || (user?.username?.[0] || "?").toUpperCase();
  if (user?.imageUrl && !user.imageUrl.includes("gravatar") && !user.imageUrl.endsWith("default")) {
    return <img src={user.imageUrl} alt="Profile" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "4px solid rgba(255,255,255,0.4)", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)", color: "white", fontWeight: 700, fontSize: Math.round(size * 0.34), display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid rgba(255,255,255,0.4)", flexShrink: 0 }}>{initials}</div>
  );
}

// ── Post card ─────────────────────────────────────────────────────
function PostCard({ post, dm, onDelete }) {
  const p = palette(dm);
  const typeInfo = POST_TYPES.find(t => t.key === post.post_type) || POST_TYPES[0];
  const ago = ts => {
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
    if (m < 1) return "just now"; if (m < 60) return `${m}m`; if (h < 24) return `${h}h`; if (dy < 7) return `${dy}d`;
    return new Date(ts).toLocaleDateString();
  };
  return (
    <div style={{ ...glassCard(dm), borderRadius: 16, padding: "18px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #6b1833, #861F41)", color: "white", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {(post.display_name || "?")[0]}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: p.text }}>{post.display_name}</div>
            <div style={{ fontSize: 11, color: p.textSub }}>{post.headline} · {ago(post.created_at)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: `${typeInfo.color}20`, color: typeInfo.color, border: `1px solid ${typeInfo.color}40`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{typeInfo.label}</span>
          <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: p.textMute, fontSize: 14, padding: "2px 4px", borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = "#e74c3c"}
            onMouseLeave={e => e.currentTarget.style.color = p.textMute}>✕</button>
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: p.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{post.content}</p>
      {post.image_url && (
        <img src={post.image_url} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 320, objectFit: "cover", marginBottom: 10 }}
          onError={e => { e.currentTarget.style.display = "none"; }} />
      )}
      {post.link_url && (
        <a href={post.link_url.startsWith("http") ? post.link_url : `https://${post.link_url}`} target="_blank" rel="noreferrer"
          style={{ display: "block", padding: "10px 14px", background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 10, border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, textDecoration: "none", fontSize: 13, color: p.textSub }}>
          🔗 {post.link_title || post.link_url}
        </a>
      )}
    </div>
  );
}

// ── Post composer ─────────────────────────────────────────────────
function PostComposer({ user, dm, onPost }) {
  const p = palette(dm);
  const [open, setOpen]        = useState(false);
  const [content, setContent]  = useState("");
  const [type, setType]        = useState("general");
  const [imageUrl, setImgUrl]  = useState("");
  const [linkUrl, setLinkUrl]  = useState("");
  const [linkTitle, setLTitle] = useState("");
  const [posting, setPosting]  = useState(false);
  const IS = { width: "100%", padding: "8px 12px", background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: 8, color: p.text, fontSize: 13, fontFamily: SANS, outline: "none", boxSizing: "border-box" };

  const submit = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      const post = await API.createPost({
        userId: user.id,
        displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "User",
        headline: user.unsafeMetadata?.headline || user.unsafeMetadata?.major || "",
        content: content.trim(), postType: type,
        imageUrl: imageUrl.trim(), linkUrl: linkUrl.trim(), linkTitle: linkTitle.trim(),
      });
      onPost(post);
      setContent(""); setType("general"); setImgUrl(""); setLinkUrl(""); setLTitle(""); setOpen(false);
    } catch (e) { console.error(e); }
    setPosting(false);
  };

  return (
    <div style={{ ...glassCard(dm), borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
      {!open ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center", cursor: "text" }} onClick={() => setOpen(true)}>
          <Avatar user={user} size={38} />
          <div style={{ flex: 1, padding: "10px 16px", background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: 24, color: p.textSub, fontSize: 14, fontFamily: SANS }}>
            Share an update, project, or research…
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {POST_TYPES.map(t => (
              <button key={t.key} onClick={() => setType(t.key)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${type === t.key ? t.color : (dm ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)")}`, background: type === t.key ? `${t.color}18` : "transparent", color: type === t.key ? t.color : p.textSub, cursor: "pointer", fontFamily: SANS }}>{t.label}</button>
            ))}
          </div>
          <textarea
            autoFocus value={content} onChange={e => setContent(e.target.value)}
            placeholder="What are you working on? Share a project, paper, experience, or update…"
            rows={4} style={{ ...IS, resize: "vertical", lineHeight: 1.6, padding: "12px 14px" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4 }}>Image URL (optional)</div>
              <input value={imageUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://…" style={IS} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4 }}>Link URL (optional)</div>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="github.com/…" style={IS} />
            </div>
          </div>
          {linkUrl && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4 }}>Link title</div>
              <input value={linkTitle} onChange={e => setLTitle(e.target.value)} placeholder="e.g. View on GitHub" style={IS} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: p.textSub, borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
            <button onClick={submit} disabled={!content.trim() || posting} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 10, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: content.trim() && !posting ? "pointer" : "default", fontFamily: SANS, opacity: content.trim() && !posting ? 1 : 0.5 }}>{posting ? "Posting…" : "Post"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────
function EditModal({ dm, onClose, onSave, saving, error, form, set, onLinkedInImport }) {
  const p = palette(dm);
  const IS = { width: "100%", padding: "10px 14px", background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 10, color: p.text, fontSize: 14, fontFamily: SANS, outline: "none", boxSizing: "border-box" };
  const LS = { fontSize: 11, fontWeight: 700, color: p.textSub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6, display: "block" };
  const SL = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: "2px", textTransform: "uppercase", marginTop: 20, marginBottom: 12, paddingTop: 16, borderTop: `1px solid ${dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` }}>{children}</div>;
  const onF = e => { e.currentTarget.style.borderColor = ACCENT; };
  const onB = e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"; };

  const addExp = () => set("experience", [...(form.experience || []), { company: "", title: "", location: "", startDate: "", endDate: "", current: false, description: "" }]);
  const updExp = (i, k, v) => set("experience", form.experience.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const delExp = (i) => set("experience", form.experience.filter((_, idx) => idx !== i));
  const addEdu = () => set("education", [...(form.education || []), { school: "", degree: "", field: "", startYear: "", endYear: "" }]);
  const updEdu = (i, k, v) => set("education", form.education.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const delEdu = (i) => set("education", form.education.filter((_, idx) => idx !== i));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...glassCard(dm), borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", padding: "32px", fontFamily: SANS }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: p.text }}>Edit Profile</h2>
          <button onClick={onClose} style={{ background: dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: "none", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, color: p.textSub }}>✕</button>
        </div>

        <div style={{ marginBottom: 20, padding: "14px 16px", background: "rgba(0,119,181,0.06)", border: "1px solid rgba(0,119,181,0.15)", borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0077b5", marginBottom: 10 }}>AUTO-FILL FROM LINKEDIN</div>
          <LinkedInImport dm={dm} onImport={onLinkedInImport} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SL>Identity</SL>
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

          <SL>Experience</SL>
          {(form.experience || []).map((exp, i) => (
            <div key={i} style={{ padding: "14px 16px", background: dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 12, border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.textSub }}>Position {i + 1}</span>
                <button onClick={() => delExp(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", fontSize: 13, padding: 0, fontFamily: SANS }}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={LS}>Company</label><input value={exp.company} onChange={e => updExp(i, "company", e.target.value)} placeholder="Google" style={IS} onFocus={onF} onBlur={onB} /></div>
                <div><label style={LS}>Title</label><input value={exp.title} onChange={e => updExp(i, "title", e.target.value)} placeholder="SWE Intern" style={IS} onFocus={onF} onBlur={onB} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><label style={LS}>Start</label><input value={exp.startDate} onChange={e => updExp(i, "startDate", e.target.value)} placeholder="Jun 2025" style={IS} onFocus={onF} onBlur={onB} /></div>
                <div><label style={LS}>End</label><input value={exp.endDate} onChange={e => updExp(i, "endDate", e.target.value)} placeholder="Aug 2025" disabled={exp.current} style={{ ...IS, opacity: exp.current ? 0.5 : 1 }} onFocus={onF} onBlur={onB} /></div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: p.textSub }}>
                    <input type="checkbox" checked={exp.current} onChange={e => updExp(i, "current", e.target.checked)} style={{ accentColor: ACCENT }} />
                    Current
                  </label>
                </div>
              </div>
              <div><label style={LS}>Description</label><textarea value={exp.description} onChange={e => updExp(i, "description", e.target.value)} placeholder="What did you do?" rows={2} style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} onFocus={onF} onBlur={onB} /></div>
            </div>
          ))}
          <button onClick={addExp} style={{ background: "none", border: `1.5px dashed ${dm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"}`, borderRadius: 10, padding: "9px", color: p.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: SANS, width: "100%" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"; e.currentTarget.style.color = p.textSub; }}>+ Add experience</button>

          <SL>Education</SL>
          {(form.education || []).map((edu, i) => (
            <div key={i} style={{ padding: "14px 16px", background: dm ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 12, border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.textSub }}>Education {i + 1}</span>
                <button onClick={() => delEdu(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e74c3c", fontSize: 13, padding: 0, fontFamily: SANS }}>Remove</button>
              </div>
              <div><label style={LS}>School</label><input value={edu.school} onChange={e => updEdu(i, "school", e.target.value)} placeholder="Virginia Tech" style={IS} onFocus={onF} onBlur={onB} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={LS}>Degree</label><input value={edu.degree} onChange={e => updEdu(i, "degree", e.target.value)} placeholder="B.S." style={IS} onFocus={onF} onBlur={onB} /></div>
                <div><label style={LS}>Field of Study</label><input value={edu.field} onChange={e => updEdu(i, "field", e.target.value)} placeholder="Computer Science" style={IS} onFocus={onF} onBlur={onB} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={LS}>Start Year</label><input value={edu.startYear} onChange={e => updEdu(i, "startYear", e.target.value)} placeholder="2023" style={IS} onFocus={onF} onBlur={onB} /></div>
                <div><label style={LS}>End Year</label><input value={edu.endYear} onChange={e => updEdu(i, "endYear", e.target.value)} placeholder="2027" style={IS} onFocus={onF} onBlur={onB} /></div>
              </div>
            </div>
          ))}
          <button onClick={addEdu} style={{ background: "none", border: `1.5px dashed ${dm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"}`, borderRadius: 10, padding: "9px", color: p.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: SANS, width: "100%" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"; e.currentTarget.style.color = p.textSub; }}>+ Add education</button>

          <SL>Skills & Interests</SL>
          <TagInput tags={form.interests} onChange={v => set("interests", v)} placeholder="Type an interest, press Enter…" suggestions={INTEREST_SUGGESTIONS} dm={dm} id="interests-input" />

          <SL>Hobbies</SL>
          <TagInput tags={form.hobbies} onChange={v => set("hobbies", v)} placeholder="Type a hobby, press Enter…" suggestions={HOBBY_SUGGESTIONS} dm={dm} id="hobbies-input" />

          <SL>Courses Taken</SL>
          <TagInput tags={form.coursesTaken} onChange={v => set("coursesTaken", v)} placeholder="e.g. CS 2114, MATH 2224…" dm={dm} id="courses-taken-input" />
          <TranscriptUpload dm={dm} onCoursesFound={courses => set("coursesTaken", [...new Set([...form.coursesTaken, ...courses])])} />
        </div>

        {error && <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", borderRadius: 8, color: "#e74c3c", fontSize: 13 }}>{error}</div>}

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
  const [isMobile, setIsMobile]           = useState(() => window.innerWidth < 768);
  const [bannerEditing, setBannerEditing] = useState(false);
  const [bannerSaving, setBannerSaving]   = useState(false);
  const [posts, setPosts]                 = useState([]);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    if (!bannerEditing) return;
    const close = e => {
      if (!e.target.closest("[data-banner-picker]") && !e.target.closest("[data-banner-trigger]")) setBannerEditing(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [bannerEditing]);

  useEffect(() => {
    if (!user?.id) return;
    API.getPosts(user.id).then(setPosts).catch(() => {});
  }, [user?.id]);

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
    experience: meta.experience || [],
    education:  meta.education  || [],
  });

  const [form, setForm] = useState(freshForm);
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleLinkedInImport = (data) => {
    setForm(f => ({
      ...f,
      firstName:  data.firstName || f.firstName,
      lastName:   data.lastName  || f.lastName,
      headline:   data.headline  || f.headline,
      bio:        data.bio       || f.bio,
      location:   data.location  || f.location,
      interests:  data.interests?.length ? [...new Set([...f.interests, ...data.interests])] : f.interests,
      experience: data.experience?.length ? data.experience : f.experience,
      education:  data.education?.length  ? data.education  : f.education,
    }));
  };

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
          experience: form.experience,
          education:  form.education,
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
  const startEdit = () => { setForm(freshForm()); setError(""); setEditing(true); };

  const Chip = ({ children }) => (
    <span style={{ background: "rgba(134,31,65,0.15)", color: ACCENT, border: "1px solid rgba(134,31,65,0.28)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, fontFamily: SANS }}>{children}</span>
  );

  const bannerPreset = BANNER_PRESETS.find(b => b.key === meta.bannerPreset) || BANNER_PRESETS[0];
  const bannerBg = meta.bannerUrl ? `url(${meta.bannerUrl}) center/cover no-repeat` : bannerPreset.style;

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", fontFamily: SANS, paddingBottom: 80 }}>

      {/* Cover banner */}
      <div data-banner-trigger style={{ background: bannerBg, height: isMobile ? 120 : 180, position: "relative", cursor: "pointer" }}
        onClick={() => setBannerEditing(v => !v)}>
        {!meta.bannerUrl && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(134,31,65,0.3) 0%, transparent 60%)" }} />}
        {bannerEditing && (
          <div data-banner-picker onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: -8, right: 14, transform: "translateY(100%)", zIndex: 50, background: dm ? "rgba(18,14,12,0.96)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.35)", minWidth: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Choose banner</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
              {BANNER_PRESETS.map(b => {
                const active = !meta.bannerUrl && (meta.bannerPreset || "vt-default") === b.key;
                return <button key={b.key} title={b.key} onClick={async () => { setBannerSaving(true); try { await user.update({ unsafeMetadata: { ...meta, bannerPreset: b.key, bannerUrl: "" } }); } finally { setBannerSaving(false); } }} style={{ height: 36, borderRadius: 8, cursor: "pointer", background: b.style, border: active ? "2.5px solid white" : "2px solid transparent", boxShadow: active ? "0 0 0 2px #861F41" : "none", padding: 0 }} />;
              })}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 6 }}>Or paste an image URL</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder="https://…" defaultValue={meta.bannerUrl || ""} id="banner-url-input" style={{ flex: 1, padding: "7px 10px", background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 8, color: p.text, fontSize: 12, fontFamily: SANS, outline: "none" }} />
              <button disabled={bannerSaving} onClick={async () => { const url = document.getElementById("banner-url-input")?.value?.trim(); setBannerSaving(true); try { await user.update({ unsafeMetadata: { ...meta, bannerUrl: url || "", bannerPreset: url ? "" : (meta.bannerPreset || "vt-default") } }); } finally { setBannerSaving(false); } }} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: bannerSaving ? "default" : "pointer", fontFamily: SANS, opacity: bannerSaving ? 0.7 : 1 }}>{bannerSaving ? "…" : "Apply"}</button>
            </div>
            <button onClick={() => setBannerEditing(false)} style={{ marginTop: 10, width: "100%", background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: 8, padding: "6px", color: p.textSub, fontSize: 12, cursor: "pointer", fontFamily: SANS }}>Done</button>
          </div>
        )}
      </div>

      {/* Profile header */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "0 16px" : "0 40px" }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "flex-end", gap: isMobile ? 12 : 20, marginTop: isMobile ? -44 : -56, paddingBottom: 20, borderBottom: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, position: "relative", zIndex: 2 }}>
          <div style={{ border: `4px solid ${dm ? "#0A0908" : "#FAF6F0"}`, borderRadius: "50%", flexShrink: 0 }}>
            <Avatar user={user} size={isMobile ? 72 : 96} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? 0 : 4 }}>
            <h1 style={{ margin: "0 0 4px", color: p.text, fontWeight: 400, fontSize: isMobile ? 22 : 28, fontFamily: SERIF, letterSpacing: "-0.4px" }}>{displayName}</h1>
            <div style={{ color: p.textSub, fontSize: 14, marginBottom: 4, fontWeight: 500 }}>{autoHeadline}</div>
            {meta.location && <div style={{ color: p.textMute, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {meta.location}
            </div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0, paddingBottom: 4 }}>
            <button onClick={startEdit} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS }} onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>Edit profile</button>
            <button onClick={() => openUserProfile()} style={{ background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`, color: p.textSub, borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Account</button>
            <button onClick={() => signOut()} style={{ background: "transparent", border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, color: p.textMute, borderRadius: 10, padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Sign out</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: 16, marginTop: 16, alignItems: "start" }}>

          {/* Main column */}
          <div>
            <PostComposer user={user} dm={dm} onPost={post => setPosts(prev => [post, ...prev])} />

            {meta.bio && (
              <SCard title="About" dm={dm} onEdit={startEdit}>
                <p style={{ margin: 0, fontSize: 14, color: p.text, lineHeight: 1.75 }}>{meta.bio}</p>
              </SCard>
            )}

            {(meta.experience || []).length > 0 && (
              <SCard title="Experience" dm={dm} onEdit={startEdit}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {meta.experience.map((exp, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < meta.experience.length - 1 ? 16 : 0, borderBottom: i < meta.experience.length - 1 ? `1px solid ${dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` : "none" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏢</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: p.text }}>{exp.title}</div>
                        <div style={{ fontSize: 13, color: p.textSub }}>{exp.company}{exp.location ? ` · ${exp.location}` : ""}</div>
                        <div style={{ fontSize: 12, color: p.textMute, marginTop: 2 }}>{exp.startDate}{exp.endDate || exp.current ? ` — ${exp.current ? "Present" : exp.endDate}` : ""}</div>
                        {exp.description && <p style={{ margin: "6px 0 0", fontSize: 13, color: p.textSub, lineHeight: 1.6 }}>{exp.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SCard>
            )}

            {(meta.education || []).length > 0 && (
              <SCard title="Education" dm={dm} onEdit={startEdit}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {meta.education.map((edu, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < meta.education.length - 1 ? 16 : 0, borderBottom: i < meta.education.length - 1 ? `1px solid ${dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` : "none" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎓</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: p.text }}>{edu.school}</div>
                        <div style={{ fontSize: 13, color: p.textSub }}>{[edu.degree, edu.field].filter(Boolean).join(" · ")}</div>
                        {(edu.startYear || edu.endYear) && <div style={{ fontSize: 12, color: p.textMute, marginTop: 2 }}>{edu.startYear}{edu.endYear ? ` — ${edu.endYear}` : ""}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </SCard>
            )}

            <SCard title="Skills & Interests" dm={dm} onEdit={startEdit}>
              {(meta.interests || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{meta.interests.map(t => <Chip key={t}>{t}</Chip>)}</div>
              ) : (
                <div style={{ color: p.textSub, fontSize: 14 }}>No interests yet. <button onClick={startEdit} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS }}>Add some →</button></div>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.coursesTaken.map(c => (
                    <span key={c} style={{ background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: p.text, fontFamily: "'JetBrains Mono', monospace" }}>{c}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: p.textSub, fontSize: 14 }}>No courses yet. <button onClick={startEdit} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS }}>Add or upload transcript →</button></div>
              )}
            </SCard>

            {posts.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: p.text, marginBottom: 12, fontFamily: SANS }}>Activity</div>
                {posts.map(post => (
                  <PostCard key={post.id} post={post} dm={dm} onDelete={async () => {
                    await API.deletePost(post.id).catch(() => {});
                    setPosts(prev => prev.filter(q => q.id !== post.id));
                  }} />
                ))}
              </div>
            )}

            {!meta.bio && !meta.experience?.length && !meta.education?.length && (
              <div style={{ ...glassCard(dm), borderRadius: 16, padding: "22px 24px", marginBottom: 12, textAlign: "center" }}>
                <div style={{ color: p.textSub, fontSize: 14, marginBottom: 12 }}>Your profile is looking bare. Add a bio, experience, and courses.</div>
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
                    <a key={label} href={href?.startsWith("http") || href?.startsWith("mailto") ? href : `https://${href}`}
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
        <EditModal dm={dm} onClose={() => setEditing(false)} onSave={save} saving={saving} error={error} form={form} set={set} onLinkedInImport={handleLinkedInImport} />
      )}
    </div>
  );
}
