# Cyrus Early-Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the Cyrus chatbot page to an email allowlist (two people) until a launch flag is flipped, with everyone else seeing an on-brand "coming soon" screen instead of the chat UI.

**Architecture:** A thin wrapper component (`ChatbotPage`) checks the signed-in Clerk user's email against a config allowlist (or a launch flag) and renders either the existing chat UI (renamed to `CyrusApp`, logic untouched) or a new `CyrusLockedScreen`. `chatbot.jsx` is the only file in the frontend that calls the chat API, so this is the single correct choke point — no other files need to change.

**Tech Stack:** React 19 (function components, hooks), `@clerk/clerk-react` (`useUser`), existing `theme.jsx` design-token/component exports. No new dependencies.

## Global Constraints

- Allowlist emails (exact, lowercase): `pujanpatel8@gmail.com`, `kbpatel2006@gmail.com`.
- `CYRUS_PUBLIC_LAUNCHED` starts `false`.
- No backend changes. No changes to `App.jsx`, `nav-auth.jsx`, `app-shell.jsx`, `landing.jsx`, `faqs.jsx`, `forums.jsx`.
- No new npm dependencies.
- No automated frontend test runner exists in this repo — verification is manual (`npm run dev` + browser check), per root `CLAUDE.md`.

---

### Task 1: Add Cyrus access-gate config

**Files:**
- Modify: `frontend/src/config.js` (append after the existing `DARVIS_CONFIG` export, end of file — currently 19 lines, `export const DARVIS_CONFIG = {...}` block ends at line 18, file ends at line 19)

**Interfaces:**
- Produces: `export const CYRUS_PUBLIC_LAUNCHED` (`boolean`), `export const CYRUS_ALLOWLIST` (`string[]`, all-lowercase emails) — consumed by Task 2's `ChatbotPage` gate.

- [ ] **Step 1: Add the two constants to `config.js`**

Append this to the end of `frontend/src/config.js` (after the closing `};` of `DARVIS_CONFIG`):

```js

// Cyrus early-access gate — flip to true + redeploy to open Cyrus to
// everyone. Until then, only these emails (lowercase) see the real chat UI;
// everyone else sees CyrusLockedScreen (see chatbot.jsx).
export const CYRUS_PUBLIC_LAUNCHED = false;
export const CYRUS_ALLOWLIST = ["pujanpatel8@gmail.com", "kbpatel2006@gmail.com"];
```

- [ ] **Step 2: Verify the file parses**

