// Profile page — LinkedIn-style with posts, experience, education, LinkedIn import
import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;
import { API } from "../api.js";
import { glassCard, palette, ACCENT, SANS, SERIF, MONO, RADIUS, SHADOW } from "../theme.jsx";
import { Skeleton, SkeletonAvatar, SkeletonButton, SkeletonCard, SkeletonText, useMinimumLoading } from "./skeletons.jsx";

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
const VT_SEAL_SRC = "/images/virginia-tech-seal.webp";
const INTEREST_SUGGESTIONS = [
  "Machine Learning","Web Development","Systems Programming","Cybersecurity","Data Science",
  "Mobile Apps","Game Development","Robotics","Research","Startups","Open Source",
  "Cloud Computing","Competitive Programming","Finance / Quant","Product Management",
];

const schoolMarkFor = school =>
  /virginia\s*tech|virginia\s+polytechnic|\bvt\b/i.test(school || "") ? VT_SEAL_SRC : "";
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
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1.5px solid rgba(134,31,65,0.35)", background: "rgba(134,31,65,0.08)", color: ACCENT, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(134,31,65,0.14)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(134,31,65,0.08)"; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>
          Import profile PDF
        </button>
      )}
      {status === "parsing" && <div style={{ fontSize: 13, color: p.textSub, fontFamily: SANS }}>Reading your LinkedIn PDF…</div>}
      {status === "error" && (
        <div style={{ fontSize: 13, color: "#e74c3c", fontFamily: SANS }}>
          Couldn't extract profile data. Make sure you uploaded a profile export PDF.{" "}
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: SANS }}>Try again</button>
        </div>
      )}
      {status === "preview" && preview && (
        <div style={{ ...glassCard(dm), borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: ACCENT, marginBottom: 12, letterSpacing: "1.4px", textTransform: "uppercase" }}>Profile import preview</div>
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
            <button onClick={() => { onImport(preview); setStatus("idle"); setPreview(null); }} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Apply to profile</button>
            <button onClick={() => { setStatus("idle"); setPreview(null); }} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: p.textSub, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: p.textMute, marginTop: 8, lineHeight: 1.5 }}>
        Local parsing only. No scraping or external profile import is performed.
      </div>
    </div>
  );
}

// ── Glass section card ────────────────────────────────────────────
function EditGlyph({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
    </svg>
  );
}

function PlusGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function SCard({ title, dm, onEdit, onAdd, children, footer }) {
  const p = palette(dm);
  return (
    <section style={{
      background: dm ? "rgba(18,18,18,0.92)" : "#fff",
      border: `1px solid ${p.line}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: "hidden",
      boxShadow: dm ? "0 14px 36px rgba(0,0,0,0.22)" : "0 1px 2px rgba(26,18,15,0.06)",
      color: p.text,
      transition: "background 0.24s ease, color 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease",
    }}>
      <div style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
          <h2 style={{ margin: 0, color: p.text, fontSize: 21, fontWeight: 780, letterSpacing: -0.25, fontFamily: SANS }}>{title}</h2>
          {(onAdd || onEdit) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {onAdd && (
                <button aria-label={`Add ${title}`} onClick={onAdd} style={{
                  background: "transparent", border: "none", borderRadius: "50%",
                  width: 34, height: 34, color: p.textSub, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = p.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = p.textSub; }}>
                  <PlusGlyph />
                </button>
              )}
              {onEdit && (
                <button aria-label={`Edit ${title}`} onClick={onEdit} style={{
                  background: "transparent", border: "none", borderRadius: "50%",
                  width: 34, height: 34, color: p.textSub, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = p.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = p.textSub; }}>
                  <EditGlyph />
                </button>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
      {footer && (
        <div style={{ borderTop: `1px solid ${p.line}`, padding: "12px 20px", textAlign: "center" }}>
          {footer}
        </div>
      )}
    </section>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ user, size = 80 }) {
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map(n => n[0]).join("") || (user?.username?.[0] || "?").toUpperCase();
  if (user?.imageUrl && !user.imageUrl.includes("gravatar") && !user.imageUrl.endsWith("default")) {
    return <img src={user.imageUrl} alt="Profile" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "4px solid rgba(255,255,255,0.96)", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #6b1833 0%, #861F41 55%, #b03060 100%)", color: "white", fontWeight: 700, fontSize: Math.round(size * 0.34), display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid rgba(255,255,255,0.96)", flexShrink: 0 }}>{initials}</div>
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
    <div style={{ ...glassCard(dm), borderRadius: RADIUS.lg, padding: "18px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #6b1833, #861F41)", color: "white", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {(post.display_name || "?")[0]}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: p.text, fontFamily: SANS }}>{post.display_name}</div>
            <div style={{ fontSize: 11, color: p.textSub, fontFamily: SANS }}>{post.headline} · {ago(post.created_at)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            background: `${typeInfo.color}18`,
            color: typeInfo.color,
            border: `1px solid ${typeInfo.color}35`,
            borderRadius: RADIUS.pill,
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 600,
            fontFamily: MONO,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
          }}>{typeInfo.label}</span>
          <button onClick={onDelete} style={{
            background: "none", border: "none", cursor: "pointer",
            color: p.textMute, fontSize: 16, padding: "2px 4px", lineHeight: 1,
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#e74c3c"}
            onMouseLeave={e => e.currentTarget.style.color = p.textMute}>×</button>
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: p.text, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: SANS }}>{post.content}</p>
      {post.image_url && (
        <img src={post.image_url} alt="" style={{ width: "100%", borderRadius: RADIUS.md, maxHeight: 320, objectFit: "cover", marginBottom: 10 }}
          onError={e => { e.currentTarget.style.display = "none"; }} />
      )}
      {post.link_url && (
        <a href={post.link_url.startsWith("http") ? post.link_url : `https://${post.link_url}`} target="_blank" rel="noreferrer"
          style={{ display: "block", padding: "10px 14px", background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: RADIUS.sm, border: `1px solid ${dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, textDecoration: "none", fontSize: 13, color: p.textSub, fontFamily: SANS }}>
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
    <div style={{ ...glassCard(dm), borderRadius: RADIUS.lg, padding: "18px 20px", marginBottom: 16 }}>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4, fontFamily: SANS }}>Image URL (optional)</div>
              <input value={imageUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://…" style={IS} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4, fontFamily: SANS }}>Link URL (optional)</div>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="github.com/…" style={IS} />
            </div>
          </div>
          {linkUrl && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 4, fontFamily: SANS }}>Link title</div>
              <input value={linkTitle} onChange={e => setLTitle(e.target.value)} placeholder="e.g. View on GitHub" style={IS} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, color: p.textSub, borderRadius: RADIUS.sm, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
            <button onClick={submit} disabled={!content.trim() || posting} style={{ background: ACCENT, color: "white", border: "none", borderRadius: RADIUS.sm, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: content.trim() && !posting ? "pointer" : "default", fontFamily: SANS, opacity: content.trim() && !posting ? 1 : 0.5 }}>{posting ? "Posting…" : "Post"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSkeleton({ darkMode, isMobile }) {
  return (
    <div aria-busy="true" style={{ minHeight: "calc(100vh - 60px)", padding: isMobile ? "16px" : "24px 32px 72px", maxWidth: 1180, margin: "0 auto" }}>
      <SkeletonCard darkMode={darkMode} style={{ padding: 0, overflow: "hidden", borderRadius: 10, marginBottom: 16 }}>
        <Skeleton darkMode={darkMode} height={isMobile ? 120 : 190} radius={0} />
        <div style={{ padding: "0 22px 22px" }}>
          <SkeletonAvatar darkMode={darkMode} size={isMobile ? 92 : 136} radius={999} style={{ marginTop: isMobile ? -46 : -68, border: "4px solid transparent" }} />
          <Skeleton darkMode={darkMode} width={220} height={28} style={{ marginTop: 14, marginBottom: 10 }} />
          <SkeletonText darkMode={darkMode} lines={2} widths={["72%", "42%"]} />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <SkeletonButton darkMode={darkMode} width={112} />
            <SkeletonButton darkMode={darkMode} width={120} />
            <SkeletonButton darkMode={darkMode} width={96} />
          </div>
        </div>
      </SkeletonCard>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 330px", gap: 16 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <SkeletonCard key={i} darkMode={darkMode} style={{ borderRadius: 10, minHeight: i === 1 ? 210 : 140 }}>
              <Skeleton darkMode={darkMode} width="32%" height={22} style={{ marginBottom: 18 }} />
              <SkeletonText darkMode={darkMode} lines={i === 1 ? 5 : 3} />
            </SkeletonCard>
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2].map(i => (
            <SkeletonCard key={i} darkMode={darkMode} style={{ borderRadius: 10, minHeight: 128 }}>
              <SkeletonText darkMode={darkMode} lines={4} widths={["70%", "95%", "86%", "54%"]} />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children, action }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.72 }}>
      {children} {action}
    </div>
  );
}

function CompanyMark({ label, src, dm }) {
  return src ? (
    <img src={src} alt="" style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{
      width: 50, height: 50, borderRadius: 8, flexShrink: 0,
      background: dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: ACCENT, fontWeight: 800, fontSize: 16,
    }}>
      {(label || "D").slice(0, 1).toUpperCase()}
    </div>
  );
}

function ItemRow({ dm, title, subtitle, meta, description, mark, last }) {
  const p = palette(dm);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: last ? 0 : 18, borderBottom: last ? "none" : `1px solid ${p.line}`, marginBottom: last ? 0 : 18 }}>
      <CompanyMark label={title || subtitle} src={mark} dm={dm} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 760, color: p.text, lineHeight: 1.32 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, color: p.text, opacity: 0.84, lineHeight: 1.35, marginTop: 2 }}>{subtitle}</div>}
        {meta && <div style={{ fontSize: 13, color: p.textSub, marginTop: 3, lineHeight: 1.35 }}>{meta}</div>}
        {description && <p style={{ margin: "10px 0 0", fontSize: 14, color: p.text, opacity: 0.86, lineHeight: 1.58 }}>{description}</p>}
      </div>
    </div>
  );
}

function SidebarCard({ dm, title, children }) {
  const p = palette(dm);
  return (
    <aside style={{
      background: dm ? "rgba(18,18,18,0.92)" : "#fff",
      border: `1px solid ${p.line}`,
      borderRadius: 10,
      padding: "18px 20px",
      marginBottom: 10,
      boxShadow: dm ? "0 14px 36px rgba(0,0,0,0.18)" : "0 1px 2px rgba(26,18,15,0.06)",
      color: p.text,
      transition: "background 0.24s ease, color 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease",
    }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 17, color: p.text, fontWeight: 760 }}>{title}</h3>
      {children}
    </aside>
  );
}

// ── Edit modal ────────────────────────────────────────────────────
function EditModal({ dm, onClose, onSave, saving, error, form, set, onLinkedInImport }) {
  const p = palette(dm);
  const IS = { width: "100%", padding: "10px 14px", background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 10, color: p.text, fontSize: 14, fontFamily: SANS, outline: "none", boxSizing: "border-box" };
  const LS = { fontSize: 11, fontWeight: 700, color: p.textSub, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6, display: "block" };
  const SL = ({ children }) => <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "1.4px", textTransform: "uppercase", color: ACCENT, marginTop: 20, marginBottom: 12, paddingTop: 16, borderTop: `1px solid ${dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` }}>{children}</div>;
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

        <div style={{ marginBottom: 20, padding: "14px 16px", background: "rgba(134,31,65,0.06)", border: "1px solid rgba(134,31,65,0.15)", borderRadius: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "1.4px", textTransform: "uppercase", color: ACCENT, marginBottom: 10 }}>Optional import</div>
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
          <div>
            <label style={LS}>Profile visibility</label>
            {/* TODO: Apply this preference to public/non-owner profile routing when social profiles ship. */}
            <select value={form.profileVisibility || "darvis"} onChange={e => set("profileVisibility", e.target.value)} style={{ ...IS, appearance: "none", cursor: "pointer" }} onFocus={onF} onBlur={onB}>
              <option value="public" style={{ color: "black", background: "white" }}>Public</option>
              <option value="darvis" style={{ color: "black", background: "white" }}>Darvis users only</option>
              <option value="private" style={{ color: "black", background: "white" }}>Only me</option>
            </select>
          </div>

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
          <button onClick={onSave} disabled={saving} style={{ background: ACCENT, color: "white", border: "none", borderRadius: RADIUS.sm, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: SANS, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
          <button onClick={onClose} style={{ background: "none", color: p.textSub, border: `1.5px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: RADIUS.sm, padding: "11px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function InlineSectionEditor({ section, dm, form, set, onSave, onCancel, saving, error }) {
  const p = palette(dm);
  const IS = { width: "100%", padding: "9px 12px", background: dm ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)", border: `1px solid ${dm ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 9, color: p.text, fontSize: 13, fontFamily: SANS, outline: "none", boxSizing: "border-box" };
  const LS = { fontSize: 10, fontWeight: 800, color: p.textSub, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 5, display: "block" };
  const panel = { display: "grid", gap: 12, padding: 14, borderRadius: 12, background: dm ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.03)", border: `1px solid ${p.line}` };
  const row2 = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
  const row3 = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };
  const addExp = () => set("experience", [...(form.experience || []), { company: "", title: "", location: "", startDate: "", endDate: "", current: false, description: "" }]);
  const updExp = (i, k, v) => set("experience", form.experience.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const delExp = i => set("experience", form.experience.filter((_, idx) => idx !== i));
  const addEdu = () => set("education", [...(form.education || []), { school: "", degree: "", field: "", startYear: "", endYear: "" }]);
  const updEdu = (i, k, v) => set("education", form.education.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const delEdu = i => set("education", form.education.filter((_, idx) => idx !== i));

  const Field = ({ label, children }) => <div><label style={LS}>{label}</label>{children}</div>;
  const Actions = () => (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
      <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${p.line}`, color: p.textSub, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ background: ACCENT, border: "none", color: "white", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.72 : 1, fontFamily: SANS }}>{saving ? "Saving..." : "Save"}</button>
    </div>
  );

  let body = null;
  if (section === "about") {
    body = <Field label="About"><textarea rows={5} value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Tell people about yourself..." style={{ ...IS, resize: "vertical", lineHeight: 1.6 }} /></Field>;
  } else if (section === "academic") {
    body = (
      <>
        <div style={row2}>
          <Field label="Major"><input list="majors-inline" value={form.major} onChange={e => set("major", e.target.value)} placeholder="Computer Science" style={IS} /><datalist id="majors-inline">{MAJORS.map(m => <option key={m} value={m} />)}</datalist></Field>
          <Field label="Minor"><input value={form.minor} onChange={e => set("minor", e.target.value)} placeholder="Mathematics" style={IS} /></Field>
        </div>
        <div style={row3}>
          <Field label="Year"><select value={form.year} onChange={e => set("year", e.target.value)} style={IS}><option value="">Select</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
          <Field label="Current term"><select value={form.term} onChange={e => set("term", e.target.value)} style={IS}><option value="">Select</option>{TERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Graduation"><select value={form.gradTerm} onChange={e => set("gradTerm", e.target.value)} style={IS}><option value="">Select</option>{GRAD_TERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
        </div>
      </>
    );
  } else if (section === "experience") {
    body = (
      <>
        {(form.experience || []).map((exp, i) => (
          <div key={i} style={{ display: "grid", gap: 10, padding: 12, borderRadius: 10, border: `1px solid ${p.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: p.text, fontSize: 13 }}>Experience {i + 1}</strong>
              <button onClick={() => delExp(i)} style={{ background: "transparent", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: SANS }}>Remove</button>
            </div>
            <div style={row2}>
              <Field label="Title"><input value={exp.title} onChange={e => updExp(i, "title", e.target.value)} placeholder="Role" style={IS} /></Field>
              <Field label="Company"><input value={exp.company} onChange={e => updExp(i, "company", e.target.value)} placeholder="Organization" style={IS} /></Field>
            </div>
            <div style={row3}>
              <Field label="Location"><input value={exp.location} onChange={e => updExp(i, "location", e.target.value)} placeholder="Remote" style={IS} /></Field>
              <Field label="Start"><input value={exp.startDate} onChange={e => updExp(i, "startDate", e.target.value)} placeholder="Jun 2026" style={IS} /></Field>
              <Field label="End"><input value={exp.current ? "Present" : exp.endDate} disabled={exp.current} onChange={e => updExp(i, "endDate", e.target.value)} placeholder="Aug 2026" style={{ ...IS, opacity: exp.current ? 0.6 : 1 }} /></Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 7, color: p.textSub, fontSize: 12, cursor: "pointer" }}><input type="checkbox" checked={!!exp.current} onChange={e => updExp(i, "current", e.target.checked)} style={{ accentColor: ACCENT }} /> Current role</label>
            <Field label="Description"><textarea rows={3} value={exp.description} onChange={e => updExp(i, "description", e.target.value)} placeholder="What did you do?" style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} /></Field>
          </div>
        ))}
        <button onClick={addExp} style={{ background: "transparent", border: `1px dashed ${p.line}`, color: p.textSub, borderRadius: 9, padding: 10, cursor: "pointer", fontWeight: 700, fontFamily: SANS }}>Add experience</button>
      </>
    );
  } else if (section === "education") {
    body = (
      <>
        {(form.education || []).map((edu, i) => (
          <div key={i} style={{ display: "grid", gap: 10, padding: 12, borderRadius: 10, border: `1px solid ${p.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: p.text, fontSize: 13 }}>Education {i + 1}</strong>
              <button onClick={() => delEdu(i)} style={{ background: "transparent", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: SANS }}>Remove</button>
            </div>
            <Field label="School"><input value={edu.school} onChange={e => updEdu(i, "school", e.target.value)} placeholder="School" style={IS} /></Field>
            <div style={row2}>
              <Field label="Degree"><input value={edu.degree} onChange={e => updEdu(i, "degree", e.target.value)} placeholder="B.S." style={IS} /></Field>
              <Field label="Field"><input value={edu.field} onChange={e => updEdu(i, "field", e.target.value)} placeholder="Computer Science" style={IS} /></Field>
            </div>
            <div style={row2}>
              <Field label="Start year"><input value={edu.startYear} onChange={e => updEdu(i, "startYear", e.target.value)} placeholder="2024" style={IS} /></Field>
              <Field label="End year"><input value={edu.endYear} onChange={e => updEdu(i, "endYear", e.target.value)} placeholder="2027" style={IS} /></Field>
            </div>
          </div>
        ))}
        <button onClick={addEdu} style={{ background: "transparent", border: `1px dashed ${p.line}`, color: p.textSub, borderRadius: 9, padding: 10, cursor: "pointer", fontWeight: 700, fontFamily: SANS }}>Add education</button>
      </>
    );
  } else if (section === "skills") {
    body = <TagInput tags={form.interests} onChange={v => set("interests", v)} placeholder="Type a skill, press Enter..." suggestions={INTEREST_SUGGESTIONS} dm={dm} id="profile-inline-skills" />;
  } else if (section === "clubs") {
    body = <TagInput tags={form.hobbies} onChange={v => set("hobbies", v)} placeholder="Type a club or interest, press Enter..." suggestions={HOBBY_SUGGESTIONS} dm={dm} id="profile-inline-clubs" />;
  } else if (section === "courses") {
    body = (
      <>
        <TagInput tags={form.coursesTaken} onChange={v => set("coursesTaken", v)} placeholder="e.g. CS 2114, MATH 2224..." dm={dm} id="profile-inline-courses" />
        <TranscriptUpload dm={dm} onCoursesFound={courses => set("coursesTaken", [...new Set([...form.coursesTaken, ...courses])])} />
      </>
    );
  }

  return (
    <div style={panel}>
      {body}
      {error && <div style={{ color: "#e74c3c", fontSize: 13, lineHeight: 1.45 }}>{error}</div>}
      <Actions />
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
  const [editingSection, setEditingSection] = useState("");
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");
  const [isMobile, setIsMobile]           = useState(() => window.innerWidth < 768);
  const [bannerEditing, setBannerEditing] = useState(false);
  const [bannerSaving, setBannerSaving]   = useState(false);
  const [posts, setPosts]                 = useState([]);
  const [postsLoading, setPostsLoading]   = useState(false);
  const [postsError, setPostsError]       = useState("");

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
    setPostsLoading(true);
    setPostsError("");
    API.getPosts(user.id)
      .then(setPosts)
      .catch(() => setPostsError("Activity could not be loaded."))
      .finally(() => setPostsLoading(false));
  }, [user?.id]);
  const showPostsLoading = useMinimumLoading(postsLoading);

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
    profileVisibility: meta.profileVisibility || "darvis",
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
          hobbies: form.hobbies, profileVisibility: form.profileVisibility,
          linkedIn: form.linkedIn,
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

  const startEdit = () => { setForm(freshForm()); setError(""); setEditing(true); setEditingSection(""); };
  const startSectionEdit = section => { setForm(freshForm()); setError(""); setEditing(false); setEditingSection(section); };
  const cancelSectionEdit = () => { setError(""); setEditingSection(""); setForm(freshForm()); };
  const saveSection = async () => {
    setSaving(true); setError("");
    try {
      await user.update({
        unsafeMetadata: {
          ...meta, onboardingComplete: true,
          major: form.major, minor: form.minor,
          year: form.year, term: form.term,
          gpa: form.gpa, gradTerm: form.gradTerm,
          interests: form.interests, coursesTaken: form.coursesTaken,
          bio: form.bio, location: form.location, headline: form.headline,
          hobbies: form.hobbies, profileVisibility: form.profileVisibility,
          linkedIn: form.linkedIn,
          github: form.github, website: form.website,
          experience: form.experience,
          education:  form.education,
        },
      });
      setEditingSection("");
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || e?.message || "Something went wrong.");
    }
    setSaving(false);
  };

  if (!isLoaded) return <ProfileSkeleton darkMode={dm} isMobile={isMobile} />;
  if (!user) {
    return (
      <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: SANS }}>
        <SkeletonCard darkMode={dm} style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ color: p.text, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Profile unavailable</div>
          <div style={{ color: p.textSub, fontSize: 14 }}>Sign in again to view your Darvis profile.</div>
        </SkeletonCard>
      </div>
    );
  }

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "Darvis Student";
  const school = meta.school || "Virginia Tech";
  const schoolMark = schoolMarkFor(school);
  const autoHeadline = meta.headline || [meta.major || "Student", school].filter(Boolean).join(" at ");
  const completionItems = [
    !!displayName,
    !!meta.headline,
    !!meta.bio,
    !!meta.major,
    !!meta.gradTerm,
    (meta.interests || []).length > 0,
    (meta.experience || []).length > 0,
    (meta.education || []).length > 0,
  ];
  const completion = Math.round((completionItems.filter(Boolean).length / completionItems.length) * 100);
  const visibilityLabel = meta.profileVisibility === "public" ? "Public" : meta.profileVisibility === "private" ? "Only me" : "Darvis users only";
  const email = user?.emailAddresses?.[0]?.emailAddress;

  const Chip = ({ children }) => (
    <span style={{ background: "rgba(134,31,65,0.15)", color: ACCENT, border: "1px solid rgba(134,31,65,0.28)", borderRadius: RADIUS.pill, padding: "5px 14px", fontSize: 12, fontWeight: 700, fontFamily: SANS }}>{children}</span>
  );

  const bannerPreset = BANNER_PRESETS.find(b => b.key === meta.bannerPreset) || BANNER_PRESETS[0];
  const bannerBg = meta.bannerUrl ? `url(${meta.bannerUrl}) center/cover no-repeat` : bannerPreset.style;
  const profileUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareProfile = () => {
    const text = `${displayName} on Darvis`;
    if (navigator.share) navigator.share({ title: text, url: profileUrl }).catch(() => {});
    else navigator.clipboard?.writeText(profileUrl).catch(() => {});
  };

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", fontFamily: SANS, padding: isMobile ? "14px 12px 80px" : "24px 28px 88px", background: dm ? "#000" : "#f3f2ef", color: p.text, transition: "background 0.24s ease, color 0.24s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>

        <section style={{
          background: dm ? "rgba(18,18,18,0.94)" : "#fff",
          border: `1px solid ${p.line}`,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 10,
          boxShadow: dm ? "0 18px 50px rgba(0,0,0,0.26)" : "0 1px 2px rgba(26,18,15,0.08)",
          color: p.text,
          transition: "background 0.24s ease, color 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease",
        }}>
          <div data-banner-trigger style={{ background: bannerBg, height: isMobile ? 138 : 214, position: "relative", cursor: "pointer" }}
            onClick={() => setBannerEditing(v => !v)}>
            {!meta.bannerUrl && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 28% 50%, rgba(255,255,255,0.12) 0%, transparent 52%), linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.22))" }} />}
            <button type="button" aria-label="Edit cover image" onClick={e => { e.stopPropagation(); setBannerEditing(v => !v); }} style={{
              position: "absolute", right: 22, bottom: 18,
              width: 40, height: 40, borderRadius: "50%",
              border: "none", background: "rgba(255,255,255,0.92)",
              color: "#1f1f1f", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
            }}>
              <EditGlyph size={18} />
            </button>
            {bannerEditing && (
              <div data-banner-picker onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 12, right: 68, zIndex: 50, background: dm ? "rgba(18,18,18,0.98)" : "rgba(255,255,255,0.98)", backdropFilter: "blur(20px)", border: `1px solid ${p.line}`, borderRadius: 10, padding: 16, boxShadow: SHADOW.xl, minWidth: isMobile ? 250 : 310 }}>
                <div style={{ fontSize: 13, fontWeight: 760, color: p.text, marginBottom: 12 }}>Choose cover</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                  {BANNER_PRESETS.map(b => {
                    const active = !meta.bannerUrl && (meta.bannerPreset || "vt-default") === b.key;
                    return <button key={b.key} title={b.key} onClick={async () => { setBannerSaving(true); try { await user.update({ unsafeMetadata: { ...meta, bannerPreset: b.key, bannerUrl: "" } }); } finally { setBannerSaving(false); } }} style={{ height: 36, borderRadius: 8, cursor: "pointer", background: b.style, border: active ? "2.5px solid white" : "2px solid transparent", boxShadow: active ? "0 0 0 2px #861F41" : "none", padding: 0 }} />;
                  })}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: p.textSub, marginBottom: 6 }}>Image URL</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="https://..." defaultValue={meta.bannerUrl || ""} id="banner-url-input" style={{ flex: 1, minWidth: 0, padding: "8px 10px", background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${p.line}`, borderRadius: 8, color: p.text, fontSize: 12, fontFamily: SANS, outline: "none" }} />
                  <button disabled={bannerSaving} onClick={async () => { const url = document.getElementById("banner-url-input")?.value?.trim(); setBannerSaving(true); try { await user.update({ unsafeMetadata: { ...meta, bannerUrl: url || "", bannerPreset: url ? "" : (meta.bannerPreset || "vt-default") } }); } finally { setBannerSaving(false); } }} style={{ background: ACCENT, color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: bannerSaving ? "default" : "pointer", fontFamily: SANS, opacity: bannerSaving ? 0.7 : 1 }}>{bannerSaving ? "..." : "Apply"}</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: isMobile ? "0 18px 20px" : "0 28px 28px", position: "relative" }}>
            <div style={{ marginTop: isMobile ? -54 : -76, marginBottom: 12, width: isMobile ? 112 : 154, height: isMobile ? 112 : 154, borderRadius: "50%", background: dm ? "#121212" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={user} size={isMobile ? 104 : 146} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto", gap: 20, alignItems: "start" }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: "0 0 5px", color: p.text, fontWeight: 760, fontSize: isMobile ? 27 : 32, letterSpacing: -0.6 }}>{displayName}</h1>
                <div style={{ color: p.text, fontSize: 17, lineHeight: 1.4, marginBottom: 7 }}>{autoHeadline}</div>
                <div style={{ color: p.textSub, fontSize: 14, lineHeight: 1.55 }}>
                  {[school, meta.major, meta.gradTerm ? `Expected ${meta.gradTerm}` : null].filter(Boolean).join(" · ")}
                </div>
                <div style={{ color: p.textSub, fontSize: 14, lineHeight: 1.55 }}>
                  {[meta.location || "Blacksburg, VA", meta.year].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                  <button onClick={startEdit} style={{ background: "#0a66c2", color: "white", border: "none", borderRadius: RADIUS.pill, padding: "8px 18px", fontWeight: 760, fontSize: 14, cursor: "pointer", fontFamily: SANS }}>Edit profile</button>
                  <button onClick={shareProfile} style={{ background: "transparent", border: `1.5px solid ${dm ? "rgba(255,255,255,0.36)" : "#0a66c2"}`, color: dm ? p.text : "#0a66c2", borderRadius: RADIUS.pill, padding: "7px 17px", fontWeight: 760, fontSize: 14, cursor: "pointer", fontFamily: SANS }}>Share profile</button>
                  <button onClick={() => openUserProfile()} style={{ background: "transparent", border: `1.5px solid ${p.line}`, color: p.textSub, borderRadius: RADIUS.pill, padding: "7px 17px", fontWeight: 760, fontSize: 14, cursor: "pointer", fontFamily: SANS }}>Account</button>
                </div>
              </div>
              <div style={{ minWidth: isMobile ? 0 : 250, display: "grid", gap: 9, alignSelf: "end", justifyItems: isMobile ? "start" : "end", textAlign: isMobile ? "left" : "right" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: p.text, fontWeight: 760, fontSize: 15, justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                  {schoolMark ? (
                    <img src={schoolMark} alt="" style={{ width: 38, height: 38, borderRadius: "50%", background: "white", objectFit: "cover" }} />
                  ) : (
                    <CompanyMark label={school} dm={dm} />
                  )}
                  {school}
                </div>
                <div style={{ fontSize: 12, color: p.textSub, lineHeight: 1.5, padding: "5px 10px", border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}>
                  Profile visibility: <strong style={{ color: p.text }}>{visibilityLabel}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 330px", gap: 16, alignItems: "start" }}>

          {/* Main column */}
          <div>
            <PostComposer user={user} dm={dm} onPost={post => setPosts(prev => [post, ...prev])} />

            <SCard title="About" dm={dm} onEdit={() => startSectionEdit("about")}>
              {editingSection === "about" ? (
                <InlineSectionEditor section="about" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : meta.bio ? (
                <p style={{ margin: 0, fontSize: 14, color: p.text, lineHeight: 1.75, fontFamily: SANS }}>{meta.bio}</p>
              ) : (
                <EmptyState action={<button onClick={() => startSectionEdit("about")} style={{ background: "none", border: "none", color: "#0a66c2", cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS, fontWeight: 760 }}>Add an about section</button>}>No bio yet.</EmptyState>
              )}
            </SCard>

            <SCard title="Academic Info" dm={dm} onEdit={() => startSectionEdit("academic")}>
              {editingSection === "academic" ? (
                <InlineSectionEditor section="academic" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {[
                  ["School", school],
                  ["Major", meta.major],
                  ["Minor", meta.minor],
                  ["Class year", meta.year],
                  ["Current term", meta.term],
                  ["Graduation", meta.gradTerm],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: "12px 14px", borderRadius: 8, background: dm ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)", border: `1px solid ${p.line}` }}>
                    <div style={{ fontSize: 12, color: p.textSub, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, color: value ? p.text : p.textMute, fontWeight: 720 }}>{value || "Not added"}</div>
                  </div>
                ))}
              </div>}
            </SCard>

            <SCard title="Activity" dm={dm} footer={posts.length > 2 ? <span style={{ color: p.textSub, fontWeight: 760 }}>Showing recent activity</span> : null}>
              {showPostsLoading ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <SkeletonCard darkMode={dm}><SkeletonText darkMode={dm} lines={3} /></SkeletonCard>
                  <SkeletonCard darkMode={dm}><SkeletonText darkMode={dm} lines={3} /></SkeletonCard>
                </div>
              ) : postsError ? (
                <EmptyState>{postsError}</EmptyState>
              ) : posts.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>{posts.slice(0, 3).map(post => (
                  <PostCard key={post.id} post={post} dm={dm} onDelete={async () => {
                    await API.deletePost(post.id).catch(() => {});
                    setPosts(prev => prev.filter(q => q.id !== post.id));
                  }} />
                ))}</div>
              ) : (
                <EmptyState>No recent activity yet.</EmptyState>
              )}
            </SCard>

            <SCard title="Experience" dm={dm} onEdit={() => startSectionEdit("experience")} onAdd={() => startSectionEdit("experience")}>
              {editingSection === "experience" ? (
                <InlineSectionEditor section="experience" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : (meta.experience || []).length > 0 ? meta.experience.map((exp, i) => (
                <ItemRow
                  key={i}
                  dm={dm}
                  title={exp.title || "Role"}
                  subtitle={[exp.company, exp.location].filter(Boolean).join(" · ")}
                  meta={[exp.startDate, exp.current ? "Present" : exp.endDate].filter(Boolean).join(" - ")}
                  description={exp.description}
                  last={i === meta.experience.length - 1}
                />
              )) : <EmptyState action={<button onClick={() => startSectionEdit("experience")} style={{ background: "none", border: "none", color: "#0a66c2", cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS, fontWeight: 760 }}>Add experience</button>}>No experience listed yet.</EmptyState>}
            </SCard>

            <SCard title="Projects" dm={dm}>
              <EmptyState>Project entries are not supported as standalone profile data yet. Share project updates through Activity for now.</EmptyState>
            </SCard>

            <SCard title="Education" dm={dm} onEdit={() => startSectionEdit("education")} onAdd={() => startSectionEdit("education")}>
              {editingSection === "education" ? (
                <InlineSectionEditor section="education" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : (meta.education || []).length > 0 ? meta.education.map((edu, i) => (
                <ItemRow
                  key={i}
                  dm={dm}
                  title={edu.school || school}
                  subtitle={[edu.degree, edu.field].filter(Boolean).join(" · ")}
                  meta={[edu.startYear, edu.endYear].filter(Boolean).join(" - ")}
                  mark={schoolMarkFor(edu.school || school)}
                  last={i === meta.education.length - 1}
                />
              )) : (
                <ItemRow dm={dm} title={school} subtitle={meta.major || "Academic profile"} meta={meta.gradTerm ? `Expected ${meta.gradTerm}` : ""} mark={schoolMark} last />
              )}
            </SCard>

            <SCard title="Skills & Interests" dm={dm} onEdit={() => startSectionEdit("skills")}>
              {editingSection === "skills" ? (
                <InlineSectionEditor section="skills" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : (meta.interests || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{meta.interests.map(t => <Chip key={t}>{t}</Chip>)}</div>
              ) : (
                <div style={{ color: p.textSub, fontSize: 14 }}>No interests yet. <button onClick={() => startSectionEdit("skills")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS }}>Add some →</button></div>
              )}
            </SCard>

            <SCard title="Clubs & Campus Interests" dm={dm} onEdit={() => startSectionEdit("clubs")}>
              {editingSection === "clubs" ? (
                <InlineSectionEditor section="clubs" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : (meta.hobbies || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.hobbies.map(h => (
                    <span key={h} style={{ background: dm ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`, borderRadius: RADIUS.pill, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: p.text, fontFamily: SANS }}>{h}</span>
                  ))}
                </div>
              ) : <EmptyState>No clubs or campus interests added yet.</EmptyState>}
            </SCard>

            <SCard title="Courses" dm={dm} onEdit={() => startSectionEdit("courses")}>
              {editingSection === "courses" ? (
                <InlineSectionEditor section="courses" dm={dm} form={form} set={set} onSave={saveSection} onCancel={cancelSectionEdit} saving={saving} error={error} />
              ) : (meta.coursesTaken || []).length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {meta.coursesTaken.map(c => (
                    <span key={c} style={{ background: p.card, border: `1px solid ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`, borderRadius: RADIUS.xs, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: p.text, fontFamily: MONO }}>{c}</span>
                  ))}
                </div>
              ) : (
                <EmptyState action={<button onClick={() => startSectionEdit("courses")} style={{ background: "none", border: "none", color: "#0a66c2", cursor: "pointer", fontSize: 14, padding: 0, fontFamily: SANS, fontWeight: 760 }}>Add courses</button>}>No courses listed yet.</EmptyState>
              )}
            </SCard>

            <SCard title="Schedule Preview" dm={dm}>
              <EmptyState>Your saved schedule is private by default and is not shown on the profile unless explicit sharing support is added.</EmptyState>
            </SCard>

            <SCard title="Saved Planning" dm={dm}>
              <EmptyState>Saved schedules and planning artifacts stay private unless Darvis adds explicit sharing controls.</EmptyState>
            </SCard>
          </div>

          {/* Sidebar */}
          <div style={{ position: "static" }}>
            <SidebarCard dm={dm} title="Profile strength">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 58, height: 58, borderRadius: "50%", background: `conic-gradient(${ACCENT} ${completion * 3.6}deg, ${dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)"} 0deg)`, display: "grid", placeItems: "center" }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: dm ? "#121212" : "#fff", display: "grid", placeItems: "center", color: p.text, fontWeight: 800, fontSize: 13 }}>{completion}%</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: p.text, fontSize: 14, fontWeight: 760 }}>Student profile</div>
                  <div style={{ color: p.textSub, fontSize: 13, lineHeight: 1.45 }}>Add bio, skills, courses, and experience to make your profile more useful.</div>
                </div>
              </div>
            </SidebarCard>

            <SidebarCard dm={dm} title="Quick links">
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  ["Edit profile", startEdit],
                  ["Privacy settings", startEdit],
                  ["Saved schedules", () => {}],
                  ["Chat history", () => {}],
                ].map(([label, action]) => (
                  <button key={label} onClick={action} style={{ background: "transparent", border: "none", padding: 0, color: "#0a66c2", fontSize: 14, fontWeight: 760, textAlign: "left", cursor: "pointer", fontFamily: SANS }}>{label}</button>
                ))}
              </div>
            </SidebarCard>

            <SidebarCard dm={dm} title="Academic details">
              <div style={{ display: "grid", gap: 11 }}>
                {[
                  ["School", school],
                  ["Major", meta.major],
                  ["Minor", meta.minor],
                  ["Year", meta.year],
                  ["Graduation", meta.gradTerm],
                ].map(([label, value]) => value ? (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 13, color: p.textSub }}>{label}</span>
                    <span style={{ fontSize: 13, color: p.text, fontWeight: 760, textAlign: "right" }}>{value}</span>
                  </div>
                ) : null)}
                {!meta.major && !meta.year && <EmptyState>No academic info yet.</EmptyState>}
              </div>
            </SidebarCard>

            {(meta.linkedIn || meta.github || meta.website || user?.emailAddresses?.[0]?.emailAddress) && (
              <SidebarCard title="Contact" dm={dm}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { href: `mailto:${email}`, label: email, show: !!email },
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
              </SidebarCard>
            )}

            <SidebarCard dm={dm} title="Suggested students">
              <EmptyState>Student suggestions are not available yet.</EmptyState>
            </SidebarCard>

            <SidebarCard dm={dm} title="Suggested clubs">
              <EmptyState>Club recommendations will appear here after Darvis supports them.</EmptyState>
            </SidebarCard>
          </div>
        </div>
      </div>

      {editing && (
        <EditModal dm={dm} onClose={() => setEditing(false)} onSave={save} saving={saving} error={error} form={form} set={set} onLinkedInImport={handleLinkedInImport} />
      )}
    </div>
  );
}
