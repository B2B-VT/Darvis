// Main App component
import { useState, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { setSupabaseToken } from "./supabase.js";
import { API } from "./api.js";
import AppShell from "./components/app-shell.jsx";
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
import LegalPage from "./components/legal-page.jsx";
import { palette, SANS, AmbientBackdrop, GrainOverlay, injectGlobalStyles } from "./theme.jsx";
import { LoadingShell } from "./components/skeletons.jsx";

injectGlobalStyles();

// Pages that require authentication
const PROTECTED = new Set(["search", "schedule", "chatbot", "forums", "instructors"]);

const pageToPath = page => {
  if (page === "privacy") return "/privacy";
  if (page === "terms") return "/terms";
  if (page === "landing") return "/";
  return "/";
};

const pathToPage = path => {
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return null;
};

export default function App() {
  const { isSignedIn, isLoaded: authLoaded, getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  // Register Clerk token getter so the Supabase client can attach JWT on every request
  useEffect(() => {
    if (authLoaded) setSupabaseToken(isSignedIn ? getToken : null);
  }, [authLoaded, isSignedIn, getToken]);

  const [page, setPage] = useState(() => {
    const routePage = pathToPage(window.location.pathname);
    if (routePage) return routePage;
    try { return localStorage.getItem("hokieDarvis_page") || "landing"; } catch { return "landing"; }
  });
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("hokieDarvis_theme") !== "light"; } catch { return true; }
  });
  const [schedule, setSchedule] = useState(() => {
    try { const s = localStorage.getItem("hokieDarvis_schedule"); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // Schedule sync — load from Supabase on sign-in, clear on sign-out
  const scheduleInitialized = useRef(false);
  const scheduleSaveTimer   = useRef(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // Refs so the logout flush always sees the latest data without stale closures
  const lastUserIdRef       = useRef(null);
  const lastScheduleRef     = useRef([]);

  useEffect(() => { lastScheduleRef.current = schedule; }, [schedule]);

  useEffect(() => {
    if (!authLoaded) return;
    if (isSignedIn && userLoaded && user) {
      lastUserIdRef.current = user.id;
      scheduleInitialized.current = false;
      setScheduleLoading(true);
      API.getSchedule(user.id)
        .then(async saved => {
          if (saved.length > 0) {
            try {
              const fresh = await API.getSectionsByCrns(saved.map(s => s.crn));
              const byKey = Object.fromEntries(fresh.map(s => [s.crn, s]));
              saved = saved.map(s => byKey[s.crn] || s);
            } catch {}
          }
          setSchedule(saved);
          scheduleInitialized.current = true;
          setScheduleLoading(false);
        })
        .catch(() => { scheduleInitialized.current = true; setScheduleLoading(false); });
    } else if (!isSignedIn) {
      // Flush immediately — the debounce timer would be cancelled by the re-render
      clearTimeout(scheduleSaveTimer.current);
      if (lastUserIdRef.current && lastScheduleRef.current.length > 0) {
        API.saveSchedule(lastUserIdRef.current, lastScheduleRef.current).catch(() => {});
      }
      lastUserIdRef.current = null;
      setSchedule([]);
      setScheduleLoading(false);
      scheduleInitialized.current = false;
    }
  }, [isSignedIn, userLoaded, authLoaded]);

  useEffect(() => {
    if (!isSignedIn || !user || !scheduleInitialized.current) return;
    clearTimeout(scheduleSaveTimer.current);
    scheduleSaveTimer.current = setTimeout(() => {
      API.saveSchedule(user.id, schedule).catch(() => {});
    }, 600);
    return () => clearTimeout(scheduleSaveTimer.current);
  }, [schedule]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCourseTab, setSelectedCourseTab] = useState("description");
  const [selectedProf,   setSelectedProf]   = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Persist schedule and theme
  useEffect(() => {
    try { localStorage.setItem("hokieDarvis_page", page); } catch {}
  }, [page]);

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
    window.history.replaceState({ page }, "", pageToPath(page));
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
      window.history.pushState({ page: pendingPage }, "", pageToPath(pendingPage));
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
      window.history.pushState({ page: newPage }, "", pageToPath(newPage));
    }
  };

  // schedule is now an array of full section objects {crn, subject, courseNumber, days, startTime, ...}
  const addSection    = sec => { if (!schedule.some(s => s.crn === sec.crn)) setSchedule(prev => [...prev, sec]); };
  const removeSection = crn => setSchedule(prev => prev.filter(s => s.crn !== crn));

  const openCourse = (course, initialTab = "description") => {
    setSelectedCourseTab(initialTab);
    setSelectedCourse(course);
  };

  // Prof opens as an overlay modal on top of whatever is showing — no page change needed.
  const openProf  = prof => setSelectedProf(prof);
  const closeProf = ()   => setSelectedProf(null);

  // Show nothing until Clerk finishes loading (avoids auth gate flash)
  if (!authLoaded) {
    return <LoadingShell darkMode={darkMode} />;
  }

  const renderPage = () => {
    // If somehow on a protected page without being signed in, show landing
    if (PROTECTED.has(page) && !isSignedIn) {
      return <LandingPage onEnter={() => navigateTo("search")} onNavigate={navigateTo} darkMode={darkMode} onCourseClick={openCourse} onProfClick={openProf} />;
    }

    if (page === "landing") {
      return <LandingPage onEnter={() => navigateTo("search")} onNavigate={navigateTo} darkMode={darkMode} onCourseClick={openCourse} onProfClick={openProf} />;
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
    if (page === "privacy") {
      return <LegalPage type="privacy" darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "terms") {
      return <LegalPage type="terms" darkMode={darkMode} setPage={navigateTo} />;
    }
    if (page === "instructors") {
      return <InstructorsPage darkMode={darkMode} onProfClick={openProf} />;
    }
    if (page === "schedule") {
      return (
        <ScheduleBuilder
          darkMode={darkMode}
          schedule={schedule}
          onAdd={addSection} onRemove={removeSection}
          onCourseClick={openCourse}
          setPage={navigateTo}
          loading={scheduleLoading}
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

  const p = palette(darkMode);

  return (
    <div style={{
      background: p.bg,
      minHeight: "100vh",
      fontFamily: SANS,
      transition: "background 0.45s",
    }}>
      {/* Ambient atmosphere on every page */}
      <AmbientBackdrop dark={darkMode} />
      <GrainOverlay dark={darkMode} />

      <AppShell
        page={page} setPage={navigateTo}
        darkMode={darkMode} setDarkMode={setDarkMode}
        schedule={schedule}
        isSignedIn={!!isSignedIn}
        onSignIn={() => { setPendingPage("search"); setShowAuthModal(true); }}
      >
        {renderPage()}
      </AppShell>

      {selectedCourse && (
        <CourseDetail
          course={selectedCourse} darkMode={darkMode}
          schedule={schedule}
          onAdd={addSection} onRemove={removeSection}
          onClose={() => setSelectedCourse(null)}
          onProfClick={openProf}
          initialTab={selectedCourseTab}
        />
      )}

      {selectedProf && (
        <ProfessorProfile
          prof={selectedProf} darkMode={darkMode}
          onCourseClick={openCourse} onClose={closeProf}
          currentUser={user}
          isSignedIn={!!isSignedIn}
          onRequireSignIn={() => { setPendingPage(page); setShowAuthModal(true); }}
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
