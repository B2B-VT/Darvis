# Photorealistic Landing Earth Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing hero's campus-photo backdrop with a responsive, photorealistic Three.js Earth that transitions continuously between NASA-style day and night scenes with Darvis's theme.

**Architecture:** A focused `earth-scene/` component package owns the Three.js renderer, scene graph, texture lifecycle, shared theme-transition controller, static fallback, and responsive CSS. `LandingPage` passes its existing `darkMode` boolean into `EarthScene`; `App` gains deterministic persisted/system theme initialization and a pre-React document theme bootstrap prevents first-paint mismatch.

**Tech Stack:** React 19, Vite 8, Three.js 0.185.1, CSS, Node's built-in test runner, local optimized WebP/PNG textures.

## Global Constraints

- Add `three@0.185.1` as the only new runtime dependency; do not add React Three Fiber, GSAP, or another animation library.
- Preserve existing landing copy, typography, navigation, buttons, Clerk wrappers, events, and downstream sections.
- Use one normalized transition value, `0` for day and `1` for night, with a 1,650ms coordinated transition.
- Center Africa and Europe in the daylight state; rotate Earth 125 degrees toward the night side.
- Keep Earth dominant and bottom-left; keep Sun and Moon secondary and top-right.
- Use local assets only at runtime; no texture hotlinking.
- Keep desktop maps at 2K or below and mobile/fallback maps at 1K or below.
- Respect `prefers-reduced-motion`; no idle motion or celestial travel for reduced-motion users.
- Pause rendering when the hero is offscreen or the document is hidden.
- Treat the scene as decorative and non-interactive.
- Preserve the existing unrelated `chatbot/scripts/scrape_checksheets.py` working-tree file.

---

## File Map

**Create**

- `frontend/src/theme-preference.js` — pure saved/system theme resolution helpers.
- `frontend/src/theme-preference.test.js` — Node tests for saved/system theme behavior.
- `frontend/src/components/earth-scene/EarthScene.jsx` — React lifecycle, WebGL/fallback selection, observers, resize, and scene orchestration.
- `frontend/src/components/earth-scene/earth-scene.css` — stable hero dimensions, responsive composition, fallback layers, canvas fade-in, and reduced-motion rules.
- `frontend/src/components/earth-scene/theme-transition.js` — interruption-safe normalized transition controller.
- `frontend/src/components/earth-scene/theme-transition.test.js` — transition endpoint and rapid-reversal tests.
- `frontend/src/components/earth-scene/create-earth.js` — Earth surface, city lights, cloud shell, and Fresnel atmosphere.
- `frontend/src/components/earth-scene/create-celestial.js` — Sun and Moon meshes/sprites and theme-driven transforms.
- `frontend/src/components/earth-scene/create-space.js` — star field, Milky Way cube background, and sparse dust.
- `frontend/src/components/earth-scene/scene-assets.js` — local asset manifest and texture-loading/disposal helpers.
- `frontend/src/components/earth-scene/scene-assets.test.js` — unique texture disposal tests.
- `frontend/public/images/earth-scene/ASSETS.md` — source, license, conversion, and attribution record.
- `frontend/public/images/earth-scene/*` — optimized local Earth, Moon, cloud, night-light, Milky Way, and fallback assets.

**Modify**

- `frontend/package.json` and `frontend/package-lock.json` — add Three.js and `test` script.
- `frontend/index.html` — synchronous initial-theme bootstrap and theme-aware initial body background.
- `frontend/src/App.jsx` — use saved/system theme resolver and synchronize `data-theme`.
- `frontend/src/components/landing.jsx` — replace `HeroPhoto`/hero ornaments with `EarthScene`; remove superseded hero CSS/functions.

---

### Task 1: Deterministic Theme Initialization

**Files:**
- Create: `frontend/src/theme-preference.js`
- Create: `frontend/src/theme-preference.test.js`
- Modify: `frontend/package.json`
- Modify: `frontend/index.html:1-55`
- Modify: `frontend/src/App.jsx:45-60,119-132`

**Interfaces:**
- Produces: `resolveInitialTheme(savedTheme: string | null, prefersDark: boolean): "light" | "dark"`.
- Produces: `getInitialDarkMode(storage?: Storage, media?: MediaQueryList): boolean`.
- `App` consumes `getInitialDarkMode()` once in its `useState` initializer.

- [ ] **Step 1: Add the Node test script and write failing theme tests**

