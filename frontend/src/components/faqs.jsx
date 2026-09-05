// FAQs page
import { useState, useEffect } from "react";
import { SANS, SERIF, MONO, ACCENT, palette, RADIUS, useIsMobile } from "../theme.jsx";

export default function FaqsPage({ darkMode = true, setPage }) {
  const p       = palette(darkMode);
  const bg      = "transparent";
  const cardBg  = p.card;
  const cardHov = p.cardHover;
  const border  = p.line;
  const borOpen = darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
  const text    = p.text;
  const subtext = p.textSub;
  const head    = p.text;
  const accent  = ACCENT;
  const btnSec  = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const btnSecH = darkMode ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.1)";
  const plusBg  = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const [open, setOpen] = useState(null);
  const isMobile = useIsMobile();
  const toggle = i => setOpen(open === i ? null : i);

  const sections = [
    {
      heading: "About Darvis",
      items: [
        {
          q: "What is Darvis?",
          a: "Darvis is a course-planning tool. Browse historical grade distributions for any course or instructor, build your semester schedule, and ask Cyrus questions about grade outcomes.",
        },
        {
          q: "Where does the grade data come from?",
          a: "Grade distributions come from Virginia Tech's University Data Commons (UDC), which publishes public grade records by course, section, instructor, and semester. Darvis parses, normalizes, and makes those records searchable.",
        },
        {
          q: "How often is the data updated?",
          a: "Grade data is updated after new official UDC records are available. Fall 2026 schedule sections are refreshed from Banner data on a recurring basis, so section and seat information can be useful for planning but should still be verified in official registration systems before enrollment.",
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
          a: "Darvis can show grade outcomes and instructor comparisons, but grade data is not the same as teaching quality, workload, or fit. A high A rate might reflect many things: grading policy, student mix, course format, or small sample size. Use Darvis alongside official advising, course descriptions, reviews, and your own goals.",
        },
        {
          q: "Why does a professor show different numbers across semesters?",
          a: "Enrollment varies, class composition differs each term, and professors adjust their courses over time. Small sections (under 15 students) can be skewed by a single outlier semester. The site shows confidence levels to flag this.",
        },
        {
          q: "A course I'm looking for isn't showing up. Why?",
          a: "Darvis covers imported subjects across majors, but some courses may still be missing if they have no available grade rows, changed numbers, limited recent offerings, special topics formats, or incomplete catalog/timetable data. Try searching by subject, course number, title, or description.",
        },
      ],
    },
    {
      heading: "Cyrus",
      items: [
        {
          q: "What can Cyrus actually do?",
          a: "Cyrus can answer questions across majors about grade distributions, instructor comparisons, course descriptions, prerequisites, Pathways, major requirements, Fall 2026 sections, open seats, and schedule-building constraints. It can also explain when Darvis does not have enough data to answer honestly.",
        },
        {
          q: "Can Cyrus tell me about workload or teaching style?",
          a: "Cyrus can reference available structured data, public professor-rating context, Echo reviews where available, and forum-style student feedback, but it should not invent workload, curve policies, attendance rules, or teaching-style claims when Darvis does not have evidence. Treat those answers as planning support, not official advising.",
        },
        {
          q: "Cyrus gave me an answer with numbers — how reliable is it?",
          a: "Cyrus pulls from the actual grade records in the database. If a course has a small number of students or only one or two semesters of data, Cyrus will say so. Treat answers for thin data sets with caution.",
        },
        {
          q: "Why does Cyrus sometimes say it can't answer?",
          a: "If a question is outside what grade data can answer (for example, 'Is this professor nice?' or 'Is the homework hard?'), Cyrus will say so and suggest a question it can answer instead. It won't make up information.",
        },
      ],
    },
    {
      heading: "Schedule Builder",
      items: [
        {
          q: "How does the Schedule Builder work?",
          a: "Browse or search for Fall 2026 sections, then add them to your schedule. The builder shows time conflicts, selected CRNs, instructors, locations, seats, and course combinations so you can compare options across any major.",
        },
        {
          q: "Does the Schedule Builder show seat availability?",
          a: "Darvis shows seat and enrollment data from the current Fall 2026 timetable refresh, but it is not the official registration system and may lag behind Banner. Always confirm final availability, restrictions, prerequisites, and enrollment status in official university tools.",
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
    <div style={{ background: bg, minHeight: "100dvh", color: text, fontFamily: SANS, paddingBottom: 80, transition: "background 0.3s, color 0.3s" }}>

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
            Common questions about Darvis, the grade data, and Cyrus.
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
            Darvis is an independent project for students across majors. It is not affiliated with, endorsed by, or officially connected to any university. Grade data comes from publicly available institutional records.
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
            Open Cyrus
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
