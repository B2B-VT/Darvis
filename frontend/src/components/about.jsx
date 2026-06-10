// About Us page — static

// ── Feature icons ──────────────────────────────────────────────────
const IconBarChart = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

const IconStar = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconCalendar = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const IconMessageSquare = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconGrid = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const IconUsers = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ── About Page ─────────────────────────────────────────────────────
export default function AboutPage({ darkMode, setPage }) {
  const dm = darkMode;
  const colors = {
    bg:     "transparent",
    text:   dm ? "#f0edf3" : "#1c1a1e",
    sub:    dm ? "rgba(255,255,255,0.5)"  : "#75787b",
    border: dm ? "rgba(255,255,255,0.08)" : "#e5e0ea",
    card:   dm ? "#141414" : "#ffffff",
    accent: "#861F41",
    iconBg: dm ? "rgba(134,31,65,0.15)" : "rgba(134,31,65,0.09)",
  };

  const features = [
    {
      Icon: IconBarChart,
      title: "Real grade data",
      desc: "Historical grade distributions pulled from Virginia Tech's public records — every letter grade, every semester, going back years.",
    },
    {
      Icon: IconStar,
      title: "Rate My Professor scores",
      desc: "RMP ratings, difficulty scores, and student reviews pulled directly from the source and matched to VT instructors.",
    },
    {
      Icon: IconCalendar,
      title: "Live Fall 2026 sections",
      desc: "Actual timetable data scraped from the VT course catalog — real CRNs, meeting times, seat counts, and locations.",
    },
    {
      Icon: IconMessageSquare,
      title: "Darvis Chatbot",
      desc: "Ask anything about a course, an instructor, or your schedule. Darvis answers with data, not guesses.",
    },
    {
      Icon: IconGrid,
      title: "Schedule Builder",
      desc: "Build your semester visually. Add sections, spot conflicts, and see your week laid out before you commit.",
    },
    {
      Icon: IconUsers,
      title: "Forums",
      desc: "Talk to other Hokies about courses, professors, and campus life. Real conversations, not rate-limited Reddit threads.",
    },
  ];


  return (
    <div style={{
      minHeight: "100vh",
      background: colors.bg,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #6b1833 0%, #861F41 60%, #a0253c 100%)",
        padding: "64px 64px 56px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Darvis logo */}
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: 18,
            background: "rgba(255,255,255,0.15)",
            marginBottom: 20,
          }}>
            <img src="/logo.svg" alt="Darvis" style={{ width: 36, height: 36 }} />
          </div>
          <h1 style={{
            margin: "0 0 14px", fontSize: "clamp(36px, 4.5vw, 50px)", fontWeight: 400,
            fontFamily: "'Instrument Serif', Georgia, serif",
            color: "white", letterSpacing: "-0.5px", lineHeight: 1.1,
          }}>
            Built for Hokies, <span style={{ fontStyle: "italic" }}>by a Hokie.</span>
          </h1>
          <p style={{
            margin: 0, fontSize: 17, color: "rgba(255,255,255,0.75)",
            fontWeight: 500, lineHeight: 1.6,
          }}>
            Darvis started as a frustration. Picking courses at VT meant
            bouncing between Hokie SPA, Rate My Professor, and a spreadsheet.
            We put it all in one place.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 64px" }}>

        {/* What Darvis is */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{
            margin: "0 0 16px", fontSize: 22, fontWeight: 700,
            color: colors.text, letterSpacing: "-0.3px",
          }}>
            What is Darvis?
          </h2>
          <p style={{
            margin: "0 0 14px", fontSize: 16, color: colors.sub,
            lineHeight: 1.7, fontWeight: 500,
          }}>
            Darvis is a course planning tool built specifically for Virginia Tech students.
            It combines historical grade data, Rate My Professor scores, live section
            information, and an AI chatbot into a single interface.
          </p>
          <p style={{
            margin: 0, fontSize: 16, color: colors.sub,
            lineHeight: 1.7, fontWeight: 500,
          }}>
            The goal is simple: you should be able to answer "should I take this course
            with this professor?" without opening five browser tabs.
          </p>
        </section>

        {/* Features grid */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{
            margin: "0 0 24px", fontSize: 22, fontWeight: 700,
            color: colors.text, letterSpacing: "-0.3px",
          }}>
            What's inside
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 16,
          }}>
            {features.map(({ Icon, title, desc }) => (
              <div key={title} style={{
                background: colors.card,
                border: `1.5px solid ${colors.border}`,
                borderRadius: 16,
                padding: "22px 24px",
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 40, height: 40, borderRadius: 10,
                  background: colors.iconBg,
                  marginBottom: 14,
                }}>
                  <Icon color="#861F41" />
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: colors.text,
                  marginBottom: 8, lineHeight: 1.3,
                }}>
                  {title}
                </div>
                <div style={{
                  fontSize: 13, color: colors.sub,
                  lineHeight: 1.65, fontWeight: 500,
                }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section style={{
          marginBottom: 64,
          background: colors.card,
          border: `1.5px solid ${colors.border}`,
          borderRadius: 20,
          padding: "28px 32px",
        }}>
          <h2 style={{
            margin: "0 0 16px", fontSize: 22, fontWeight: 700,
            color: colors.text, letterSpacing: "-0.3px",
          }}>
            Data sources
          </h2>
          {[
            ["Grade distributions", "Virginia Tech's publicly posted grade data (UDC Reports)"],
            ["Rate My Professor",   "Scraped and matched to VT instructors by name"],
            ["Fall 2026 timetable", "Virginia Tech's Banner course timetable"],
            ["Course catalog",      "VT's official course descriptions and pathways"],
          ].map(([source, desc]) => (
            <div key={source} style={{
              display: "flex", gap: 20,
              padding: "12px 0",
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                fontWeight: 800, fontSize: 14, color: colors.text,
                minWidth: 180, flexShrink: 0,
              }}>
                {source}
              </div>
              <div style={{ fontSize: 14, color: colors.sub, fontWeight: 500 }}>
                {desc}
              </div>
            </div>
          ))}
          <p style={{
            margin: "16px 0 0", fontSize: 13, color: colors.sub,
            fontWeight: 500, lineHeight: 1.6,
          }}>
            All data is used for educational and informational purposes. Darvis
            is a student project and is not affiliated with Virginia Tech or
            Rate My Professors.
          </p>
        </section>

        {/* CTA */}
        <section>
          <div style={{
            background: "linear-gradient(135deg, #6b1833 0%, #861F41 60%, #a0253c 100%)",
            borderRadius: 20,
            padding: "40px 32px",
            textAlign: "center",
          }}>
            <h2 style={{
              margin: "0 0 12px", fontSize: 24, fontWeight: 700,
              color: "white", letterSpacing: "-0.3px",
            }}>
              Ready to plan smarter?
            </h2>
            <p style={{
              margin: "0 0 24px", fontSize: 15,
              color: "rgba(255,255,255,0.72)", fontWeight: 500,
            }}>
              Search courses, explore instructors, and build your Fall 2026 schedule.
            </p>
            <button
              onClick={() => setPage("search")}
              style={{
                background: "white", color: "#861F41",
                border: "none", borderRadius: 10,
                padding: "12px 28px",
                fontWeight: 800, fontSize: 15,
                cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Browse Courses
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