Add to `frontend/package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "node --test src/theme-preference.test.js src/components/earth-scene/*.test.js"
}
```

Create `frontend/src/theme-preference.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getInitialDarkMode, resolveInitialTheme } from "./theme-preference.js";

test("persisted theme wins over system preference", () => {
  assert.equal(resolveInitialTheme("light", true), "light");
  assert.equal(resolveInitialTheme("dark", false), "dark");
});

test("missing or invalid persisted theme uses system preference", () => {
  assert.equal(resolveInitialTheme(null, true), "dark");
  assert.equal(resolveInitialTheme(null, false), "light");
  assert.equal(resolveInitialTheme("sepia", false), "light");
});

test("storage and media failures fall back to dark safely", () => {
  const storage = { getItem() { throw new Error("blocked"); } };
  const media = { matches: false };
  assert.equal(getInitialDarkMode(storage, media), false);
  assert.equal(getInitialDarkMode(storage, null), true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npm test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `theme-preference.js`.

- [ ] **Step 3: Implement the theme helpers**

Create `frontend/src/theme-preference.js`:

```js
export function resolveInitialTheme(savedTheme, prefersDark) {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return prefersDark ? "dark" : "light";
}

export function getInitialDarkMode(
  storage = typeof window !== "undefined" ? window.localStorage : null,
  media = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null,
) {
  let savedTheme = null;
  try { savedTheme = storage?.getItem("hokieDarvis_theme") ?? null; } catch {}
  return resolveInitialTheme(savedTheme, media?.matches ?? true) === "dark";
}
```

In `App.jsx`, import `getInitialDarkMode`, initialize with `useState(getInitialDarkMode)`, and extend the existing persistence effect:

```js
useEffect(() => {
  const theme = darkMode ? "dark" : "light";
  try { localStorage.setItem("hokieDarvis_theme", theme); } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}, [darkMode]);
