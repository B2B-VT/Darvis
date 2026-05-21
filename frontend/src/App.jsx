// Main App component
import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import Nav from "./components/nav-auth.jsx";
import LandingPage from "./components/landing.jsx";
import CourseSearch, { CourseDetail } from "./components/courses.jsx";
import ScheduleBuilder from "./components/schedule.jsx";
import ChatbotPage from "./components/chatbot.jsx";
import ForumsPage from "./components/forums.jsx";
import FaqsPage from "./components/faqs.jsx";
import ProfessorProfile from "./components/dashboard-prof.jsx";
import AuthModal from "./components/auth-modal.jsx";
import ProfileModal from "./components/profile-modal.jsx";
import ProfilePage from "./components/profile-page.jsx";
import InstructorsPage from "./components/instructors.jsx";
import AboutPage from "./components/about.jsx";

// Pages that require authentication
const PROTECTED = new Set(["search", "schedule", "chatbot", "forums", "instructors"]);

export default function App() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const [page, setPage] = useState("landing");
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("hokieDarvis_theme") !== "light"; } catch { return true; }
  });
  const [schedule, setSchedule] = useState(() => {
    try { const s = localStorage.getItem("hokieDarvis_schedule"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedProf,   setSelectedProf]   = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Persist schedule and theme
  useEffect(() => {
    try { localStorage.setItem("hokieDarvis_schedule", JSON.stringify(schedule)); } catch {}
  }, [schedule]);

  useEffect(() => {
    try { localStorage.setItem("hokieDarvis_theme", darkMode ? "dark" : "light"); } catch {}
  }, [darkMode]);

  // Show profile modal on first sign-in if onboarding not complete
  useEffect(() => {
    if (isSignedIn && userLoaded && user) {
      const done = user.unsafeMetadata?.onboardingComplete;
      if (!done) setShowProfileModal(true);
    }
  }, [isSignedIn, userLoaded, user]);

  // Seed browser history with a valid state so back button stays inside the app.
  // Without this, back exits into Clerk's OAuth callback URLs (which Google rejects as 400).
  useEffect(() => {
    window.history.replaceState({ page: "landing" }, "");
  }, []);

  // Handle browser back/forward — read the state we pushed and update React accordingly.
  useEffect(() => {
    const handlePop = (e) => {
      const target = e.state?.page;
      if (!target) {
        // Backed into an external URL (OAuth callback, etc.) — reset to landing.
        window.history.replaceState({ page: "landing" }, "", "/");
        setPage("landing");
        return;
      }
      if (PROTECTED.has(target) && !isSignedIn) {
        setPage("landing");
      } else {
        setPage(target);
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [isSignedIn]);

  // After sign-in, navigate to the page the user originally tried to access
  useEffect(() => {
    if (isSignedIn && pendingPage) {
      setPage(pendingPage);
      window.history.pushState({ page: pendingPage }, "");
      setPendingPage(null);
      setShowAuthModal(false);
    }
  }, [isSignedIn, pendingPage]);

  // Intercepts navigation — shows auth modal instead of navigating if page is protected.
  // Also pushes to browser history so the back button works within the app.
  const navigateTo = (newPage) => {
    if (PROTECTED.has(newPage) && !isSignedIn) {
      setPendingPage(newPage);
      setShowAuthModal(true);
    } else {
      setPage(newPage);
      window.history.pushState({ page: newPage }, "");
    }
  };

  // schedule is now an array of full section objects {crn, subject, courseNumber, days, startTime, ...}
  const addSection    = sec => { if (!schedule.some(s => s.crn === sec.crn)) setSchedule(prev => [...prev, sec]); };
  const removeSection = crn => setSchedule(prev => prev.filter(s => s.crn !== crn));

  const openCourse = course => setSelectedCourse(course);

  // Prof opens as an overlay modal on top of whatever is showing — no page change needed.
  const openProf  = prof => setSelectedProf(prof);
  const closeProf = ()   => setSelectedProf(null);

  // Show nothing until Clerk finishes loading (avoids auth gate flash)
  if (!authLoaded) {
    return (
      <div style={{
        background: darkMode ? "#080808" : "#f7f4f0",
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          width: 32, height: 32, border: "3px solid rgba(134,31,65,0.3)",
          borderTopColor: "#861F41", borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const renderPage = () => {
    // If somehow on a protected page without being signed in, show landing
    if (PROTECTED.has(page) && !isSignedIn) {
      return <LandingPage onEnter={() => navigateTo("search")} darkMode={darkMode} />;
    }

    if (page === "landing") {
      return <LandingPage onEnter={() => navigateTo("search")} darkMode={darkMode} />;
    }
    if (page === "profile") {
      return <ProfilePage darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "chatbot") {
      return (
        <ChatbotPage
          darkMode={darkMode}
          addSection={addSection}
          setPage={navigateTo}
          userProfile={user?.unsafeMetadata || null}
        />
      );
    }
    if (page === "forums") {
      return <ForumsPage darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "faqs") {
      return <FaqsPage darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "instructors") {
      return <InstructorsPage darkMode={darkMode} />;
    }
    if (page === "about") {
      return <AboutPage darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "schedule") {
      return (
        <ScheduleBuilder
          darkMode={darkMode}
          schedule={schedule}
          onAdd={addSection} onRemove={removeSection}
          onCourseClick={openCourse}
          setPage={navigateTo}
        />
      );
    }
    return (
      <CourseSearch
        darkMode={darkMode}
        schedule={schedule}
        onCourseClick={openCourse} onProfClick={openProf}
      />
    );
  };

  return (
    <div style={{
      background: darkMode ? "#080808" : "#f7f4f0",
      minHeight: "100vh",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      transition: "background 0.3s",
    }}>
      <Nav
        page={page} setPage={navigateTo}
        schedule={schedule}
        darkMode={darkMode} setDarkMode={setDarkMode}
      />

      <div key={page} style={{ animation: "pageIn 0.22s ease" }}>
        {renderPage()}
      </div>

      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {selectedCourse && (
        <CourseDetail
          course={selectedCourse} darkMode={darkMode}
          schedule={schedule}
          onAdd={addSection} onRemove={removeSection}
          onClose={() => setSelectedCourse(null)}
          onProfClick={openProf}
        />
      )}

      {selectedProf && (
        <ProfessorProfile
          prof={selectedProf} darkMode={darkMode}
          onCourseClick={openCourse} onClose={closeProf}
        />
      )}

      {showProfileModal && (
        <ProfileModal darkMode={darkMode} onClose={() => setShowProfileModal(false)} />
      )}

      {showAuthModal && (
        <AuthModal
          darkMode={darkMode}
          page={pendingPage}
          onClose={() => { setShowAuthModal(false); setPendingPage(null); }}
        />
      )}
    </div>
  );
}