Run: `cd frontend && node --input-type=module -e "import('./src/config.js').then(m => console.log(m.CYRUS_PUBLIC_LAUNCHED, m.CYRUS_ALLOWLIST))"`
Expected output: `false [ 'pujanpatel8@gmail.com', 'kbpatel2006@gmail.com' ]`
(The import itself must not throw — `config.js` has no other side effects beyond the `isLocalDev` hostname check, which is safe to evaluate outside a browser since it's guarded by `typeof window !== "undefined"`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/config.js
git commit -m "feat: add Cyrus early-access allowlist config"
```

---

### Task 2: Gate the Cyrus chat page behind the allowlist

**Files:**
- Modify: `frontend/src/components/chatbot.jsx`
  - Line 1459: `export default function ChatbotPage({ darkMode, addSection, setPage, userProfile }) {` → rename to `function CyrusApp({ darkMode, addSection, setPage, userProfile }) {` (remove `export default`, rename function)
  - Line 5: import line — add `CYRUS_PUBLIC_LAUNCHED, CYRUS_ALLOWLIST` to the existing `DARVIS_CONFIG` import from `../config.js`
  - Line 7: import line — add `PageHeader` to the existing `theme.jsx` import (used by the new locked screen)
  - End of file (after line 2898, the closing `}` of the renamed `CyrusApp`): add `CyrusLockedScreen` and the new default-exported `ChatbotPage` gate

**Interfaces:**
- Consumes: `CYRUS_PUBLIC_LAUNCHED` (`boolean`), `CYRUS_ALLOWLIST` (`string[]`) from Task 1's `config.js`.
- Consumes (already available, existing exports in `theme.jsx`, confirmed present via the earlier onboarding audit): `palette`, `glassCard`, `SANS`, `RADIUS`, plus `PageHeader` (newly imported in this task — exact prop signature confirmed in Step 5 below before use).
- Produces: `export default function ChatbotPage(props)` — same prop shape as before (`darkMode, addSection, setPage, userProfile`), so `App.jsx`'s existing `<ChatbotPage ... />` call site needs zero changes.

- [ ] **Step 1: Rename the existing component and drop its `export default`**

In `frontend/src/components/chatbot.jsx`, change line 1459 from:

```js
export default function ChatbotPage({ darkMode, addSection, setPage, userProfile }) {
```

to:

```js
function CyrusApp({ darkMode, addSection, setPage, userProfile }) {
```

Nothing else in the function body changes.

- [ ] **Step 2: Add the two new config names to the existing config import**

Change line 5 from:

```js
import { DARVIS_CONFIG } from "../config.js";
```

to:

```js
import { DARVIS_CONFIG, CYRUS_PUBLIC_LAUNCHED, CYRUS_ALLOWLIST } from "../config.js";
```

- [ ] **Step 3: Check `PageHeader`'s real prop signature before importing/using it**

Run: `grep -n "function PageHeader\|PageHeader =" -A 15 frontend/src/theme.jsx`

Read the output. `PageHeader` must exist as an exported component in `theme.jsx` (confirmed present in an earlier codebase audit this session) — this step captures its exact prop names (e.g. it might be `title`/`subtitle`/`eyebrow`, or different names entirely) so Step 6 below uses the real signature instead of a guess. Write down the exact prop names from the grep output for use in Step 6.

If `PageHeader` turns out to require props/context this simple locked screen can't easily supply (e.g. it's tightly coupled to a specific page layout), skip importing it and instead build `CyrusLockedScreen` with plain elements styled via `palette(darkMode)` and `glassCard(darkMode)` (both already imported) — a heading (`<h1>`) and a paragraph (`<p>`) inside the `glassCard` div is sufficient; don't force `PageHeader` in if it doesn't fit.

- [ ] **Step 4: Add `PageHeader` to the theme import (only if Step 3 confirms it fits)**

If Step 3 confirmed `PageHeader` is usable here, change line 7 from:

```js
import { MONO, SANS, ACCENT, COPPER, palette, glassCard, RADIUS, SHADOW, EASE } from "../theme.jsx";
```

to:

```js
import { MONO, SANS, ACCENT, COPPER, palette, glassCard, RADIUS, SHADOW, EASE, PageHeader } from "../theme.jsx";
```

If Step 3 decided against `PageHeader`, leave line 7 unchanged — `SANS`, `palette`, `glassCard`, `RADIUS` (all already imported) are sufficient for the plain-elements fallback.

- [ ] **Step 5: Append `CyrusLockedScreen` and the `ChatbotPage` gate at the end of the file**

Append this after the final `}` (the closing brace of `CyrusApp`, now at the end of the file). Use the `PageHeader` variant if Step 3/4 confirmed it fits, using the real prop names you wrote down; otherwise use the plain-elements fallback shown second:

**If using `PageHeader`** (replace `PROP_NAME_*` placeholders with the real prop names found in Step 3 — do not leave them as literal placeholder text):

```js

function CyrusLockedScreen({ darkMode }) {
  const p = palette(darkMode);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: p.bg,
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          ...glassCard(darkMode),
          maxWidth: 440,
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          borderRadius: RADIUS.lg,
        }}
      >
        <PageHeader
          darkMode={darkMode}
          PROP_NAME_EYEBROW="Cyrus"
          PROP_NAME_TITLE="Private testing right now"
          PROP_NAME_SUBTITLE="Cyrus is being tested with a small group before it opens up to everyone. Public access is coming soon — check back shortly."
        />
      </div>
    </div>
  );
}

