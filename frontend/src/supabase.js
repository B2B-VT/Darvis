// src/supabase.js
// Supabase client that forwards the Clerk session token so RLS can enforce ownership.
// Call setSupabaseToken(getToken) once in App after Clerk auth loads.
import { createClient } from "@supabase/supabase-js";
import { DARVIS_CONFIG } from "./config.js";

let _getToken = null;

export function setSupabaseToken(getTokenFn) {
  _getToken = getTokenFn;
}

export const db = createClient(
  DARVIS_CONFIG.supabaseUrl,
  DARVIS_CONFIG.supabaseKey,
  {
    global: {
      fetch: async (url, options = {}) => {
        const headers = new Headers(options?.headers);
        if (_getToken) {
          try {
            const token = await _getToken({ template: "supabase" });
            if (token) headers.set("Authorization", `Bearer ${token}`);
          } catch (_) {}
        }
        return fetch(url, { ...options, headers });
      },
    },
  }
);
