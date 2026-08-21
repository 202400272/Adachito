# Frontend

## Core stack

The actual site uses:

- HTML;
- CSS;
- vanilla JavaScript (ES6+);
- browser DOM APIs;
- `fetch()` for JSON data.

There is no frontend framework. This is intentional: the archive favors small, predictable page scripts over a client-side application runtime.

## Vite

Vite is the project's build and development tool, but it does not define the frontend architecture. The site remains plain HTML, CSS, and vanilla JavaScript.

Vite is used because it provides a fast development server with HMR, a production build pipeline, multi-page HTML entry support, and a plugin API that can accommodate the project's runtime-file and routing requirements. This lets the project keep its simple static architecture while avoiding a custom build system.

When adding a new page, remember that Vite needs its HTML entry registered in `vite.config.js`. Runtime-loaded files that are not imported by the page should be added to the runtime-copy list there as needed.

## JavaScript

Most pages have a corresponding script under `src/js/`. Page scripts should:

- load data asynchronously;
- render only what the page needs;
- use existing DOM elements instead of rebuilding page structure unnecessarily;
- keep event listeners scoped and understandable;
- handle missing or malformed data gracefully.

Avoid introducing a framework or large dependency for behavior that can be handled with native browser APIs.

### ESLint conventions

The base ESLint configuration treats normal page scripts as classic scripts because they are loaded through ordinary `<script>` tags. Files that use `import`/`export` need the appropriate module override in `eslint.config.js`.

Unused local variables or parameters can use the existing `_` prefix convention. Do not rename top-level functions that may be called by inline `onclick` handlers until their HTML references have been checked.

For genuinely ignored errors, prefer optional catch binding:

```js
try {
  // ...
} catch {
  // intentionally ignored
}
```

## CSS

Styles live under `src/css/`, with page-specific files alongside shared styles. Keep selectors scoped where practical and reuse existing variables, components, and patterns instead of creating near-duplicates.

The repository contains `src/css/tailwind.css` and the Tailwind/Vite dependencies, but the current pages do not link to that stylesheet. Treat Tailwind as currently unused unless the project is intentionally migrated to it.

## Themes

The site uses a time-aware theme system, including a full night mode. Theme changes should remain synchronized with the site's menu and other shared UI so users do not encounter conflicting visual states.

Readability takes priority over decorative effects, especially in reading-heavy areas such as novels, manga, help, and statistics.

## Responsive design

Desktop and mobile layouts are both first-class. Shared navigation behaves as a sidebar on larger screens and a burger menu on smaller screens. New UI should be tested at both sizes rather than treating mobile as a final CSS patch.

## Accessibility

Prefer semantic HTML, visible focus states, readable contrast, descriptive labels, keyboard-accessible controls, and meaningful heading structure. Do not make an interaction depend solely on hover or color.

## Performance

The site is intentionally lightweight. Prefer:

- native browser APIs;
- local assets;
- data-driven rendering;
- minimal dependencies;
- lazy loading where appropriate;
- small page-specific scripts;
- avoiding unnecessary DOM work.

Do not add a dependency simply to replace a small native operation.
