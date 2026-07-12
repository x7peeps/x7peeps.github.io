# X7PEEPS Digital Nocturne Knowledge System — Design Specification

Date: 2026-07-12
Status: approved for implementation planning

## 1. Objective

Transform the current X7PEEPS Hugo site from a customized documentation theme into a distinctive personal-brand knowledge system. The homepage must establish professional identity and visual memorability; the knowledge and article surfaces must preserve the existing content hierarchy while improving navigation, scanning, tag discovery, and long-form reading.

The governing experience principle is:

> Enter like a film; read like a precision instrument.

## 2. Users and jobs

The site serves three audiences:

1. Security peers who want to assess the depth and structure of the author's work.
2. Recruiters and potential collaborators who need a fast, credible view of expertise and representative outcomes.
3. Returning readers and the author, who need efficient retrieval and deep reading.

The homepage prioritizes personal-brand comprehension. Knowledge surfaces prioritize repeat-use efficiency.

Primary jobs:

- Understand who X7PEEPS is and the main areas of expertise within approximately five seconds.
- Enter any primary knowledge domain within two interactions.
- Find content by hierarchy, search, recent history, or tag.
- Keep article structure and current reading position visible during long reads.
- Move between related topics without losing context.

## 3. Scope and constraints

### In scope

- Homepage brand narrative and immersive visual layer.
- Domain landing pages.
- Global navigation and the existing knowledge tree interaction.
- Article reading layout, chapter navigation, metadata, tags, related content, and previous/next navigation.
- Global command search.
- Unified design tokens, responsive behavior, accessibility, animation reduction, and performance degradation.
- GitHub Pages-compatible build and deployment.

### Constraints

- Retain Hugo and the Relearn theme as the underlying system.
- Do not change the existing knowledge taxonomy, content hierarchy, or article paths.
- Do not edit third-party theme source directly; override it with project layouts, partials, styles, and scripts.
- Keep the output fully static and deployable to GitHub Pages.
- Essential navigation and content must remain available when JavaScript or Canvas enhancement fails.

### Non-goals

- Rewriting article content.
- Replacing Hugo with a JavaScript application framework.
- Adding accounts, comments, payments, or community functions.
- Running high-intensity WebGL animation on article pages.

## 4. Selected direction

The selected design combines two organizing principles.

### Knowledge Constellation

Used on the homepage and as the visual transition into domain landing pages. A spatial map makes the existing knowledge domains visible as a connected system. Its job is orientation and brand memory, not decoration.

### Knowledge Cockpit

Used for domain browsing and article reading. It presents hierarchy, content, and local structure simultaneously on wide screens, with equivalent searchable drawers on smaller screens.

These surfaces share one token system but use progressively less depth and motion as the visitor moves closer to detailed content.

## 5. Experience architecture

### 5.1 Homepage: deep-scene state

The first viewport contains:

- Concise positioning statement.
- Two primary actions: “Explore the knowledge map” and “View representative work.”
- Spatial domain nodes for Security, AI, UAV, Reading, Products, and any other top-level Hugo sections.
- A small set of representative works.
- Recent activity and knowledge signals below the primary composition.

The spatial map is a progressive-enhancement Canvas layer. Every domain node also exists as a semantic HTML link. Meaningful foreground content is visible on first paint and is never opacity-gated behind animation initialization.

### 5.2 Domain page: middle-scene state

A selected domain resolves into a task-oriented landing page containing:

- Domain purpose and scope.
- Existing child hierarchy.
- Featured articles.
- Recent updates.
- Popular or representative tags.
- Direct search within the domain.

Only restrained background light, grid, and transition effects remain.

### 5.3 Article page: near-scene state

Wide screens use three functional zones:

1. Collapsible knowledge tree.
2. Bounded prose column.
3. Sticky chapter radar.

The particle render loop does not run on article pages. Background treatment is limited to solid depth layers, subtle grain, and reading-progress feedback.

## 6. Visual system: Digital Nocturne

### 6.1 Color

- Near-black “Void” base.
- Carbon and steel-blue depth layers.
- Cold white primary text.
- Ice-blue “Ion” accent for focus, active navigation, and connected knowledge nodes.
- Independent warm semantic colors for warnings, risk, and destructive states.

