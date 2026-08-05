# Darvis Landing Hero Earth Scene Design

## Goal

Replace the landing page's campus-photo hero background with a cinematic, photorealistic, NASA-style Earth and space scene. The scene must track Darvis's existing light/dark theme, transition smoothly between day and night, preserve the current hero content and brand hierarchy, and remain performant and accessible across desktop and mobile devices.

## Existing Context

- Frontend: React 19 and Vite 8.
- Styling: inline React style objects plus page-scoped injected CSS.
- Theme: a prop-driven `darkMode` boolean initialized and persisted in `App.jsx`.
- Current hero: `HeroPhoto` in `frontend/src/components/landing.jsx`, which crossfades two large campus JPEGs and renders a drifting SVG grid.
- Existing dependencies include no 3D or general-purpose animation library.
- Existing page typography, VT-maroon accent, copy, navigation, buttons, and behavior must remain unchanged.

## Selected Approach

Use Three.js directly inside a reusable React component. A true 3D globe is justified because photorealistic rotation, directional lighting, clouds, city lights, and atmosphere are central requirements rather than decorative extras. Direct Three.js avoids adding React Three Fiber and its additional abstraction/runtime when the page needs only one bounded scene.

The implementation will add `three` as the only new runtime dependency. Theme animation will use a small requestAnimationFrame-based controller rather than a second animation library.

## Visual Direction

The hero depicts an iconic Blue Marble composition with Africa and Europe centered. Earth is the dominant visual element, partially cropped from the bottom-left. The Sun or Moon is partially cropped at the top-right. The background is realistic deep space: near-black/blue, sparse varied stars, a restrained faint Milky Way field, and minimal atmospheric dust. It must not resemble a colorful nebula wallpaper.

The existing headline remains the visual priority. A directional scrim protects text contrast without flattening the scene. Darvis's editorial serif headline, sans-serif supporting copy, VT-maroon accent, CTA buttons, navigation, and page structure remain intact.

## Components

### `EarthScene`

Owns the canvas, renderer, camera, scene graph, resize handling, visibility handling, reduced-motion behavior, WebGL capability detection, resource cleanup, and normalized theme transition value. It receives `darkMode` as its primary visual input.

### `Earth`

Creates the globe group and its layers:

- day color texture;
- night city-light texture;
- normal or bump map;
- specular/roughness map;
- transparent cloud shell rotating slightly faster than the surface;
- atmosphere shell using a compact Fresnel shader.

Africa and Europe face the camera in the light state. During the dark transition, the globe rotates 125 degrees while daylight illumination dims and the emissive city-light layer becomes visible. Minor camera-independent orientation adjustments are allowed during visual verification only if needed to preserve a recognizable landmass silhouette.

### `Sun`

Uses a restrained emissive sphere and soft sprite glow. It starts partially cropped at the top-right and follows a smooth diagonal/curved exit path while scaling down during the day-to-night transition.

### `Moon`

Uses a physically shaded sphere with a local lunar texture. It follows the complementary path into the top-right while scaling up. It remains secondary to Earth and avoids exaggerated glow.

### `SpaceBackground`

Combines a dark gradient, deterministic star points with varied size/brightness, a low-opacity local Milky Way texture, and a very small dust-particle set. Stars brighten modestly as the scene transitions to night. Ambient drift is disabled or reduced on mobile and for reduced-motion users.

### `EarthSceneFallback`

Decorative `<picture>` fallback containing optimized day and night stills. It is used when WebGL initialization fails or capability checks indicate the full scene should not run. Theme changes crossfade the stills.

## Animation Model

One normalized value drives the complete scene:

- `0`: full daylight;
- `1`: full night.

Theme changes retarget the value from its current position rather than restarting an entrance animation. This guarantees smooth reversal when the theme is toggled repeatedly before the prior transition finishes.

The full transition lasts about 1.65 seconds using a coordinated ease-in-out curve. The value controls:

- Earth rotation;
- directional-light position and intensity;
- day surface contribution;
- night-light emissive contribution;
- atmospheric color and intensity;
- background luminance;
- star and dust visibility;
- Sun position, scale, and opacity;
- Moon position, scale, and opacity.

Idle motion is limited to very slow globe rotation, slightly faster cloud rotation, and restrained star/dust drift. The animation loop pauses when the hero leaves the viewport or the document is hidden.

## Theme Initialization

The current theme initializer treats every state except an explicit saved `light` value as dark. It will be changed to:

1. use a valid persisted `light` or `dark` value when present;
2. otherwise use `window.matchMedia('(prefers-color-scheme: dark)')`;
3. fall back safely when storage or matchMedia is unavailable.

