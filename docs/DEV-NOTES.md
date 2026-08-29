# Development Notes

This document is a quick reference for local development, testing, and repository details that are easy to miss when working on AdaShimaverse.

For the full build and deployment workflow, see [Build & Deployment](BUILD_AND_DEPLOYMENT.md). For contribution guidelines, see [Contributing](CONTRIBUTING.md).

---

## Project architecture

### HTML, CSS, and vanilla JavaScript

These are the site's primary technologies.

- Pages live primarily in `src/pages/*.html`
- Page and shared scripts live mainly in `src/js/`
- Styles live in `src/css/`
- Content and catalogue data live in `src/data/`

There is no frontend framework. The project uses standard HTML, CSS, and JavaScript with Vite providing the development and production build pipeline.

---

### JSON data

`src/data/` is the project's primary content layer.

Many page scripts load JSON data at runtime and render it into the DOM. Routine catalogue and content changes should therefore usually be made in the relevant JSON source rather than directly editing generated or hard-coded page markup.

When editing data:

- Preserve existing schemas and IDs
- Check how the data is consumed before renaming fields
- Keep localized files consistent where applicable
- Run formatting checks after editing JSON

---

## Vite

Vite powers the project's main development workflow:

```bash
npm run dev
npm run build
npm run preview
```

The project uses Vite's multi-page build support, with major HTML entry points configured through `vite.config.js`.

The Vite configuration also contains project-specific behavior for files and routing that are not handled by Vite's default dependency graph.

### Runtime file copying

The `copy-runtime-files` functionality ensures runtime-loaded files are included in `dist/`.

These may include:

- JSON data
- Shared HTML fragments
- Runtime scripts
- Service worker files
- Cloudflare `_redirects`
- Cloudflare `_headers`
- Other assets not automatically discovered during the Vite build

Do not assume that a file will automatically appear in `dist/` simply because it exists somewhere under `src/`. Check the build configuration when adding files that are fetched or loaded dynamically.

### Preview clean routes

The project includes clean-route handling for local production preview.

This allows routes such as:

```text
/Adashima_Help
```

to work with:

```bash
npm run preview
```

This is separate from Cloudflare Pages routing because Vite Preview does not interpret Cloudflare `_redirects` files.

---

## Tailwind

Tailwind and `@tailwindcss/vite` may be present in the repository, and `src/css/tailwind.css` may exist.

If the current pages do not load or depend on that stylesheet, treat Tailwind as inactive rather than assuming it is part of the active site styling architecture.

Do not begin introducing Tailwind classes into existing pages unless the project deliberately adopts it as part of the styling system.

The existing CSS architecture should remain the default approach unless there is an intentional migration.

---

## esbuild

esbuild may be present as a dependency used indirectly by Vite or build tooling.

It is not necessarily intended to be called directly by the project's development scripts.

Use the project's documented commands rather than invoking build dependencies directly unless you are debugging the build system.

---

## Playwright and QA

The repository includes an automated QA stage that uses Python and Playwright with Chromium.

The current QA entry point is:

```bash
python tests/qa.py
```

The GitHub Actions workflow installs the required Python packages and browser dependencies before running the test suite.

When changing functionality covered by the QA checks, inspect the files in `tests/` to understand the current test behavior rather than assuming the project uses a conventional JavaScript Playwright configuration.

---

# Local testing

## Fast development

For normal development:

```bash
npm run dev
```

Use this when editing pages, scripts, styles, and other source files.

Vite provides fast reload behavior and is the quickest way to iterate on changes.

---

## Production build

Before considering a change complete, verify that the production build succeeds:

```bash
npm run build
```

The deployable output is generated in:

```text
dist/
```

A successful development server does not guarantee that the production build will succeed.

---

## Vite Preview

To test the production build locally:

```bash
npm run build
npm run preview
```

Use this to verify the Vite-generated production output.

---

## Cloudflare Pages environment

For the closest local representation of the deployed Cloudflare Pages environment:

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

Use this for changes involving:

- `_redirects`
- `_headers`
- Clean URLs
- Cloudflare-specific behavior
- Deployment behavior

Wrangler understands Cloudflare Pages configuration files, while Vite Preview does not.

