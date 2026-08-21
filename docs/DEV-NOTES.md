# Development Notes

This is a quick-reference document for local testing and repository gotchas that are easy to miss when working on AdaShimaverse.

## What each tool actually does

### HTML / CSS / vanilla JS

These are the actual site technologies. Pages live in `src/pages/*.html`, page scripts live mainly in `src/js/`, and styles live in `src/css/`. There is no frontend framework.

### JSON

`src/data/` is the content layer. Page scripts fetch JSON at runtime and render it into the DOM. Routine catalogue changes should therefore happen in JSON rather than page markup.

### Vite

Vite powers `npm run dev`, `npm run build`, and `npm run preview`. The project uses Vite's multi-page build support, with each major HTML page registered in `vite.config.js`.

The Vite configuration also contains two project-specific plugins:

- `copy-runtime-files` copies runtime-loaded assets, JSON, shared HTML fragments, service-worker files, and Cloudflare Pages metadata into `dist/`.
- `preview-clean-routes` maps clean URLs to their generated HTML files when using `vite preview`. This is needed because Vite Preview does not process Cloudflare Pages `_redirects` rules.

### Tailwind

Tailwind and `@tailwindcss/vite` are installed and `src/css/tailwind.css` exists, but the current pages do not link to that stylesheet. Treat it as unused/inert until the project deliberately adopts it.

### esbuild

esbuild is present as a dependency used through Vite's CSS minification configuration. It is not used directly by the project's scripts.

### Playwright

Playwright is installed, but there is currently no Playwright test suite, configuration file, or `tests/` directory.

## Local testing

Fast development:

```bash
npm run dev
```

Production-shaped local test:

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

Before committing:

```bash
npm run lint
npm run format
```

Use `npm run format:check` when you want a non-writing formatting check.

## Build gotcha

Do not assume `vite.config.js` is responsible for the files deployed to production. `npm run build` currently runs `scripts/build.js`, which recursively copies the project into `dist/`.

`scripts/build-pages.js` and `scripts/copy-static.js` are not currently wired into `package.json`.

## Cache-busting gotcha

Most CSS/JS references use manual `?v=X.X.X` cache-busting. Shared files covered by `_headers` are an exception. Check `_headers` before deciding which approach applies.

## Service-worker gotcha

`sw.js` is a stale-state kill mechanism, not a normal offline cache. It clears Cache Storage and unregisters itself. Update its `KILL_SWITCH_ID` when a deployment needs to force a new reset cycle.

## Routing gotcha

A new page under `src/pages/` does not automatically get a clean public URL. Add its route to `_redirects`.

## ESLint gotchas

Normal page scripts use classic-script parsing because they are loaded by `<script>` tags. Files using `import`/`export` require a module override in `eslint.config.js`.

Unused locals/parameters can follow the `_` prefix convention. Be careful with top-level functions referenced from inline HTML `onclick` handlers: ESLint cannot see those references.

When an error is intentionally ignored, prefer `catch {}` over `catch (e) {}`. If an empty catch must remain, a short explanatory comment prevents `no-empty` from treating it as accidental.