A small synchronous bootstrap in `frontend/index.html` will apply the initial theme class/data attribute before React and external fonts load. This prevents a wrong-theme flash. React remains the source of truth after mounting and keeps the document attribute synchronized with `darkMode`.

## Responsive Behavior

### Desktop

- Earth diameter: `clamp(680px, 68vw, 980px)` as the initial desktop composition.
- Position: anchored left and below the viewport edge.
- Africa/Europe remain visible beside the primary copy.
- Sun/Moon occupy the top-right edge and use their full travel paths.

### Tablet

- Earth diameter and detail reduce.
- Earth shifts farther left and down to protect the copy.
- Celestial paths shorten.
- Particle count decreases.

### Mobile

- Earth appears smaller in perceived area and more heavily cropped near the bottom-left.
- Use reduced-resolution textures and fewer stars.
- Disable Milky Way drift and most dust movement.
- Shorten Sun/Moon travel.
- Short-height media queries push Earth lower to protect headings and CTAs.
- Canvas and fallback remain clipped to the hero and never create horizontal overflow.

## Accessibility

- The entire scene is decorative, `aria-hidden`, and non-interactive.
- It cannot intercept pointer events or keyboard focus.
- `prefers-reduced-motion: reduce` disables idle rotation and travel animation. Theme changes use a brief 150–250ms material/light crossfade or an immediate state change.
- Existing text semantics and controls remain unchanged.
- Scrims and scene exposure will be tuned to maintain readable text contrast in both themes.

## Performance and Resource Management

- Add only `three`; do not add React Three Fiber, GSAP, or another animation library.
- Use local, optimized, power-of-two textures. Desktop texture maps are capped at 2K; mobile/fallback variants at 1K.
- Load the hero scene without blocking the initial text render. Show the correct-theme static fallback until the 3D scene is ready, then crossfade the canvas in.
- Cap device pixel ratio, with a lower cap on mobile.
- Reuse geometries/materials where practical.
- Pause rendering offscreen and when the document is hidden.
- Dispose renderer, textures, geometries, materials, sprites, observers, listeners, and animation frames on unmount.
- Avoid React state updates inside the render loop; mutate Three.js objects through refs.
- Keep layout dimensions stable so loading the canvas cannot shift content.

## Asset Policy

Use NASA-derived or equivalently authoritative public-domain Earth imagery where licensing and redistribution terms are explicit. Record source URLs and attribution/license notes in an asset README. Do not hotlink runtime textures. Download, optimize, and serve them locally from `frontend/public/images/earth-scene/`.

Required assets:

- Earth day color map;
- Earth night city-lights map;
- Earth normal/bump map;
- Earth specular/roughness map;
- cloud alpha/color map;
- Moon color/bump map;
- restrained star/Milky Way background or source material;
- day/night fallback stills.

## Landing Page Integration

- Replace `HeroPhoto` with `EarthScene`.
- Remove hero-only campus imagery/grid rendering and floating hero ornaments that conflict with the new composition.
- Preserve all hero copy, buttons, events, Clerk wrappers, typography, and downstream landing sections.
- Keep the scene in a focused component/module rather than expanding the already-large `landing.jsx`.
- Follow existing prop-driven theme and injected/page-scoped styling patterns where practical.

## Error Handling

- If WebGL is unavailable, texture loading fails, or renderer creation throws, retain the static fallback without surfacing an error to the user.
- Development builds may log a concise warning; production should not spam the console.
- Partial asset failure should degrade individual layers where possible rather than blanking the entire hero.

## Verification

1. Run the existing production build: `cd frontend && npm run build`.
2. Check initial load with persisted light, persisted dark, no saved theme plus light system preference, and no saved theme plus dark system preference.
3. Toggle themes repeatedly during the 1.65-second transition and confirm continuous reversal with no jumps.
4. Verify desktop, tablet, narrow mobile, and short-height mobile layouts.
5. Emulate `prefers-reduced-motion: reduce` and confirm no continuous motion.
6. Scroll the hero out of view and background the tab; confirm rendering pauses.
7. Simulate WebGL failure and confirm the correct-theme static fallback.
8. Check console for warnings/errors, texture failures, and resource leaks under React Strict Mode.
9. Review bundle size, texture transfer size, Largest Contentful Paint, and cumulative layout shift.
10. Confirm navigation, buttons, Clerk wrappers, theme control, and all downstream landing sections still function.

## Out of Scope

- Rewriting landing-page copy or brand typography.
- Redesigning navigation or downstream sections.
- Adding user camera/orbit controls.
- Making the Earth scene convey essential information.
- Adding audio, lens flares, colorful nebulae, or dense particle effects.
