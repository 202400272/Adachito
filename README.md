# AdaShimaverse

A curated, data-driven archive and reference site for **Adachi and Shimamura (安達としまむら)**. The project combines a lightweight static web architecture with structured JSON data, modular CSS, and client-side JavaScript to provide an accessible archive for the novels, manga, statistics, gallery, reading resources, and related series information.

---

## Overview

AdaShimaverse is designed as a **static-first archive** rather than a traditional database-backed web application.

The project separates:

- **Content** — structured JSON data
- **Presentation** — modular HTML/CSS
- **Behavior** — vanilla JavaScript
- **Assets** — local images, icons, fonts, and downloadable resources

This separation makes the archive easy to maintain, deploy, and update without requiring a backend or database for ordinary catalogue changes.

---

## Technology Stack

### Core

| Technology | Role |
|---|---|
| **HTML5** | Page structure and semantic markup |
| **CSS3** | Layout, visual system, responsive design, animations, and themes |
| **JavaScript (ES6+)** | Client-side rendering, filtering, navigation, search, statistics, and UI interactions |
| **JSON** | Primary content/data source for catalogue metadata |
| **SVG** | Icons and scalable interface graphics |
| **Vite** | Local dev server (`npm run dev`) and preview server (`npm run preview`) |
| **Node scripts** | Production build (`npm run build`) — see [Build Pipeline](#build-pipeline) below |
| **Cloudflare Pages / Wrangler** | Hosting and local Pages-environment testing |

The site intentionally avoids a large frontend framework. Most functionality is implemented with **native browser APIs and modular vanilla JavaScript**.

### Styling

The stylesheet architecture is component-oriented rather than being a single monolithic stylesheet.

Major areas include:

```text
src/css/
├── manga/
├── novels/
├── gallery/
├── stats/
├── help/
├── reader/
├── downloads/
└── components/
```

Manga and Novel pages are further divided into component styles for elements such as:

- page titles
- search controls
- filters
- volume grids
- volume cards
- list views
- metadata
- responsive layouts

This keeps page-specific styling isolated and reduces the need to modify global styles when changing an individual component.

### JavaScript

The JavaScript layer is similarly divided by feature/page.

Typical responsibilities include:

- loading JSON data
- rendering catalogue entries
- search and filtering
- grid/list view switching
- chapter and volume interactions
- statistics calculations
- gallery behavior
- help-center search
- navigation and theme behavior
- local UI state

The application uses browser-native APIs wherever practical instead of introducing a framework dependency.

---

## Data Architecture

The archive uses JSON as its primary content layer.

Conceptually:

```text
JSON data
   │
   ▼
JavaScript data loader
   │
   ▼
Page renderer
   │
   ▼
HTML components
   │
   ▼
Modular CSS
```

This allows catalogue information to be updated independently from the visual implementation.

### Why JSON?

JSON works particularly well for this project because the archive contains structured, mostly read-only information such as:

- volume metadata
- publication dates
- chapter information
- page counts
- descriptions
- characters
- tags
- artwork metadata
- release status
- series information

A content update therefore normally requires changing the relevant JSON rather than modifying page markup.

---

## Site Architecture

The project is organized around independent archive sections.

### Novels

The novel archive presents the light novel catalogue and its associated metadata.

Primary UI concerns:

- volume browsing
- cover presentation
- metadata
- search/filter controls
- grid/list views
- responsive layouts

### Manga

The manga archive presents manga editions and volume information.

It uses the same general data-driven philosophy while maintaining its own component stylesheet structure.

### Statistics

The statistics section turns the catalogue data into derived information such as:

- released volumes
- upcoming volumes
- chapter counts
- page counts
- publication span
- publication patterns
- translation-related metrics

Statistics should be treated as **derived values**, not manually maintained duplicate data.

### Gallery

The gallery provides a visual catalogue for cover artwork and related publication imagery.

### Help Center

The Help Center provides documentation for navigating and understanding the archive, including explanations of catalogue conventions and statistics.

### Reader / Downloads

Reading and download-related features are kept separate from the general catalogue UI so that archive browsing and reading functionality do not become tightly coupled.

---

## Theme System

The interface uses a **time-based theme system**.

The navigation menu acts as the visual reference for the three primary states:

```text
Morning
   ↓
Afternoon
   ↓
Night
```

The library sections mirror the menu's theme values rather than defining an unrelated dark/light system.

### Night Mode

Night mode is intended to be a genuine dark interface rather than simply applying darker cards.

It changes:

- page backgrounds
- surfaces
- borders
- text hierarchy
- controls
- accents
- shadows
- focus states

The night palette prioritizes readability, with bright primary text and softer secondary text against the deep purple background.

Theme transitions are intentionally subtle, and reduced-motion preferences are respected where applicable.

---

## Responsive Design

The project uses responsive CSS rather than a separate mobile application.

Layouts adapt across:

- desktop
- tablet
- mobile

The catalogue pages use flexible grids, responsive controls, and mobile-specific adjustments where necessary.

The design goal is to preserve information hierarchy while reducing visual density on smaller screens.

---

## Performance Philosophy

AdaShimaverse is designed around a **static-first, low-dependency architecture**.

Key principles:

### Minimal JavaScript dependencies

Vanilla JavaScript avoids the runtime and bundle overhead of a large frontend framework.

### Local assets

Frequently used assets can be served locally rather than depending on third-party services.

### Data-driven rendering

Content is loaded from structured data instead of duplicating large amounts of HTML.

### Componentized CSS

Page and component styles are separated to make the stylesheet easier to reason about and maintain.

### Progressive enhancement

Core archive information should remain understandable without relying on complex client-side effects.

### Non-blocking third-party stylesheets

Google Fonts and Font Awesome are loaded with the `media="print"` → `onload="this.media='all'"` swap pattern (see `index.html` or `src/pages/Adashima_Extra_Stories.html`), with a `<noscript>` fallback, so they don't block first paint. When adding a new page or a new third-party stylesheet, follow this same pattern rather than a plain blocking `<link rel="stylesheet">`.

Known inconsistency to resolve: the homepage currently references Font Awesome `6.5.0` while every other page references `6.4.0`. This means the two versions are cached separately instead of being shared across page navigations — worth aligning to a single version.

Fonts or stylesheets that are only needed conditionally (e.g. an opt-in accessibility font) should be injected via JavaScript only when the feature is actually used, rather than loaded unconditionally in `<head>` — see `loadDyslexicFont()` in `src/js/extra-stories.js` for the established pattern.

---

## Project Structure

A simplified structure looks like:

```text
adashimaverse/
├── index.html                 # Homepage (Vite entry point)
├── offline.html
├── sw.js                      # Cache-clearing "kill switch", not an offline cache
├── _headers                   # Cloudflare Pages: no-cache exceptions for shared files
├── _redirects                 # Cloudflare Pages: clean-URL routing
├── wrangler.toml               # Cloudflare Pages config (pages_build_output_dir = "dist")
├── vite.config.js              # Entry points for `npm run dev` / `npm run preview`
├── package.json
│
├── scripts/
│   ├── build.js                # Runs on `npm run build` — plain recursive copy to dist/
│   ├── build-pages.js          # Copies src/pages/*.html to project root (not run by default)
│   └── copy-static.js          # Post-`vite build` static asset copy (not run by default)
│
├── src/
│   ├── pages/                  # One HTML file per site section, e.g. Adashima_Manga.html
│   │   └── otros/               # A few pages with their own sub-scripts
│   │
│   ├── js/                     # Mostly one file per page: manga.js, novelas.js, stats.js, ...
│   │
│   ├── css/                    # Mix of flat per-page files and per-section folders
│   │   ├── manga/
│   │   ├── novels/
│   │   ├── gallery/
│   │   └── components/
│   │
│   ├── components/              # Shared fragments (menu.html) fetched at runtime
│   │
│   └── data/                   # JSON content, fetch()'d per page
│
├── assets/
│   ├── Imagenes/
│   └── Sound/
│
└── dist/                       # Build output — not committed source of truth
```

The exact directory contents may evolve as new archive sections are added. Run `find src -maxdepth 2 -type d` locally for the current authoritative layout rather than relying solely on this diagram.

---

## Development

### Requirements

- Node.js (for `npm install`, Vite, and the build scripts)
- A modern browser — Chromium-based, Firefox, or Safari

### Setup

```bash
npm install
```

### Local development (Vite dev server)

```bash
npm run dev
```

Starts Vite's dev server with hot reload. This is the fastest loop for day-to-day work on markup, styles, and scripts.

### Preview a Vite build

```bash
npm run preview
```

Serves the output of `vite build` locally. Note this is **not** the same pipeline as `npm run build` — see [Build Pipeline](#build-pipeline).

### Testing against the real Cloudflare Pages environment

Because the site relies on `_headers`, `_redirects`, and clean-URL routing that only Cloudflare Pages actually enforces, use Wrangler to test those behaviors locally rather than trusting the Vite dev server alone:

```bash
# Test the production build output (recommended before deploying)
npm run build
npx wrangler pages dev dist --port 5500

# Test directly from the project root (no build step)
npx wrangler pages dev . --port 5500
```

Use the `dist` variant before any deploy — it's the only way to catch routing or header issues that `wrangler pages dev .` won't surface.

---

## Build Pipeline

**`npm run build` runs `node scripts/build.js`**, which does a plain recursive file copy of `index.html`, `offline.html`, `sw.js`, `_redirects`, `assets/`, and `src/` into `dist/`. No bundling, minification, or hashing happens.

The repo also contains two other build-related scripts that are **not** currently wired into `npm run build`:

- **`scripts/copy-static.js`** — designed to run *after* `vite build`. It copies runtime-`fetch()`-loaded assets (JSON data, CSS/JS referenced by static string paths rather than `<link>`/`<script>` tags Vite can see) into `dist/`, and appends a `?v=<build-id>` cache-busting query to internal `src`/`href` attributes in the built HTML.
- **`scripts/build-pages.js`** — copies every HTML file out of `src/pages/` to the project root, so pages exist at root-level filenames matching what `_redirects` expects.

In other words, `vite.config.js`'s `rollupOptions` (which defines a Vite entry point per page) is currently only exercised by `npm run dev` / `npm run preview` — the actual deployed `dist/` is produced by the plain-copy script, not by `vite build`. If you're picking up work here, it's worth confirming with the rest of the team whether the Vite-based pipeline (`vite build` + `copy-static.js`) is the intended direction and `build.js` is a stopgap, or the reverse — the two scripts currently disagree on how assets should be built, and only one of them runs by default.

### Manual cache-busting convention

Because most CSS/JS is referenced by static path rather than bundled, cache-busting today is done manually with a `?v=X.X.X` query string directly in the source HTML (e.g. `/src/js/index.js?v=1.5.3`). **When you edit a CSS or JS file that's referenced this way, bump its `?v=` value in every page that references it**, or returning visitors may keep serving a stale cached copy. A handful of shared files (listed below) are instead force-revalidated via `_headers` and don't need this.

### `_headers` — no-cache exceptions

The following files are explicitly set to `Cache-Control: no-cache, no-store, must-revalidate, max-age=0` in `_headers`, since they're shared across every page and aren't part of the `?v=` convention:

- `/src/css/anime.css`
- `/src/css/lang-switch.css`
- `/src/components/styles/menu.css`
- `/src/components/styles/scrollbar.css`
- `/src/components/menu.html`
- `/src/js/anime.js`
- `/src/js/language-switch.js`

If you add a new shared file that every page depends on (like the menu or a global stylesheet), consider whether it needs the same treatment.

### Service worker kill switch

`sw.js` is not a caching/offline service worker in the traditional sense — on every install/activate, in both the localhost and production branches, it clears all Cache Storage entries and unregisters itself (production additionally forces a re-navigation of open tabs). Its only real job is invalidating any old cached state after a deploy.

The `KILL_SWITCH_ID` constant at the top of the file is a version stamp; bump it (e.g. to the current date) if you need to be sure every visitor's browser fully clears stale state on next load.

---

## Updating Catalogue Data

Catalogue updates should normally be made in the relevant JSON files.

Recommended workflow:

1. Locate the appropriate data file.
2. Update the existing object rather than creating duplicate entries.
3. Preserve the existing schema.
4. Verify dates, volume numbers, chapter numbers, and status values.
5. Reload the relevant page.
6. Check derived statistics.
7. Test both desktop and mobile layouts.

Avoid hard-coding catalogue information directly into page JavaScript when the information belongs in the data layer.

---

## CSS Development Guidelines

When modifying the interface:

- Prefer the existing component stylesheet.
- Avoid adding page-specific rules to global CSS unless they genuinely belong there.
- Reuse existing CSS variables.
- Keep the time-based theme synchronized with the navigation menu.
- Do not reintroduce decorative image backgrounds into the library pages unless there is a deliberate design reason.
- Preserve readable contrast in Night Mode.
- Respect `prefers-reduced-motion`.
- Test responsive layouts after changing card or grid dimensions.

The Manga and Novel pages intentionally use separate component styles even where their UI patterns are similar.

---

## JavaScript Development Guidelines

When modifying behavior:

- Prefer existing utility functions before introducing duplicates.
- Keep data loading separate from rendering where practical.
- Avoid unnecessary DOM reflows.
- Cache frequently accessed DOM elements.
- Use event delegation for repeated dynamic elements where appropriate.
- Do not duplicate JSON data inside JavaScript.
- Keep derived statistics calculated from source data.

Because the project is primarily an archive, correctness and maintainability are generally more important than adding framework-level abstraction.

---

## Accessibility

Accessibility is treated as part of the UI architecture.

Important considerations include:

- semantic HTML
- keyboard-accessible controls
- visible focus states
- readable text contrast
- descriptive labels
- responsive text sizing
- reduced-motion support
- avoiding color as the sole indicator of state

Night Mode in particular should maintain sufficient contrast between:

```text
Primary text
Secondary text
Metadata
Interactive controls
Disabled content
Background surfaces
```

---

## Browser Storage and Client State

Where local browser state is used, it should remain limited to interface preferences and other non-authoritative information.

Examples may include:

- view preference
- navigation state
- theme preference where applicable

Catalogue information itself remains authoritative in the project's data files.

---

## Deployment

The site deploys to **Cloudflare Pages**, configured via `wrangler.toml` (`pages_build_output_dir = "dist"`).

Routing for clean URLs (e.g. `/Adashima_Help` instead of `/src/pages/Adashima_Help.html`) is handled by `_redirects`, which rewrites each top-level route to its actual file under `src/pages/` — Cloudflare Pages' clean-URL resolution appends `.html` automatically. If you add a new page under `src/pages/`, add a matching line to `_redirects` or it won't be reachable at a clean URL.

Before deploying:

```text
✓ Run `npm run build` and test the dist/ output with `npx wrangler pages dev dist --port 5500`
✓ Verify asset paths
✓ Verify JSON loading
✓ Verify all page routes (cross-check against _redirects)
✓ Bump `?v=` cache-busting query strings on any CSS/JS you changed
✓ Test mobile layouts
✓ Test Night Mode
✓ Test navigation/theme synchronization
✓ Check console for JavaScript errors
✓ Verify statistics against source data
```

No server-side application is required for the core archive experience — Cloudflare Pages serves static files only.

---

## Design Principles

AdaShimaverse follows a few broad principles:

### Archive first

The site should feel like a maintained reference archive rather than a generic landing page.

### Data before decoration

Visual design should support the catalogue rather than obscure it.

### Consistency

Navigation, library pages, statistics, gallery, and help documentation should feel like parts of the same system.

### Lightweight by default

Avoid adding dependencies when native browser capabilities are sufficient.

### Maintainable over clever

A future update should be understandable without having to reverse-engineer a complicated abstraction layer.

### Readability over effects

Especially in Night Mode, typography and contrast take priority over visual effects.

---

## Content and Accuracy

The project is a fan-maintained reference/archive and should distinguish between:

- confirmed publication information
- catalogue metadata
- derived statistics
- editorial descriptions
- community-maintained information

When adding new information, preserve the existing source/data conventions and avoid presenting derived calculations as independently sourced facts.

---

## License / Rights

The project code and original site design are separate from the copyrighted works represented by the archive.

**Adachi and Shimamura** and its associated characters, artwork, and published materials belong to their respective copyright holders.

Do not interpret inclusion in the archive as ownership of the underlying copyrighted material.

---

## Maintenance Notes

When making substantial UI changes, update this README if the change affects:

- the technology stack
- project structure
- data architecture
- build/deployment process
- theme architecture
- development workflow

Small visual changes do not require README changes.

---

## Status

AdaShimaverse is an actively maintained archive project. Its architecture is intentionally modular so additional series information, catalogue sections, statistics, documentation, and visual collections can be added without replacing the underlying platform.