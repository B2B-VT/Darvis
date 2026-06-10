// FAQs page
import { useState, useEffect } from "react";

export default function FaqsPage({ darkMode = true, setPage }) {
  const bg      = "transparent";
  const cardBg  = darkMode ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.03)";
  const cardHov = darkMode ? "rgba(255,255,255,0.03)"  : "rgba(0,0,0,0.02)";
  const border  = darkMode ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.08)";
  const borOpen = darkMode ? "rgba(255,255,255,0.14)"  : "rgba(0,0,0,0.14)";
  const text    = darkMode ? "rgba(255,255,255,0.88)"  : "#1a1210";
  const subtext = darkMode ? "rgba(255,255,255,0.45)"  : "rgba(0,0,0,0.45)";
  const head    = darkMode ? "#ffffff"                 : "#1a1210";
  const accent  = "#861F41";
  const btnSec  = darkMode ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.06)";
  const btnSecH = darkMode ? "rgba(255,255,255,0.11)"  : "rgba(0,0,0,0.1)";
  const plusBg  = darkMode ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.08)";

  const [open, setOpen] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const toggle = i => setOpen(open === i ? null : i);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const sections = [
    {
      heading: "About Darvis",
      items: [
        {
          q: "What is Darvis?",
          a: "Darvis is a course-planning tool. Browse historical grade distributions for any course or instructor, build your semester schedule, and ask the AI questions about grade outcomes.",
        },
        {
          q: "Where does the grade data come from?",
          a: "Grade data comes from publicly available university data sources, which publish official grade distributions by course, section, instructor, and semester.",
        },
        {
          q: "How often is the data updated?",
          a: "Grade data is updated once per semester after official records are published. The site shows the most recent batch available at the time of the last update.",
        },
        {
          q: "Is this an official university product?",
          a: "No. Darvis is an independent student-built project. It uses publicly available data and is not affiliated with or endorsed by any university.",
        },
      ],
    },
    {
      heading: "Grade data and what it means",
      items: [
        {
          q: "What do the grade columns mean?",
          a: "The key metrics are GPA (average grade points for the section), A/A- rate (share who earned an A or A-), F rate (share who failed), W rate (share who withdrew), and total enrollment. Read them together to judge how a section tends to be graded.",
        },
        {
          q: "Can I use this to pick the 'easiest' professor?",
          a: "The tool shows grade outcomes, not teaching quality. A professor with a high A rate might run a rigorous course or have an easy grading policy. The data alone can't tell you which. Use it alongside course reviews and your own goals.",
        },
        {
          q: "Why does a professor show different numbers across semesters?",
          a: "Enrollment varies, class composition differs each term, and professors adjust their courses over time. Small sections (under 15 students) can be skewed by a single outlier semester. The site shows confidence levels to flag this.",
        },
        {
          q: "A course I'm looking for isn't showing up. Why?",
          a: "Darvis has grade data for the subjects that have been imported so far. Not all subjects are in the database yet. If your course isn't showing up, it hasn't been added. More subjects are being added each semester.",
        },
      ],
    },
    {
      heading: "Darvis",
      items: [
        {
          q: "What can Darvis actually do?",
          a: "Darvis can answer questions about grade distributions: which instructor for a specific course has stronger historical grade outcomes, how a course's A rate has trended over recent semesters, which sections have higher F or withdrawal rates, and similar quantitative questions based on the grade data.",
        },
        {
          q: "Why can't Darvis tell me about workload or teaching style?",
          a: "Darvis only has grade distribution numbers. It has no data on teaching style, exam difficulty, workload, attendance policies, or student reviews. For those, check the Forums page or Rate My Professor.",
        },
        {
          q: "Darvis gave me an answer with numbers — how reliable is it?",
          a: "The AI pulls from the actual grade records in the database. If a course has a small number of students or only one or two semesters of data, the AI will say so. Treat answers for thin data sets with caution.",
        },
        {
          q: "Why does Darvis sometimes say it can't answer?",
          a: "If a question is outside what grade data can answer (for example, 'Is this professor nice?' or 'Is the homework hard?'), Darvis will say so and suggest a question it can answer instead. It won't make up information.",
        },
      ],
    },
    {
      heading: "Schedule Builder",
      items: [
        {
          q: "How does the Schedule Builder work?",
          a: "Browse or search for courses, then add sections to your schedule. The builder shows time conflicts and lets you compare options side by side. Your schedule is saved in your browser and persists across visits on the same device.",
        },
        {
          q: "Does the Schedule Builder show live seat availability?",
          a: "Not yet. Real-time seat counts are on the roadmap. For now, treat the sections as a planning reference and check your registrar's site for final enrollment.",
        },
      ],
    },
    {
      heading: "Feedback and bugs",
      items: [
        {
          q: "I found a bug or the data looks wrong. What should I do?",
          a: "Post in the Site Feedback category on the Forums page with as much detail as you can: course, instructor, semester, and what looks off. The data comes from UDC, so if UDC has an error, we likely have it too. Surface it either way.",
        },
        {
          q: "I have a feature suggestion.",
          a: "Post it in Site Feedback on the Forums page. Ideas that get traction will show up on the roadmap.",
        },
      ],
    },
  ];

  return (
    <div style={{ background: bg, minHeight: "100vh", color: text, fontFamily: "'Plus Jakarta Sans', sans-serif", paddingBottom: 80, transition: "background 0.3s, color 0.3s" }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${border}`, padding: isMobile ? "32px 0 24px" : "48px 0 40px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "0 16px" : "0 48px" }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "1.8px",
            fontFamily: "'JetBrains Mono', monospace",
            color: accent, textTransform: "uppercase", display: "block", marginBottom: 10,
          }}>Help Center</span>
          <h1 style={{
            margin: 0, fontSize: "clamp(34px, 4vw, 46px)", fontWeight: 400,
            fontFamily: "'Instrument Serif', Georgia, serif",
            letterSpacing: "-0.5px", color: head, lineHeight: 1.05,
          }}>Questions, <span style={{ color: accent, fontStyle: "italic" }}>answered.</span></h1>
          <p style={{ margin: "10px 0 0", color: subtext, fontSize: 15 }}>
            Common questions about Darvis, the grade data, and the AI.
          </p>
        </div>
      </div>

      {/* Non-affiliation notice */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "20px 16px 0" : "32px 48px 0" }}>
        <div style={{
          background: darkMode ? "rgba(134,31,65,0.10)" : "rgba(134,31,65,0.06)",
          border: `1.5px solid rgba(134,31,65,0.30)`,
          borderRadius: 12, padding: "14px 20px",
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <div style={{ flexShrink: 0, width: 3, alignSelf: "stretch", background: "#861F41", borderRadius: 2 }} />
          <p style={{ margin: 0, fontSize: 13, color: text, lineHeight: 1.65 }}>
            <strong style={{ color: head }}>Not affiliated with Virginia Tech.</strong>{" "}
            Darvis is an independent project. It is not affiliated with, endorsed by, or officially connected to Virginia Tech or any other university. Grade data comes from publicly available institutional records.
          </p>
        </div>
      </div>

      {/* Accordion */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "24px 16px 0" : "32px 48px 0" }}>
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: 40 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: subtext, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              {section.heading}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {section.items.map((item, ii) => {
                const key = `${si}-${ii}`;
                const isOpen = open === key;
                return (
                  <div
                    key={ii}
                    style={{
                      background: cardBg,
                      border: `1px solid ${isOpen ? borOpen : border}`,
                      borderRadius: 12, overflow: "hidden",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <button
                      onClick={() => toggle(key)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center",
                        justifyContent: "space-between", gap: 16, padding: "16px 20px",
                        background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = cardHov}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: isOpen ? head : text, lineHeight: 1.45 }}>
                        {item.q}
                      </span>
                      <span style={{
                        flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                        background: isOpen ? accent : plusBg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, color: isOpen ? "white" : subtext,
                        transition: "background 0.15s, transform 0.2s",
                        transform: isOpen ? "rotate(45deg)" : "none",
                        fontWeight: 500,
                      }}>
                        +
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 20px 18px", fontSize: 14, color: subtext, lineHeight: 1.7 }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer CTA row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <button
            onClick={() => setPage && setPage("chatbot")}
            style={{
              background: accent, color: "white", border: "none", borderRadius: 9,
              padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Open Darvis
          </button>
          <button
            onClick={() => setPage && setPage("forums")}
            style={{
              background: btnSec, color: text, border: `1px solid ${border}`,
              borderRadius: 9, padding: "10px 20px", fontWeight: 600, fontSize: 14,
              cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = btnSecH}
            onMouseLeave={e => e.currentTarget.style.background = btnSec}
          >
            Go to Forums
          </button>
        </div>
      </div>
    </div>
  );
}