```

In `index.html`, insert before stylesheet links:

```html
<script>
  (() => {
    let saved = null;
    try { saved = localStorage.getItem("hokieDarvis_theme"); } catch {}
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    const theme = saved === "light" || saved === "dark" ? saved : (systemDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  })();
</script>
```

Add initial CSS:

```css
html[data-theme="dark"], html[data-theme="dark"] body { background: #070b13; }
html[data-theme="light"], html[data-theme="light"] body { background: #e9f2f8; }
```

- [ ] **Step 4: Run theme tests and production build**

Run: `cd frontend && npm test && npm run build`

Expected: all theme tests PASS; Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/index.html frontend/src/App.jsx frontend/src/theme-preference.js frontend/src/theme-preference.test.js
git commit -m "fix: initialize theme from saved or system preference"
```

---

### Task 2: Install Three.js and Vendor Optimized Space Assets

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/public/images/earth-scene/ASSETS.md`
- Create: `frontend/public/images/earth-scene/earth-day-2k.webp`
- Create: `frontend/public/images/earth-scene/earth-night-2k.webp`
- Create: `frontend/public/images/earth-scene/earth-normal-2k.webp`
- Create: `frontend/public/images/earth-scene/earth-specular-2k.webp`
- Create: `frontend/public/images/earth-scene/earth-clouds-1k.png`
- Create: `frontend/public/images/earth-scene/moon-1k.webp`
- Create: six `frontend/public/images/earth-scene/milky-way-*.webp` cube faces
- Create: `frontend/public/images/earth-scene/earth-day-fallback-1k.webp`
- Create: `frontend/public/images/earth-scene/earth-night-fallback-1k.webp`

**Interfaces:**
- Produces local URLs consumed by `scene-assets.js` in Task 4.
- Produces `three@0.185.1` consumed by all 3D modules.

- [ ] **Step 1: Install the exact Three.js version**

Run: `cd frontend && npm install three@0.185.1`

Expected: `three` appears under `dependencies`; lockfile updates cleanly.

- [ ] **Step 2: Download authoritative source textures into a temporary directory**

Use `mktemp -d` and download these verified sources:

```text
https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg
https://unpkg.com/three-globe/example/img/earth-night.jpg
https://threejs.org/examples/textures/planets/earth_normal_2048.jpg
https://threejs.org/examples/textures/planets/earth_specular_2048.jpg
https://threejs.org/examples/textures/planets/earth_clouds_1024.png
https://threejs.org/examples/textures/planets/moon_1024.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_px.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_nx.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_py.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_ny.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_pz.jpg
https://threejs.org/examples/textures/cube/MilkyWay/dark-s_nz.jpg
```

Do not place original downloads in Git.

- [ ] **Step 3: Convert raster assets locally**

Use `cwebp -quiet -q 82` for color maps and cube faces, `cwebp -quiet -q 88` for normal/specular maps, and preserve the cloud alpha source as PNG. Copy the 1K day/night maps as fallback Earth layers. Verify each output with `sips -g pixelWidth -g pixelHeight` and keep every map at or below 2048×2048 per face/map dimension.

- [ ] **Step 4: Document source and redistribution details**

Create `ASSETS.md` containing a table with local filename, exact source URL, source project/agency, retrieval date `2026-08-05`, conversion command, and license/attribution note. State that the Earth imagery is NASA-derived and the Three.js example assets retain their upstream provenance; include direct source links rather than claiming original authorship.

- [ ] **Step 5: Verify assets and build**

Run:

```bash
cd frontend
find public/images/earth-scene -type f -maxdepth 1 -print
du -ch public/images/earth-scene/*
npm run build
```

Expected: all listed files exist; no single texture exceeds 2 MB; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/public/images/earth-scene
git commit -m "feat: add optimized Earth scene assets"
```

---

### Task 3: Interruption-Safe Theme Transition Controller

**Files:**
- Create: `frontend/src/components/earth-scene/theme-transition.js`
- Create: `frontend/src/components/earth-scene/theme-transition.test.js`

**Interfaces:**
- Produces: `createThemeTransition(initialValue: number, durationMs?: number)`.
- Returned interface: `{ retarget(target: number, nowMs: number): void, valueAt(nowMs: number): number, snap(target: number): void }`.
- `EarthScene.jsx` consumes this controller once and samples it each frame.

- [ ] **Step 1: Write failing transition tests**

Create `theme-transition.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createThemeTransition } from "./theme-transition.js";

test("moves from day to night and lands exactly on the target", () => {
  const transition = createThemeTransition(0, 1650);
  transition.retarget(1, 100);
  assert.equal(transition.valueAt(100), 0);
  assert.ok(transition.valueAt(925) > 0.45);
  assert.equal(transition.valueAt(1750), 1);
});

test("rapid reversal continues from the current value without a jump", () => {
  const transition = createThemeTransition(0, 1650);
  transition.retarget(1, 0);
  const before = transition.valueAt(500);
  transition.retarget(0, 500);
  assert.equal(transition.valueAt(500), before);
  assert.ok(transition.valueAt(900) < before);
  assert.equal(transition.valueAt(2150), 0);
});

test("snap supports reduced motion", () => {
  const transition = createThemeTransition(0, 1650);
  transition.snap(1);
  assert.equal(transition.valueAt(10), 1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd frontend && npm test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `theme-transition.js`.

- [ ] **Step 3: Implement the controller**

Implement clamped interpolation with an ease-in-out cubic. `retarget()` must first call `valueAt(nowMs)`, store that exact value as the new start, and then set the new target/start time. `valueAt()` must return exact endpoint values after the duration and must never return outside `[0, 1]`.

```js
const clamp01 = value => Math.min(1, Math.max(0, value));
const easeInOutCubic = value => value < 0.5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2;

export function createThemeTransition(initialValue, durationMs = 1650) {
  let from = clamp01(initialValue);
  let current = from;
  let target = from;
  let startedAt = 0;

  const valueAt = nowMs => {
    if (current === target && from === target) return target;
    const progress = clamp01((nowMs - startedAt) / durationMs);
    current = from + (target - from) * easeInOutCubic(progress);
    if (progress === 1) from = current = target;
    return current;
  };

  return {
    valueAt,
    retarget(nextTarget, nowMs) {
      current = valueAt(nowMs);
      from = current;
      target = clamp01(nextTarget);
      startedAt = nowMs;
    },
    snap(nextTarget) {
      from = current = target = clamp01(nextTarget);
    },
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `cd frontend && npm test`

Expected: theme and transition tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/earth-scene/theme-transition.js frontend/src/components/earth-scene/theme-transition.test.js
git commit -m "feat: add reversible theme transition controller"
```

---

### Task 4: Build the Three.js Scene Units

**Files:**
- Create: `frontend/src/components/earth-scene/scene-assets.js`
- Create: `frontend/src/components/earth-scene/scene-assets.test.js`
- Create: `frontend/src/components/earth-scene/create-earth.js`
- Create: `frontend/src/components/earth-scene/create-celestial.js`
- Create: `frontend/src/components/earth-scene/create-space.js`

**Interfaces:**
- `loadSceneAssets(renderer): Promise<SceneAssets>` loads all local maps and assigns correct color spaces.
- `disposeSceneAssets(assets): void` disposes every texture/cube texture exactly once.
- `createEarth(assets): { group, update(progress, elapsedSeconds, idleEnabled), dispose() }`.
- `createCelestialBodies(assets): { group, update(progress, viewport), dispose() }`.
- `createSpaceBackground(assets, quality): { group, update(progress, elapsedSeconds, idleEnabled), dispose() }`.

- [ ] **Step 1: Implement the asset manifest and loader**

Map every local URL under `/images/earth-scene/`. Use `TextureLoader` for planar maps and `CubeTextureLoader` for six Milky Way faces. Set color maps, night lights, clouds, Moon, and cube background to `SRGBColorSpace`; keep normal/specular maps in linear color space. Set anisotropy to `min(8, renderer.capabilities.getMaxAnisotropy())` for Earth color maps.

Treat day color, night lights, clouds, Moon, and all six Milky Way faces as required. If any required texture fails, reject scene initialization and retain the static fallback. Treat normal and specular maps as non-critical: resolve either failure as `null` and construct the Earth without that material property. `disposeSceneAssets()` must iterate unique texture objects through a `Set` before calling `dispose()`.

- [ ] **Step 2: Implement `createEarth`**

Use one `SphereGeometry(2.6, 96, 64)` on desktop; quality reduction is handled by `EarthScene` before construction. Build:

- a `MeshPhongMaterial` daylight surface using day, normal, and specular maps;
- a second same-radius emissive city-light mesh using additive blending, transparent opacity, and `depthWrite: false`;
- a cloud shell at radius `2.625`, transparent with `depthWrite: false`;
- a back-sided atmosphere sphere at radius `2.72` with a Fresnel `ShaderMaterial`.

Initialize Earth orientation to show Africa/Europe (`rotation.y` tuned from the day map; initial target `-0.35` radians). `update()` must apply the 125-degree theme rotation, crossfade city-light opacity from 0 to its final restrained value, rotate clouds slightly faster than Earth only when idle motion is enabled, and interpolate atmosphere color from warm cyan-white to cool blue.

The surface remains physically lit; do not crossfade to a flat night photograph. City lights supply emissive detail while the directional light moves behind the globe.

- [ ] **Step 3: Implement Sun and Moon**

Create a Sun sphere with a small additive sprite glow and a Moon sphere with the Moon texture and bump map when available. `update(progress, viewport)` must interpolate along smooth quadratic Bézier paths:

- Sun: top-right partial crop → farther top-right, smaller, opacity 0.
- Moon: outside top-right, smaller, opacity 0 → top-right partial crop, normal scale, opacity 1.

Use shorter control-point offsets when `viewport.mobile` is true. Ensure the two bodies overlap in visibility only during the middle 20–30% of the transition.

- [ ] **Step 4: Implement realistic space**

Use the local Milky Way cube texture as a low-intensity scene background layer and add deterministic `Points` geometry for foreground stars. Use a seeded pseudo-random generator so Strict Mode remounts produce identical positions. Desktop gets at most 900 star points and 90 dust points; mobile gets at most 320 stars and no dust. Interpolate star material opacity modestly from day to night. Do not use per-star React elements or allocate in `update()`.

- [ ] **Step 5: Add unit-level disposal assertions to the transition test suite**

Create `scene-assets.test.js` with fake disposable textures and the exported `disposeUniqueTextures()` helper from `scene-assets.js`. Verify duplicate references call `dispose()` once and null entries are ignored.

- [ ] **Step 6: Run tests and build**

Run: `cd frontend && npm test && npm run build`

Expected: all tests PASS; no Three.js import/build errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/earth-scene
git commit -m "feat: build photorealistic Earth scene units"
```

---

### Task 5: Add the React Scene Lifecycle and Responsive Fallback

**Files:**
- Create: `frontend/src/components/earth-scene/EarthScene.jsx`
- Create: `frontend/src/components/earth-scene/earth-scene.css`

**Interfaces:**
- Produces React component `EarthScene({ darkMode: boolean }): JSX.Element`.
- Consumes scene factories from Task 4 and `createThemeTransition` from Task 3.
- Exposes no user interaction and no imperative API.

- [ ] **Step 1: Implement stable decorative markup and static fallback**

Render:

```jsx
<div className={`earth-scene ${darkMode ? "is-night" : "is-day"}`} aria-hidden="true">
  <div className="earth-scene__fallback" data-testid="earth-scene-fallback">
    <img className="earth-scene__fallback-day" src="/images/earth-scene/earth-day-fallback-1k.webp" alt="" />
    <img className="earth-scene__fallback-night" src="/images/earth-scene/earth-night-fallback-1k.webp" alt="" />
  </div>
  <canvas ref={canvasRef} className={ready ? "earth-scene__canvas is-ready" : "earth-scene__canvas"} />
  <div className="earth-scene__scrim" />
</div>
```

The fallback images are circular globe layers positioned bottom-left, not full-bleed wallpaper. The fallback and canvas occupy identical fixed hero geometry, preventing layout shift.

- [ ] **Step 2: Implement renderer setup**

Inside one mount effect:

- detect WebGL support using canvas context creation;
- create `WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" })`;
- cap DPR at `1.75` desktop and `1.25` mobile;
- set output color space to sRGB and tone mapping to ACES Filmic;
- create camera/scene/lights and load scene assets;
- construct Earth, celestial, and space units only after required texture load;
- fade the canvas in only after the first successful render;
- leave the fallback visible permanently if setup or required texture loading fails.

Guard Strict Mode asynchronous completion with an `alive` boolean.

- [ ] **Step 3: Implement one animation loop**

Use refs for the current `darkMode`, reduced-motion state, visibility, viewport, scene units, and transition controller. Each frame:

1. sample normalized progress;
2. update Earth, celestial, and space units;
3. render once;
4. request another frame only while visible and the document is not hidden.

When no theme transition or idle motion is active, reduced-motion users render only on resize/theme change.

- [ ] **Step 4: Implement visibility, resize, and reduced-motion handling**

- `IntersectionObserver` toggles hero visibility with a small root margin.
- `visibilitychange` pauses/resumes rendering.
- `ResizeObserver` updates canvas size, camera aspect, and responsive camera/composition values.
- `matchMedia('(prefers-reduced-motion: reduce)')` snaps transitions and disables idle motion.
- The `darkMode` effect calls `retarget(Number(darkMode), performance.now())`, or `snap()` under reduced motion, then ensures the loop is running.

- [ ] **Step 5: Implement responsive CSS**

CSS requirements:

- `.earth-scene { position:absolute; inset:0; overflow:hidden; pointer-events:none; contain:layout paint; }`
- canvas/fallback fill the hero without affecting layout;
- desktop Earth composition matches `clamp(680px, 68vw, 980px)` and bottom-left crop;
- tablet moves Earth farther left/down and shortens celestial travel through viewport values;
- mobile heavily crops a lower Earth, reduces visual intensity, and keeps headline/CTA clear;
- `@media (max-height: 680px)` pushes Earth lower;
- `@media (prefers-reduced-motion: reduce)` limits fallback crossfade to 200ms and disables ambient CSS motion;
- light/night background and scrim states transition without expensive animated filters.

- [ ] **Step 6: Implement complete cleanup**

On unmount: cancel RAF, disconnect observers, remove document/media listeners, call each unit's `dispose()`, dispose assets, dispose renderer, and call `renderer.forceContextLoss()`. Do not remove or mutate a canvas owned by React.

- [ ] **Step 7: Run tests and build**

Run: `cd frontend && npm test && npm run build`

Expected: tests PASS; build succeeds; no CSS import warning.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/earth-scene
git commit -m "feat: add responsive Earth scene lifecycle"
```

---

### Task 6: Integrate Earth Scene into the Landing Hero

**Files:**
- Modify: `frontend/src/components/landing.jsx:1-285,982-1060,1592-1742`

**Interfaces:**
- Consumes: `<EarthScene darkMode={darkMode} />` from Task 5.
- Preserves: `LandingPage` public props and every hero CTA callback.

- [ ] **Step 1: Import and render the scene**

Add:

```js
import EarthScene from "./earth-scene/EarthScene.jsx";
```

Replace `<HeroPhoto dark={darkMode} />` and `<HeroOrnaments />` with:

```jsx
<EarthScene darkMode={darkMode} />
```

Keep the hero content container at a higher z-index than the scene and preserve its existing width, typography, copy, and CTA structure.

- [ ] **Step 2: Remove superseded hero code only**

Delete `HeroPhoto`, `HeroOrnaments`, `FloatMark`, and hero-only keyframes/classes that no remaining element uses (`lpGridDrift`, `lpFloat`, `lpTwinkle` after confirming with `rg`). Keep shared page animations used downstream.

- [ ] **Step 3: Tune hero contrast without changing copy**

Ensure light-mode text stays readable over the brighter space background. Prefer the scene's directional scrim; make only small color/opacity adjustments to existing hero text/button styles if browser verification proves necessary.

- [ ] **Step 4: Run static checks, tests, and build**

Run:

```bash
cd frontend
rg -n "HeroPhoto|HeroOrnaments|FloatMark|campus_day|campus_night" src
npm test
npm run build
```

Expected: `rg` returns no landing references; tests PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing.jsx
git commit -m "feat: integrate Earth scene into landing hero"
```

---

### Task 7: Browser Verification and Production Hardening

**Files:**
- Modify only when a concrete verification defect is reproduced: `frontend/src/components/earth-scene/*`, `frontend/src/components/landing.jsx`, `frontend/src/App.jsx`, `frontend/index.html`
- Update if implementation details change: `frontend/public/images/earth-scene/ASSETS.md`

**Interfaces:**
- Verifies the complete user-visible flow; produces no new public interface.

- [ ] **Step 1: Start the production-equivalent frontend**

Run:

```bash
cd frontend
npm run build
npm run preview -- --host 127.0.0.1
```

Open the preview through the available browser-control tooling.

- [ ] **Step 2: Verify initial theme matrix**

For each case, reload from a fresh document and capture the hero before interacting:

- saved `light`, dark system;
- saved `dark`, light system;
- no saved value, light system;
- no saved value, dark system.

Expected: correct background appears on first paint; no opposing-theme flash; React state and theme button agree.

- [ ] **Step 3: Stress rapid theme toggles**

Toggle at roughly 150–300ms intervals during the 1.65-second transition. Confirm Earth, lights, atmosphere, background, stars, Sun, and Moon reverse continuously from their current positions. Confirm no canvas remount, object pop, white flash, or console error.

- [ ] **Step 4: Verify responsive layouts**

Inspect at minimum:

- 1440×900 desktop;
- 1024×768 tablet;
- 390×844 mobile;
- 360×640 short mobile.

Confirm Earth remains bottom-left, Africa/Europe is visible in day mode, Sun/Moon remain secondary, text/CTAs/nav remain unobstructed, and no horizontal overflow exists.

- [ ] **Step 5: Verify accessibility and fallbacks**

- emulate reduced motion and confirm no idle animation or travel sequence;
- block WebGL context creation and confirm correct-theme fallback remains visible;
- keyboard through navigation and hero CTAs to confirm scene never receives focus;
- inspect accessibility tree to confirm scene is hidden;
- verify contrast in both themes.

- [ ] **Step 6: Verify lifecycle and performance**

- scroll hero fully offscreen and confirm RAF/rendering pauses;
- background the tab and confirm rendering pauses;
- return and confirm transition state remains correct;
- inspect console under React Strict Mode for duplicate renderers, texture warnings, WebGL context leaks, or failed asset requests;
- compare built JS and texture sizes against baseline; keep added compressed JS near the expected Three.js cost and total initial texture transfer bounded through fallback-first loading;
- confirm no visible layout shift as canvas replaces fallback.

- [ ] **Step 7: Fix only observed implementation defects and rerun all checks**

For every defect, reproduce it, make the smallest scoped correction, repeat the relevant browser scenario, then run:

```bash
cd frontend && npm test && npm run build
```

Expected: all tests PASS and build succeeds after final corrections.

- [ ] **Step 8: Final commit**

```bash
git add frontend/index.html frontend/src/App.jsx frontend/src/components/landing.jsx frontend/src/components/earth-scene frontend/public/images/earth-scene frontend/package.json frontend/package-lock.json
git commit -m "fix: harden landing Earth scene across devices"
```

---

## Completion Criteria

- Light mode presents a photorealistic Africa/Europe Blue Marble, illuminated atmosphere, visible Sun, and restrained realistic stars.
- Dark mode continuously rotates to the night side, reveals city lights, cools the atmosphere, darkens space, removes the Sun, and brings in the Moon.
- Repeated toggles reverse smoothly from the current animation state.
- Saved and system themes render correctly before React hydration/mount.
- Desktop, tablet, mobile, short-height, reduced-motion, and WebGL-fallback paths are verified.
- Existing landing content and functionality remain intact.
- All Node tests and the Vite production build pass.
- No unrelated working-tree files are modified or committed.
