# Architecture

## Overview

AdaShimaverse is a static, data-driven website built with HTML, CSS, and vanilla JavaScript. There is no frontend framework or application router. Pages are individual HTML documents under `src/pages/`, with page-specific JavaScript under `src/js/` and styles under `src/css/`.

The architecture is deliberately simple:

```text
HTML page
   │
   ├── shared components
   │     ├── menu
   │     └── footer / feedback
   │
   ├── page CSS
   │
   └── page JavaScript
          │
          └── fetch() → src/data/*.json
                         │
                         └── render into the DOM
```

Routine catalogue/content changes should normally happen in `src/data/`, not in page markup.

## Main directories

```text
src/
├── components/    Shared HTML and component scripts
├── css/           Site and page stylesheets
├── data/          JSON content and catalogue data
├── js/            Page-specific JavaScript
└── pages/         One HTML entry per site section

vite.config.js     Vite build, runtime-copy, and preview-route configuration
docs/              Developer and contributor documentation
dist/              Generated deployment output
```

## Pages

Each major section has its own HTML entry under `src/pages/`. Examples include novels, manga, gallery, statistics, help, music, and extra stories.

Clean public URLs are mapped through `_redirects`. Adding a new page is therefore a two-part change: create the page and make sure its public route is defined.

## CSS architecture

Page-specific CSS uses folder-based entry points. Each page keeps a small `main.css` entry file that imports focused modules for layout, components, themes, responsive behavior, and page-specific features.

```text
src/css/
├── global.css
├── about/
│   ├── main.css
│   └── ...
├── anime/
│   ├── main.css
│   └── ...
├── index/
│   ├── main.css
│   └── ...
└── <page>/
    ├── main.css
    └── ...
```

The goal is to split CSS by responsibility rather than by arbitrary line counts. A page entry should stay small, while feature files contain the rules for one understandable part of the page. Shared rules belong in `global.css` or an appropriate shared component stylesheet.

Legacy root files such as `src/css/anime.css` may remain temporarily as compatibility shims. They are safe to remove only after every HTML, configuration, and runtime reference points to the folder-based entry file.

## Shared components

Shared markup such as the menu, footer, and feedback UI is kept under `src/components/`. Page scripts should avoid duplicating site-wide behavior when a shared component or existing utility already provides it.

## Document-reader architecture

The novels application contains two specialized document readers rather than one generic viewer. This is intentional: EPUB and PDF expose different primitives and therefore require different rendering strategies.

```text
Novel catalogue
      │
      ├── EPUB → JSZip → OPF/manifest/spine/nav → XHTML/CSS → DOM
      │
      └── PDF  → PDF.js → PDFDocumentProxy → PDFPageProxy → Canvas
```

The EPUB reader treats the **spine as the physical reading sequence** and maintains a separate **detected chapter model** for user-facing chapter numbering. This prevents covers, copyright pages, standalone illustrations, and other XHTML spine resources from being counted as chapters. EPUB chapter detection prefers EPUB 3 navigation / EPUB 2 NCX metadata and falls back to chapter-like XHTML headings when navigation metadata is incomplete.

The PDF reader treats the document as a **fixed page sequence**. PDF.js performs PDF parsing and page interpretation; the application controls page navigation, canvas rendering, zoom, continuous/cascade rendering, preloading, text extraction, and bounded caches. PDF rendering is intentionally lazy so opening the novel catalogue does not load the PDF engine unnecessarily.

Both readers keep document state local to the browser. The catalogue supplies stable volume identity; the reader owns presentation and reading position. This separation keeps translated titles and catalogue presentation changes from invalidating local reader state.

For implementation details, including EPUB package resolution, chapter detection, PDF.js rendering, cache ownership, cancellation, progress models, and QA cases, see [Novels — EPUB & PDF Reader Architecture](applications/novels.md).

## Build architecture

Vite is the project's development server, production build tool, and local production-preview server. `npm run build` runs `vite build` and generates `dist/`.

The project uses Vite's multi-page build support: each major HTML document under `src/pages/` is registered as a build entry in `vite.config.js`. Vite processes those HTML entry points and their referenced CSS/JavaScript assets.

Some files are intentionally loaded at runtime with `fetch()` or by URL rather than through the module graph. The `copy-runtime-files` Vite plugin copies those assets, JSON files, shared HTML fragments, service-worker files, and Cloudflare Pages metadata into `dist/` after the build.

`vite.config.js` also contains a small preview-only route middleware. It maps the site's clean URLs, such as `/Adashima_Help`, to the corresponding generated HTML file when using `npm run preview`. This is necessary because Vite Preview does not interpret Cloudflare Pages `_redirects` rules.

See [Build & Deployment](BUILD.md) for the exact commands and deployment behavior.