---

# Before committing

Run:

```bash
npm run lint
npm run format:check
npm run build
```

To automatically fix formatting:

```bash
npm run format
```

Then verify the result:

```bash
npm run format:check
```

For a local workflow that closely matches the first CI stage:

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

---

# Build gotchas

## Do not edit `dist/` as source

`dist/` is generated build output.

Make changes to the source files and regenerate the build instead:

```bash
npm run build
```

If a required file is missing from `dist/`, investigate the Vite build configuration and runtime file-copy behavior rather than manually maintaining a separate copy inside `dist/`.

## Runtime-loaded files

Files loaded dynamically may not be discovered automatically by Vite.

Examples include files fetched through JavaScript or loaded through runtime paths.

When adding a new runtime-loaded file:

1. Add it to the appropriate source location.
2. Check whether the build process copies it into `dist/`.
3. Run `npm run build`.
4. Verify that the file exists in the expected location inside `dist/`.
5. Test the production build locally.

---

# Cache-busting gotchas

Most page-specific CSS and JavaScript references use manual version query parameters:

```text
?v=X.X.X
```

When changing one of these assets, update the version number everywhere the asset is referenced.

Shared files covered by `_headers` may use different cache behavior.

Before adding a new cache-busting pattern:

1. Check `_headers`.
2. Check how similar assets are currently handled.
3. Use the existing approach where possible.

Avoid mixing multiple cache strategies without a clear reason.

---

# Service worker gotchas

`sw.js` is a stale-state reset mechanism rather than a conventional offline caching strategy.

Its behavior is intended to prevent old client-side cache state from surviving deployments. It clears Cache Storage and unregisters itself.

When a deployment requires a stronger reset cycle, update the service worker's:

```text
KILL_SWITCH_ID
```

Be careful when modifying service worker behavior because stale clients can continue using previously installed versions.

Test deployment-related changes with a clean browser session where practical.

---

# Routing gotchas

Adding a new page under `src/pages/` does not automatically guarantee that it has a clean public URL.

For Cloudflare Pages routing:

1. Create or register the page in the appropriate source location.
2. Add the corresponding route to `_redirects`.
3. Run a production build.
4. Test the route with Wrangler.

For example:

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

Remember that Vite Preview and Cloudflare Pages use different mechanisms for route handling.

---

# ESLint gotchas

## Script types

Many page scripts are loaded through standard HTML `<script>` tags and therefore use classic-script parsing.

Files that use:

```js
import
export
```

require the appropriate module configuration or override in `eslint.config.js`.

When creating a new script, follow the conventions used by similar existing files.

## Unused variables

Unused locals and parameters can follow the `_` prefix convention when the ESLint configuration allows it.

Avoid adding unused variables merely to preserve an old function signature unless there is a real compatibility reason.

## Inline HTML event handlers

Be careful with top-level functions referenced only from inline HTML handlers such as:

```html
<button onclick="doSomething()"></button>
```

Static analysis may not detect those references, causing ESLint to report the function as unused.

Prefer the project's existing event-binding patterns when possible. If an inline handler is required for compatibility with existing markup, account for the linting behavior.

## Intentionally ignored errors

When an error is intentionally ignored, prefer:

```js
try {
  // Code that may fail
} catch {}
```

over:

```js
try {
  // Code that may fail
} catch (e) {}
```

If an empty `catch` block must remain, add a short explanatory comment when needed so it is clear that the error is intentionally ignored.

Do not silently ignore errors that should be surfaced or logged during development.

---

# Useful troubleshooting order

When something works locally but fails in CI or deployment, check in this order:

1. Run `npm ci` to reproduce the clean dependency installation.
2. Run `npm run lint`.
3. Run `npm run format:check`.
4. Run `npm run build`.
5. Inspect the generated `dist/` output.
6. Run the relevant QA tests.
7. Test with `npm run preview` or Wrangler, depending on the issue.
8. Check `_redirects`, `_headers`, and the service worker for routing or caching problems.
9. Review the GitHub Actions logs for the exact failing command.

This usually makes it easier to identify whether the problem is related to source code, formatting, the production build, generated files, routing, or the deployment environment.