Approximately 95% of the interface remains neutral. Glow is reserved for state and focus.

### 6.2 Typography

- A compact, wide, future-facing sans serif for brand display headings.
- A neutral, highly legible CJK-capable sans serif for body text.
- A monospace face for system labels, metadata, keyboard shortcuts, and code.
- Prose measure is capped at roughly 68–76 CJK characters per line.

### 6.3 Material and depth

The homepage material stack is:

1. Near-black base.
2. Fine perspective grid.
3. Sparse knowledge particles and connecting lines.
4. Localized cold volumetric light.
5. Subtle film grain.

Glass surfaces are used sparingly. Article panels and navigation rails use stable opaque depth layers for contrast.

### 6.4 Motion

- Motion is slow, low-frequency, and inertial.
- Particles represent content nodes and relationships; they are not random decorative dust.
- Homepage-to-domain transition focuses and advances toward a selected node.
- Domain-to-article transition flattens spatial depth into the reading shell.
- `prefers-reduced-motion` receives a static constellation and non-spatial transitions.

## 7. Knowledge Cockpit behavior

### 7.1 Knowledge tree

- Preserve the Hugo hierarchy exactly.
- Expand the current branch by default and collapse unrelated deep branches.
- Remember expansion state locally.
- Provide tree-local filtering.
- Provide recent and optional saved destinations without altering taxonomy.
- Use semantic disclosure controls and visible keyboard focus.

### 7.2 Article canvas

- Show domain, update date, estimated reading time, difficulty when available, and tags directly below the title.
- Keep text at a stable reading measure.
- Allow code blocks, large diagrams, images, and tables to use a controlled wider breakout.
- Provide explicit overflow behavior for historical wide content.
- Offer “Comfortable” and “Compact” density presets without changing document meaning.

### 7.3 Chapter radar

- Generate from article headings.
- Use scroll spy to expose the active chapter and local neighbors.
- Show article progress and current chapter number.
- Preserve direct heading links.
- Show related tags and related content below the chapter list when space permits.

### 7.4 Tags

- Treat tags as a cross-cutting navigation layer.
- Render standardized tag chips in article metadata and cards.
- Tag pages support filtering by domain, year, and content type when the metadata exists.
- Related content uses shared tags with domain relevance as an additional ranking signal.
- Articles with missing tags render cleanly and enter a metadata cleanup report; no empty tag UI is shown.

### 7.5 Search and keyboard access

- `Cmd/Ctrl + K`: open global command search.
- Search titles, descriptions, domains, and tags from a build-time static index.
- Display recent destinations before a query is entered.
- Support quick preview for focused results.
- `[` and `]`: previous and next article when focus is not inside an editable or code control.
- `Alt + Up/Down`: previous and next chapter when the shortcut does not conflict with the platform.
- All shortcuts have discoverable clickable equivalents.

### 7.6 Responsive behavior

On smaller screens:

- Article content becomes a single column.
- Knowledge tree opens from a searchable left drawer.
- Chapter radar opens from a persistent progress control on the right or lower edge.
- Search remains accessible in the top navigation.
- Tags scroll horizontally when necessary.
- Previous/next navigation appears after the article.

## 8. Technical architecture

### 8.1 Hugo boundaries

Create project-owned layout shells for homepage, domain, taxonomy, and article surfaces. Compose them from focused partials, including:

- Brand header and global navigation.
- Knowledge tree.
- Domain map data.
- Article metadata.
- Tag chips and taxonomy filters.
- Chapter radar.
- Related content.
- Search dialog.

Existing Hugo page-tree and taxonomy APIs remain the source of truth. The visual constellation receives build-time JSON derived from the same page tree.

### 8.2 CSS

Use layered project styles:

1. Design tokens.
2. Base/theme overrides.
3. Layout shells.
4. Components.
5. Utilities and accessibility states.
6. Motion and reduced-motion overrides.

Do not grow a single catch-all stylesheet without internal organization.

### 8.3 JavaScript

Separate modules by responsibility:

- Constellation renderer.
- Performance and motion policy.
- Knowledge-tree state and filtering.
- Command search.
- Chapter scroll spy and reading progress.
- Page-transition enhancement.

