import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — add it to your .env file or Vercel environment variables.");
}

if (import.meta.env.PROD && PUBLISHABLE_KEY.startsWith("pk_test_")) {
  throw new Error("Production builds must use a Clerk live publishable key. Set VITE_CLERK_PUBLISHABLE_KEY to pk_live_ in Vercel.");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
