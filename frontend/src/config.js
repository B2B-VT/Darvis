// src/config.js
// Fill in your Supabase publishable key from:
//   Supabase dashboard → Project Settings → API Keys → Publishable key
const isLocalDev = typeof window !== "undefined" && (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
);

export const DARVIS_CONFIG = {
  supabaseUrl: "https://rpmgcurhxrgtzbdixtay.supabase.co",
  supabaseKey: "sb_publishable_uZimzo_tWiqShsDX0_ROOw_HURMMQs1",
  // Point to your local chatbot server, or a deployed URL when hosted
  chatApiUrl: import.meta.env.VITE_CHAT_API_URL || (
    isLocalDev
      ? "http://127.0.0.1:8000/chat"
      : "https://chat-bot-6dpo.onrender.com/chat"
  ),
};
