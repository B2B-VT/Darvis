# Cyrus early-access gate — design

## Problem

Cyrus (the branded name for Darvis's AI chatbot page, `page: "chatbot"` in `frontend/src/App.jsx`) is currently available to every signed-in Darvis user. It's not ready for general availability yet. Pujan wants to restrict it to himself and one other person until he chooses to open it up, while leaving the rest of the product (landing page, FAQ, nav) unchanged — those already advertise Cyrus as a current feature.

## Goals

- Only `pujanpatel8@gmail.com` and `kbpatel2006@gmail.com` (matched against the signed-in Clerk user's email) can use the actual chat UI.
- Everyone else who navigates to Cyrus sees an on-brand "early access / coming soon" message instead of the chat UI — not a broken page, not a hidden nav item.
- Flipping to fully public later is a one-line change + redeploy, no new infra.

## Non-goals

- No backend enforcement. This is a frontend-only gate (Pujan's explicit choice — see "Enforcement level" below).
- No change to landing page, FAQ, or forums copy/CTAs — they keep saying "Ask Cyrus" and keep navigating to the Cyrus page as they do today.
- No nav-item lock badge/icon — out of scope for this pass.
- No admin UI or database-backed toggle — the allowlist and launch flag are source constants.

## Enforcement level (explicitly chosen, documented for future reference)

The chatbot backend (`chatbot/app/main.py`) currently performs **no identity verification at all** on `/chat`/`/chat/stream` — no Clerk JWT check, just CORS + a per-IP rate limit. The frontend doesn't send an auth token to it today. A frontend-only gate therefore does not stop someone who discovers the raw API URL from calling it directly (e.g. via devtools or curl), bypassing the UI gate entirely.

This was surfaced to Pujan directly. He chose the frontend-only gate anyway, reasoning that Darvis signups are already waitlist-gated via Clerk, so the pool of people who could even discover and target the raw API is already small and known. If this assumption changes (e.g. the API URL leaks more broadly, or the threat model changes), a follow-up should add real backend enforcement: the frontend would need to start sending the Clerk session JWT to the chatbot API, and the backend would need to verify it (new dependency, new code path — not scoped here).

## Architecture

`chatbot.jsx` is the *only* frontend file that calls the chat API (confirmed via grep — landing, FAQ, forums, and nav all just navigate to `page: "chatbot"`, none of them talk to `CHAT_API`/`CHAT_STREAM_API` directly). That makes it the single correct choke point for the gate.

```
frontend/src/components/chatbot.jsx
├── CyrusApp(props)         ← the current ChatbotPage function body, renamed only — zero logic changes
├── CyrusLockedScreen()     ← new — small early-access message, no API calls, no chat state
└── ChatbotPage(props)      ← new default export — the gate itself
```

```js
export default function ChatbotPage(props) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const hasAccess = CYRUS_PUBLIC_LAUNCHED || CYRUS_ALLOWLIST.includes(email);
  return hasAccess ? <CyrusApp {...props} /> : <CyrusLockedScreen darkMode={props.darkMode} />;
}
```

`CyrusApp` (the existing ~2,900-line component, currently `export default function ChatbotPage(...)`) is renamed and stops being the default export, but its internal body, hooks, and all existing behavior are otherwise untouched. This avoids any risk of breaking React's rules-of-hooks ordering inside that large component — the gate lives entirely outside it, at the wrapper level.

## Config (`frontend/src/config.js`)

Two new exported constants, alongside the existing Supabase/chat-API config:

```js
export const CYRUS_PUBLIC_LAUNCHED = false;   // flip to true + redeploy to open Cyrus to everyone
export const CYRUS_ALLOWLIST = ["pujanpatel8@gmail.com", "kbpatel2006@gmail.com"];
```

Unlocking later: change `false` → `true`, `git push` to `main`, Vercel auto-deploys. Matches the existing pattern of source-level toggles in this codebase (e.g. `SHOW_DOCS`, `RAG_DEBUG_MODE` in the chatbot backend).

## Locked screen

`CyrusLockedScreen` renders using existing shared UI primitives from `theme.jsx` (whatever fits the existing visual language — `PageHeader`, `glassCard`, etc., decided during implementation to match current styling) with copy along the lines of: *"Cyrus is in private testing right now — public access is coming soon."* No chat input, no API calls, no chat-related state initialized.

## Data flow / edge cases

- Email comparison is lowercased on both sides before comparing against `CYRUS_ALLOWLIST` (defense against case differences; Clerk emails are normally already lowercase).
- While Clerk is still resolving the signed-in user, `user` is `undefined` → `email` is `undefined` → `hasAccess` is `false` → the locked screen renders briefly, then re-renders correctly once Clerk resolves. This affects only the two allowlisted users, only during that brief initial load, and self-corrects.
- Signed-out users can't reach `page: "chatbot"` at all — `App.jsx`'s existing `PROTECTED` set + auth gating already requires sign-in before this component ever mounts. No change needed there.

## Testing

No automated test suite exists for the frontend (per root `CLAUDE.md`: no Jest/Vitest configured). Verification is manual: run `npm run dev`, sign in as an allowlisted email → confirm full Cyrus UI loads; sign in as (or simulate) a non-allowlisted email → confirm the locked screen renders and no chat network requests fire.

## Files touched

- `frontend/src/config.js` — add `CYRUS_PUBLIC_LAUNCHED`, `CYRUS_ALLOWLIST`.
- `frontend/src/components/chatbot.jsx` — rename existing default export to `CyrusApp`, add `CyrusLockedScreen`, add new default-export `ChatbotPage` gate.