Do not add these responsibilities to the existing monolithic `custom.js` without extracting clear module boundaries.

### 8.4 Visual rendering choice

Use Canvas 2D or a minimal project-owned WebGL layer after measuring the required node count and effects. Do not introduce React. DOM elements own all readable content and interaction; Canvas owns only background nodes, lines, light, and depth.

### 8.5 GitHub Pages

The generated site remains static HTML, CSS, JavaScript, images, fonts, and JSON. A GitHub Actions workflow may build Hugo and deploy the artifact to GitHub Pages. Preserve the custom domain configuration and ensure all URLs work both at the configured base URL and in local preview.

## 9. Performance budget and degradation

- Essential first-viewport HTML must render without waiting for JavaScript.
- Target additional compressed homepage animation code at approximately 120 KB or less.
- Target 80–140 particles on capable desktops and 25–50 on mobile.
- Stop rendering while the page is hidden.
- Reduce particle count, blur, and update frequency when sustained frame rate falls below the quality threshold.
- Use a static CSS/light-field fallback when Canvas is unavailable or motion reduction is requested.
- Do not run the constellation animation on article pages.
- Avoid layout shifts caused by fonts, media, metadata, or late animation initialization.

## 10. Error and empty states

- Search index failure: show navigation and knowledge-tree routes; explain that search is unavailable.
- Constellation failure: show the complete static HTML domain map over the static background.
- Missing tags or optional metadata: omit the empty component without affecting layout.
- JavaScript disabled: preserve standard links, article contents, the page hierarchy, and server-generated heading links.
- Very long titles: wrap without covering metadata or controls.
- Wide code, images, and tables: scroll or break out within defined bounds, never widen the complete prose column.

## 11. Verification strategy

### Build and integrity

- Hugo production build succeeds without template errors.
- Internal links, canonical URLs, assets, taxonomies, and custom domain output are valid.
- Existing content paths remain unchanged.

### Functional coverage

Test:

- Homepage constellation and static fallback.
- Domain landing pages.
- Ordinary and deeply nested articles.
- Long articles with many headings.
- Code-heavy, table-heavy, and image-heavy historical content.
- Tag index, filtered tag pages, missing-tag articles, and related content.
- Search success, empty results, index failure, keyboard use, and quick preview.

### Responsive and accessibility

- Validate representative desktop, tablet, and phone widths.
- Complete keyboard paths for global navigation, tree, search, chapter radar, tags, and drawers.
- Validate contrast, focus visibility, target sizes, semantic headings/disclosures, and reduced motion.
- Use automated accessibility checks as a baseline and perform a manual assistive-technology pass before release.

### Performance and visual quality

- Measure first paint, layout shift, interaction delay, script weight, and animation frame stability.
- Compare static and enhanced states.
- Run visual regression checks for the three scene states and common content types.
- Verify on at least one lower-power/mobile device profile.

## 12. Success criteria

- A new visitor can identify the author positioning and principal fields in roughly five seconds.
- Any primary domain is reachable within two interactions from the homepage.
- Long articles expose current chapter, progress, hierarchy, and tags without obscuring the content.
- Desktop and mobile retain complete browsing and reading capability.
- Animation adds no content delay, navigation blockage, substantial input lag, or layout instability.
- The site remains fully deployable as a static GitHub Pages artifact.

## 13. Risks and controls

- **Theme coupling:** Relearn DOM and CSS may constrain layout. Control by overriding project layouts and avoiding direct third-party edits.
- **Animation cost:** Blur and particle density may degrade mobile performance. Control with fixed budgets and automatic quality tiers.
- **Historical metadata gaps:** Tags and summaries may be incomplete. Control with graceful omission and a generated cleanup report.
- **Navigation complexity:** Three-zone layouts can feel crowded. Control with focus-current-branch behavior, collapsible rails, and density testing.
- **Visual overreach:** Futuristic styling can reduce clarity. Control by confining strong depth to the homepage and treating glow as a state indicator.

## 14. Implementation sequencing constraint

Implementation planning must establish the static information architecture and reading shell before adding the constellation renderer. The enhanced visual layer is accepted only after the static homepage, domain pages, article cockpit, tags, and search meet the functional and accessibility criteria.
