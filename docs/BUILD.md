# Build & Deployment

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

### Development

`npm run dev` starts Vite's development server. Vite serves the source files on demand and provides fast Hot Module Replacement (HMR), so changes can be reflected without rebuilding the entire site.

### Production build

`npm run build` runs:

```bash
vite build
```

The build uses the multi-page configuration in `vite.config.js`. The main page and each major section are registered as HTML entry points, and Vite produces the deployable `dist/` directory.

The project also has runtime-loaded files that are not discovered through the normal HTML/module dependency graph. The `copy-runtime-files` plugin in `vite.config.js` copies the required assets, JSON data, shared HTML fragments, page scripts, service worker, `_redirects`, and `_headers` into `dist/`.

### Why Vite is useful here

Vite is a good fit for AdaShimaverse because the project is a **static multi-page site**, not a single-page framework application. Vite supports multiple HTML entry points directly, so the existing page-per-section architecture can remain intact while gaining a modern build pipeline.

The main benefits are:

- **Fast development:** Vite's dev server serves source modules on demand instead of rebuilding the entire site for every edit.
- **Fast HMR:** CSS and JavaScript changes can be reflected quickly during development.
- **Real production builds:** `vite build` processes the site's HTML entry points and produces a production-ready `dist/` directory instead of relying on a custom recursive copy script.
- **Asset handling:** referenced CSS, JavaScript, and other build-time assets are processed as part of the Vite build.
- **Multi-page support:** each archive section can remain an independent HTML document while still sharing one build configuration.
- **Extensibility:** Vite's plugin system allows project-specific behavior such as the runtime-file copy step and the preview clean-route middleware without introducing a frontend framework.

Vite's official documentation describes the same core model: a fast development server with HMR and a production build command that generates optimized static assets.

### Production-shaped local testing

There are two useful ways to test the built site locally.

#### Vite Preview

```bash
npm run build
npm run preview
```

Use this for testing the Vite production build itself. The project's `vite.config.js` includes preview middleware for the site's clean URLs, so routes such as `/Adashima_Help` work in Vite Preview.

#### Cloudflare Pages environment

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

Use this when you specifically want to reproduce Cloudflare Pages behavior. Wrangler understands the Pages-specific `_redirects` and `_headers` files in `dist/`, whereas Vite Preview does not interpret those Cloudflare configuration files.

The Wrangler method is therefore the closest local representation of the deployed Pages environment.

## Cloudflare Pages

Cloudflare Pages serves the generated `dist/` directory. The repository's `_headers` and `_redirects` files are copied into `dist/` by the Vite build and control Pages-specific behavior after deployment.

Clean URLs such as `/Adashima_Help` are defined in `_redirects` and point to the corresponding page under `src/pages/`.

The Vite Preview server has a separate route map in `vite.config.js` because `_redirects` is a Cloudflare Pages feature and is not automatically interpreted by Vite.

## Cache-busting

Most page-specific CSS and JavaScript uses static URLs with a manual `?v=X.X.X` query parameter. When changing one of those assets, update the version on every page that references it.

Some shared assets are handled through `_headers` with no-cache/must-revalidate behavior instead. Check `_headers` before adding a new cache-busting convention.

## Service worker

`sw.js` is not an offline cache strategy. It clears Cache Storage and unregisters itself so stale client state does not survive deployments. If a deployment requires a stronger cache reset, update the `KILL_SWITCH_ID` used by the service worker.

## Formatting and linting

The repository may include lint/format scripts depending on the checkout. If those scripts and their configuration are present, run them before committing:

```bash
npm run lint
npm run format
```

Use `npm run format:check` when you only want to verify formatting.
