import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — add it to your .env file or Vercel environment variables.");
}

// A test key in production is a real deployment mistake, but this check must
// never be fatal: it runs at module scope, so throwing here aborts the bundle
// before React mounts and white-screens the whole site. That is what took
// darvis.tech down on 2026-09-05 — Vercel's VITE_CLERK_PUBLISHABLE_KEY is a
// pk_test_ key, so every production load threw. The app runs fine on a test
// key (it just talks to Clerk's test instance), so warn loudly and boot.
if (import.meta.env.PROD && PUBLISHABLE_KEY.startsWith("pk_test_")) {
  console.error(
    "[Darvis] Production build is using a Clerk TEST publishable key. " +
    "Set VITE_CLERK_PUBLISHABLE_KEY to a pk_live_ key in the Vercel project settings."
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
