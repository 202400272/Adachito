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

Styles live under `src/css/`. Page-specific styles use a folder structure with `main.css` as the entry point:

```text
src/css/
├── global.css
├── <page>/
│   ├── main.css
│   ├── layout.css
│   ├── components.css
│   ├── responsive.css
│   └── ...
└── shared component styles
```

Use the module that owns a feature instead of adding another override file. Split by responsibility: layout, navigation, cards, dialogs, themes, animations, and responsive behavior are good boundaries when they are substantial enough to justify a file. Do not split tiny groups of rules just to reduce line count.

`main.css` should define the import order. Keep imports stable so the cascade remains predictable. Vite/PostCSS resolves these imports during the build, so source-level modularization does not require the browser to load every CSS module separately.

### Legacy root stylesheets

Some root files may exist as compatibility entry points while pages migrate to folder-based CSS. Before deleting a root stylesheet, search the repository for its exact path/name and confirm there are no HTML, JavaScript, Vite, headers, or runtime references.

The root files corresponding to pages already using `/src/css/<page>/main.css` are candidates for deletion after that reference check. Do not delete `global.css`, `lang-switch.css`, `legal.css`, `pdf-modal.css`, `reader-modal.css`, `tailwind.css`, or `yashiro_runner.css` based on filename alone; these serve shared or separate purposes.

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