export default function ChatbotPage(props) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const hasAccess = CYRUS_PUBLIC_LAUNCHED || CYRUS_ALLOWLIST.includes(email);
  return hasAccess ? <CyrusApp {...props} /> : <CyrusLockedScreen darkMode={props.darkMode} />;
}
```

**Fallback if `PageHeader` doesn't fit** (plain elements, no new theme import needed):

```js

function CyrusLockedScreen({ darkMode }) {
  const p = palette(darkMode);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: p.bg,
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          ...glassCard(darkMode),
          maxWidth: 440,
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          borderRadius: RADIUS.lg,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: p.accent || p.textMuted, marginBottom: 12 }}>
          Cyrus
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: p.text, margin: "0 0 12px" }}>
          Private testing right now
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: p.textMuted, margin: 0 }}>
          Cyrus is being tested with a small group before it opens up to everyone. Public access is coming soon — check back shortly.
        </p>
      </div>
    </div>
  );
}

export default function ChatbotPage(props) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const hasAccess = CYRUS_PUBLIC_LAUNCHED || CYRUS_ALLOWLIST.includes(email);
  return hasAccess ? <CyrusApp {...props} /> : <CyrusLockedScreen darkMode={props.darkMode} />;
}
```

Note: `palette(darkMode)`'s exact returned field names (`p.bg`, `p.text`, `p.textMuted`, `p.accent`) must also be checked against `theme.jsx`'s real `palette()` implementation before finalizing the fallback — grep `function palette` in the same Step 3 pass and adjust field names if they differ from what's shown here.

- [ ] **Step 6: Start the dev server and manually verify both paths**

Run: `cd frontend && npm run dev`

With the dev server up:
1. Sign in as `pujanpatel8@gmail.com` (or `kbpatel2006@gmail.com`), navigate to Cyrus. **Expected:** the full chat UI loads exactly as before (message input, sidebar, etc.) — no visible change from pre-gate behavior.
2. Sign in as any other Clerk account, navigate to Cyrus. **Expected:** `CyrusLockedScreen` renders — no chat input, no sidebar. Open browser devtools Network tab and confirm no request to `CHAT_API`/`CHAT_STREAM_API` fires on page load.
3. If there's a dark-mode toggle, flip it while on the locked screen — confirm it doesn't crash and colors adapt via `palette(darkMode)`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chatbot.jsx
git commit -m "feat: gate Cyrus behind an early-access allowlist"
```

---

## Self-Review Notes

- **Spec coverage:** Goals (allowlist gate, locked screen, one-line unlock) → Task 1 + Task 2. Non-goals (no backend, no landing/FAQ/nav changes) → explicitly untouched, confirmed by file list in Global Constraints. Enforcement-level tradeoff → already documented in the spec itself as a decision record, not a deliverable — no code task needed. Edge cases (lowercase comparison, Clerk-loading flash, signed-out users already blocked by `App.jsx`) → lowercase comparison is in Task 2 Step 5's `.toLowerCase()`; Clerk-loading flash is inherent to the `useUser()` hook's return value and self-corrects on the next render, no extra code needed; signed-out routing is unchanged, confirmed as a non-goal.
- **Placeholder scan:** No TBD/TODO in the executable steps. Step 3/5's "confirm real prop names before use" is not a placeholder in the forbidden sense — it's a required verification gate because `PageHeader`'s exact signature was not independently re-confirmed while writing this plan (only that it exists, per an earlier file-map audit), and the plan provides a complete, code-complete fallback path that needs no lookup at all if `PageHeader` doesn't fit cleanly.
- **Type/name consistency:** `ChatbotPage(props)` in Task 2 Step 5 matches the prop shape `{ darkMode, addSection, setPage, userProfile }` `CyrusApp` expects (Task 2 Step 1) via spread (`{...props}`) — no manual prop-by-prop mismatch risk. `CYRUS_PUBLIC_LAUNCHED`/`CYRUS_ALLOWLIST` names match exactly between Task 1's export and Task 2's import.
