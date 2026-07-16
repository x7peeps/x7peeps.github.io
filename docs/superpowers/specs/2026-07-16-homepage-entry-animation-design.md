# X7PEEPS Homepage Entry Animation Design

Date: 2026-07-16

## Goal

Create a cinematic homepage entry animation that makes X7PEEPS feel like a high-end future knowledge system rather than a static documentation site.

The opening should establish brand memory first, then reveal the existing homepage structure and sidebar navigation. It must preserve the current dark visual language, knowledge density, and readable navigation.

## User Experience Principle

The entry animation is a short “arrival ritual,” not a loading screen.

It should feel like a camera entering the X7PEEPS system:

1. the page opens in a dark theater state;
2. the panda logo appears centered;
3. the virtual camera shifts toward the homepage space;
4. the logo settles back into the normal hero composition;
5. the left knowledge tree materializes last;
6. the page becomes fully interactive.

## Selected Direction: Center Logo → Camera Split

### Sequence

1. **Stage blackout**
   - Homepage first paint uses a deep-black overlay.
   - The left sidebar is hidden during the opening.
   - The homepage content is present in the DOM but visually subdued.

2. **Centered logo reveal**
   - The panda logo appears centered in the viewport.
   - The reveal uses low-intensity glow, slight scale, and subtle sharpening.
   - No loading text, percentage, spinner, or decorative copy is shown.

3. **Camera drift**
   - Background grid and particles suggest a soft push-in and lateral camera shift.
   - The movement is restrained and cinematic, not game-like or flashy.

4. **Hero reconstruction**
   - The logo moves toward its normal homepage hero position.
   - `X7PEEPS`, subtitle, mission text, and heatmap reveal in hierarchy.
   - The heatmap may softly illuminate from center outward.

5. **Sidebar materialization**
   - The left sidebar appears after the hero has visually stabilized.
   - It should feel like the navigation system coming online.
   - Sidebar reveal must be subtle and should not look like a drawer animation.

6. **Normal state**
   - The overlay is removed.
   - Scrolling and all interactions behave normally.
   - Article navigation must not replay the full homepage entry.

## Timing

Target total duration: 1.8–2.4 seconds.

Suggested timing:

- 0–180ms: black stage / initial stillness
- 180–760ms: centered logo reveal
- 620–1350ms: camera drift and hero reconstruction
- 1150–1800ms: heatmap and content reveal
- 1450–2200ms: sidebar materialization

The animation can overlap stages for smoothness, but it should not exceed roughly 2.4 seconds on desktop.

## Trigger Rules

The entry animation should trigger only on the homepage.

Recommended behavior:

- First homepage load in a browser tab: play full entry.
- Hard refresh of homepage: play full entry again only if implementation uses a page-load scoped flag; acceptable alternative is once per session.
- Clicking between articles: never play full entry.
- Returning to homepage from article: either no full entry or a very light reveal only. Default choice: no full entry.
- `prefers-reduced-motion: reduce`: skip animation and show final static layout.

## Interaction Rules

During the entry:

- Sidebar is not visible and cannot be clicked.
- Search and knowledge tree interactions are disabled until reveal completes.
- Page should not trap keyboard focus.
- No layout shift should occur after the animation finishes.

After the entry:

- Sidebar native scrolling remains unchanged.
- Existing knowledge tree structure remains unchanged.
- Existing homepage heatmap and recent updates remain unchanged.
- Article page transition behavior remains unchanged.

## Visual Language

The animation should use:

- black and near-black backgrounds;
- low-opacity cyan/blue scanning light;
- slight glow around the panda logo;
- subtle particles or grid depth;
- restrained easing, preferably cubic-bezier curves with soft deceleration.

Avoid:

- bright neon floods;
- large particle explosions;
- spinners or loading text;
- excessive blur that reduces perceived quality;
- repeated full-screen flashes.

## Technical Constraints

Stack:

- Hugo
- Relearn theme
- existing custom HTML/CSS/JS

Implementation should avoid changing Relearn source directly. Prefer:

- homepage-specific classes/data attributes;
- CSS keyframes and variables;
- small JS state management in the existing X7 home module;
- `prefers-reduced-motion` checks.

Performance constraints:

- Do not block first meaningful content in the DOM.
- Avoid heavy WebGL for v1.
- Use CSS transforms and opacity where possible.
- Existing canvas particles may be reused or lightly coordinated.
- Mobile animation should be shorter and simpler.

## Accessibility

Requirements:

- Respect `prefers-reduced-motion`.
- Keep page content available to screen readers.
- Do not introduce a focus trap.
- Do not hide semantic homepage content from assistive technology solely for visual animation.
- Ensure the final state is reachable even if JavaScript fails.

## Non-goals

- No changes to knowledge structure.
- No changes to article content.
- No new account/login concept.
- No full-screen loading page.
- No repeated dramatic animation when navigating articles.
- No replacement of the homepage design direction.

## QA Checklist

- Homepage first entry shows centered panda logo before normal layout.
- Sidebar is hidden during the opening and appears near the end.
- Final layout matches the existing homepage structure.
- Sidebar scrolling still works with trackpad.
- Menu links do not create local row-level scroll containers.
- Article navigation does not trigger full-screen flash.
- `prefers-reduced-motion` shows static layout immediately.
- Desktop animation completes within roughly 2.4 seconds.
- Mobile animation is not visually crowded.

