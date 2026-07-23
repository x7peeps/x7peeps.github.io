# X7 3D Avatar Entry Design

Date: 2026-07-23
Status: proposed for user review

## Goal

Create a first-version 3D avatar entry for the X7PEEPS homepage using the provided Meshy GLB model and reference image. The entry should make the site feel like an AI-native personal profile while preserving the current knowledge-base structure, recent updates feed, heatmap, article pages, and reading experience.

The first version is a homepage-only prototype. It should prove the visual direction before investing in Blender animation, sticker placement, eye rigging, or a reusable creator platform.

## Source Assets

- Model: `/Users/pwndazhang/Downloads/Meshy_AI_Desert_Adventure_Self_0723150708_texture.glb`
- Reference image: `/Users/pwndazhang/Downloads/43312f01-922f-4193-99c0-a4b85ad9db97.png`
- Current GLB inspection:
  - glTF 2.0 binary
  - approximately 29 MB
  - 1 scene, 1 node, 1 mesh, 1 material
  - 4 textures
  - approximately 324,039 vertices
  - no embedded animation

## Non-Goals

- Do not build the full user-facing platform for photo upload, AI model generation, sticker editing, timeline authoring, hosting, or custom domain publishing.
- Do not change article taxonomy, folder structure, section hierarchy, tags, or recent-update logic.
- Do not add 3D effects to article reading pages in the first version.
- Do not make the sidebar or reading shell depend on Three.js.
- Do not require Blender-rendered video for the first version.

## Experience Design

When the homepage first opens, the page enters a short cinematic state:

1. The left sidebar stays visually hidden for the opening moment.
2. The 3D avatar appears centered in a black X7 environment.
3. A camera orbit and slow pullback reveal the avatar rather than making the whole page flash.
4. Identity tags appear around the avatar as lightweight HUD labels:
   - Security Research
   - Forensics
   - Toolchain
   - AI
   - UAV
   - Writing
5. The camera settles into the existing X7 homepage composition.
6. The current logo, subtitle, heatmap, and recent updates become the primary reading surface again.

The effect should feel dark, restrained, futuristic, and cinematic. The model is the first-viewport signal, but the site still becomes a knowledge system quickly. The opening should be skippable and should not repeat aggressively within the same browser session.

## Visual Direction

Use the reference image for personality, not for a bright desert scene. The site should keep the current black environment and borrow only the stylized avatar identity:

- black background with low-contrast depth
- cyan/white technical accents
- warm amber used sparingly for the avatar or selected labels
- subtle particle scan around the model
- no colorful panel-heavy layout
- no large decorative cards around the 3D scene

The 3D scene should be full-bleed within the homepage hero, not displayed as a framed preview card.

## Technical Architecture

Add a homepage-only 3D entry module with clear isolation:

- Static asset location:
  - copy the GLB into a site static asset folder such as `hugo-src/static/models/x7-avatar-entry.glb`
  - keep the original Downloads file untouched
- Homepage markup:
  - add a dedicated canvas mount inside the existing home hero
  - keep existing `data-x7-home` and heatmap markup intact
- JavaScript:
  - add a small homepage-only Three.js module, loaded only when `[data-x7-home]` exists
  - use `GLTFLoader` for the model
  - drive camera orbit and intro progress with `requestAnimationFrame`
  - expose a clean completion event/class so the current sidebar entry animation can start after the avatar settles
- CSS:
  - add layered styles for the 3D canvas, labels, skip control, loading state, and reduced-motion fallback
  - keep article-page CSS untouched except for shared variables if strictly needed

## Loading And Fallbacks

Because the model is approximately 29 MB, the first implementation must be defensive:

- Desktop:
  - load the model only on the homepage
  - show a quiet loading state if the GLB takes time
  - allow skip before the model finishes loading
- Mobile or lower performance:
  - either skip realtime GLB by default or use a static hero fallback based on the current X7 logo/reference image treatment
  - never block access to recent updates
- Reduced motion:
  - do not run camera orbit or particle motion
  - reveal the normal homepage immediately
- Model load failure:
  - hide the 3D layer
  - fall back to the existing homepage without breaking heatmap rendering

## Interaction Rules

- The intro plays once per session, consistent with the current homepage entry behavior.
- A visible but quiet skip control exits the 3D entry immediately.
- Scrolling should not trap the user. If the user scrolls during the intro, the page should move toward the normal homepage state.
- The sidebar should appear after the 3D scene settles, not during the centered avatar moment.
- The left navigation tree and article reading pages must keep their current interaction behavior.

## Testing And Verification

Implementation should be verified with:

- a unit or contract test that confirms the homepage still emits heatmap data and recent-update links
- a small DOM contract test confirming the 3D mount appears only on the homepage
- `npm test`
- `git diff --check`
- Hugo build or existing project render contract
- browser verification on desktop viewport:
  - canvas is nonblank after load
  - model is framed and visible
  - skip returns to normal homepage
  - heatmap still renders cells
  - recent updates remain reachable
- browser verification on mobile viewport:
  - page is usable even if 3D is skipped or degraded

## Rollout Plan

Phase 1 is a realtime Three.js homepage prototype using the existing GLB. This validates visual direction quickly.

Phase 2, only after Phase 1 is approved visually, can move the same character into Blender for authored camera paths, sticker placement, eye rigging, and a higher-polish WebM or optimized GLB export.

Phase 3, if desired later, can explore a separate creator platform. That platform is outside this site's homepage redesign scope.

## Open Decision

The current recommendation is to implement Phase 1 first: a homepage-only realtime Three.js 3D avatar entry using the provided GLB, with strong fallbacks and no knowledge-structure changes.
