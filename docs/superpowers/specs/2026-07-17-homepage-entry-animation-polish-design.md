# X7PEEPS Homepage Entry Animation Polish Design

Date: 2026-07-17

## Status

Approved direction: **B — camera breathing with particle focus**.

This specification refines the existing homepage entry animation. It does not replace the homepage layout or the knowledge-navigation model defined in the 2026-07-16 entry-animation design.

## Goal

Make the homepage opening feel more cinematic, spatial, and premium while remaining quiet enough for a dense knowledge site. The animation should establish the panda logo as the visual anchor, then reveal the existing homepage and knowledge tree without producing a full-screen flash or delaying reading.

## Experience Sequence

1. **Dark stillness — 0–180ms**
   - The homepage begins on a stable near-black stage.
   - The sidebar is visually hidden but the document structure is already present.
   - No full-page opacity animation is applied to the body or root layout.

2. **Logo breath — 180–760ms**
   - The centered panda logo resolves from soft focus to sharp focus.
   - Scale changes remain small and use a slow deceleration curve.
   - A restrained halo expands once and fades; it must not pulse repeatedly.

3. **Particle focus — 360–1100ms**
   - A limited set of existing canvas particles drifts toward the logo's focal area.
   - Particles decelerate before reaching the center and never form an explosion.
   - The effect communicates depth and camera focus rather than a loading state.

4. **Camera reconstruction — 720–1450ms**
   - The virtual camera lightly pushes forward while the logo settles into the existing hero composition.
   - Background grid and ambient light move at lower amplitude than the logo, creating subtle parallax.
   - Title, subtitle, and mission copy appear in hierarchy without changing their final positions.

5. **Knowledge system online — 1180–1880ms**
   - The heatmap illuminates from its center with low-contrast cyan and amber accents.
   - Recent updates rise into view with a short opacity/translate transition.
   - The left sidebar appears last through a quiet fade and slight horizontal settle, not a drawer slide.

6. **Stable reading state — by 2200ms**
   - All temporary entry-state classes are removed.
   - Scrolling, search, sidebar tree interaction, and links are fully available.
   - No animation continues that competes with reading.

## Visual Rules

- Preserve the current black background and hidden component boundaries.
- Use cyan only for focus and depth; retain amber as a sparse heatmap/brand accent.
- Keep particle count low and particle brightness below the logo and title hierarchy.
- Avoid white flashes, neon floods, scan-line wipes, large blur fields, and rapid scale changes.
- Do not animate the whole page opacity, sidebar rows, or article content shell.

## Architecture

### Entry state controller

The existing homepage motion controller remains the single owner of entry state. It exposes three visual states through root classes: primed, complete, and reduced-motion. A timeout remains as a fail-safe so the sidebar and homepage cannot stay hidden if an animation event is missed.

### Particle choreography

The existing canvas particle field gains a short entry phase driven by elapsed time. During that phase, particles interpolate toward a soft focal region around the logo. After the phase ends, the same particles transition into the existing ambient drift. No second canvas, WebGL dependency, or additional animation library is introduced.

### CSS composition

CSS keyframes control logo breath, halo, hero reconstruction, heatmap illumination, feed reveal, and sidebar reveal. Only `transform`, `opacity`, and low-cost filter changes are used. Final layout dimensions remain unchanged throughout the sequence.

## Data and State Flow

1. The early header script detects the homepage before first paint and adds the primed class.
2. The homepage module reads the entry state and reduced-motion preference.
3. CSS begins the deterministic visual timeline; canvas receives the same start timestamp for particle choreography.
4. Completion removes the primed state and restores all interactions.
5. Session state prevents the full sequence from replaying during article navigation or a return to the homepage in the same tab.

## Failure and Fallback Behavior

- If JavaScript fails, CSS fallback timing restores the sidebar and normal homepage state.
- If canvas is unavailable, the CSS-only logo and camera sequence still completes.
- If the tab is backgrounded during entry, completion state wins immediately when the timeout fires; the animation does not restart.
- With `prefers-reduced-motion: reduce`, the final homepage appears immediately with particles static or disabled.
- On mobile or constrained viewports, particle convergence and parallax amplitude are reduced, and total duration is shortened.

## Scope Boundaries

- No changes to homepage information architecture, copy, heatmap data, or recent-update ordering.
- No changes to article-page transitions.
- No animation replay when selecting a knowledge-tree article.
- No changes to sidebar scrolling mechanics, row sizing, or tree expansion behavior.
- No new visual dependency or heavy rendering engine.

## Verification

Automated contracts should verify:

- the entry applies only to the homepage;
- reduced-motion restores the stable state immediately;
- the sidebar regains visibility and pointer interaction in both normal and fallback completion paths;
- no body/root full-screen opacity transition is introduced;
- particle entry mode hands off to ambient mode;
- article navigation does not activate homepage entry classes.

Manual QA should cover desktop and mobile first load, hard refresh, return from an article, background-tab recovery, trackpad sidebar scrolling, keyboard access, and reduced-motion mode. The final composition must match the current homepage after the animation completes.
