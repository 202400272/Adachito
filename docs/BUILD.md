# Build, CI & Deployment

## Commands

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Check code quality
npm run lint
npm run format:check

# Automatically fix formatting
npm run format

# Create a production build
npm run build

# Preview the production build locally
npm run preview
```

For CI and reproducible installations, use:

```bash
npm ci
```

`npm ci` installs the exact dependency versions defined in `package-lock.json` and is therefore used by GitHub Actions instead of `npm install`.

---

## Development

```bash
npm run dev
```

Starts Vite's development server.

Vite serves source files on demand and provides fast Hot Module Replacement (HMR), allowing JavaScript and CSS changes to appear quickly without rebuilding the entire site.

This is the recommended command for normal development.

---

## Production build

```bash
npm run build
```

This runs:

```bash
vite build
```

The build uses the multi-page configuration defined in `vite.config.js`. The homepage and major site sections are registered as HTML entry points, allowing the project to retain its page-per-section architecture while using a modern build pipeline.

The resulting deployable site is generated in:

```text
dist/
```

### Runtime files

Some project files are loaded dynamically at runtime and are not automatically discovered through Vite's normal HTML and module dependency graph.

The `copy-runtime-files` plugin in `vite.config.js` copies the required files into `dist/`, including project-specific assets such as:

- Runtime-loaded JSON data
- Shared HTML fragments
- Page scripts and supporting files
- Service worker files
- Cloudflare `_redirects`
- Cloudflare `_headers`
- Other files required by pages at runtime

This ensures the final `dist/` directory contains everything required for deployment.

---

# Continuous Integration

The repository uses GitHub Actions to automatically verify changes pushed to `main` and pull requests targeting `main`.

The CI workflow is defined in:

```text
.github/workflows/ci.yml
```

It runs in two stages:

```text
lint-and-build
      ↓
     qa
```

The QA stage only runs if the first stage succeeds.

## Lint and build

The `lint-and-build` job performs the following checks:

```text
Install dependencies
        ↓
Run ESLint
        ↓
Check Prettier formatting
        ↓
Build the production site
        ↓
Upload dist/ as an artifact
```

Equivalent commands:

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

### Linting

```bash
npm run lint
```

Checks the project's code for potential issues, incorrect patterns, and other problems detected by the configured linter.

### Formatting

```bash
npm run format:check
```

Verifies that files match the repository's Prettier formatting rules.

This command does **not** modify files. If formatting issues are found, fix them locally with:

```bash
npm run format
```

Then verify the result:

```bash
npm run format:check
```

### Production build

```bash
npm run build
```

Ensures that the production version of the site can successfully build before changes pass CI.

This is important because code may work during development while still failing during the production build process.

### Build artifact

After a successful build, GitHub Actions uploads the generated `dist/` directory as an artifact.

This makes the production build output available from the GitHub Actions run for inspection or debugging.

---

## QA

The `qa` job runs only after `lint-and-build` completes successfully.

It installs:

- Node.js dependencies
- Python 3.12
- Python QA dependencies
- Playwright
- Chromium

The QA test suite is then executed with:

```bash
python tests/qa.py
```

The workflow ensures that changes pass both build validation and the project's automated quality checks.

The overall CI flow is:

```text
Push or Pull Request
        ↓
Install dependencies
        ↓
Lint code
        ↓
Check formatting
        ↓
Build production site
        ↓
        ├── Upload dist/ artifact
        ↓
Run QA tests
        ↓
      Passed
```

If any step fails, later dependent stages do not run.

---

# Production-shaped local testing

There are two useful ways to test the built site locally.

## Vite Preview

```bash
npm run build
npm run preview
```

Use this to test the Vite production build locally.

The project's `vite.config.js` includes preview middleware for the site's clean URLs, allowing routes such as:

```text
/Adashima_Help
```

to work correctly in Vite Preview.

---

## Cloudflare Pages environment

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

Use this when you specifically want to reproduce the Cloudflare Pages environment locally.

Wrangler understands Cloudflare Pages-specific files such as:

```text
_redirects
_headers
```

Vite Preview does not interpret these files because they are Cloudflare Pages configuration files rather than part of Vite itself.

For this reason, Wrangler provides the closest local representation of the deployed Cloudflare Pages environment.

---

# Cloudflare Pages

Cloudflare Pages serves the generated:

```text
dist/
```

directory.

The project's `_headers` and `_redirects` files are copied into `dist/` during the Vite build and control Cloudflare Pages-specific behavior after deployment.

Clean URLs such as:

```text
/Adashima_Help
```

are defined through `_redirects` and route users to the appropriate page.

Vite Preview uses separate route handling in `vite.config.js` because Cloudflare's `_redirects` configuration is not automatically interpreted by Vite.

---

# Cache-busting

Most page-specific CSS and JavaScript files use static URLs with a manual version query parameter:

```text
?v=X.X.X
```

When updating one of these assets, update the version number on every page that references the file.

Some shared assets instead use cache-control rules defined in `_headers`, including no-cache or must-revalidate behavior.

Before introducing a new cache-busting convention, check the existing `_headers` configuration.

---

# Service worker

`sw.js` is not used as an offline caching strategy.

Its purpose is to prevent stale client-side state from surviving deployments. The service worker clears Cache Storage and unregisters itself.

If a deployment requires a stronger client cache reset, update the `KILL_SWITCH_ID` used by the service worker.

---

# Recommended workflow

Before pushing changes:

```bash
# Check formatting
npm run format:check

# Automatically fix formatting if needed
npm run format

# Check code
npm run lint

# Verify the production build
npm run build

# Optionally preview the build
npm run preview
```

For a full local check similar to the first CI stage:

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

The GitHub Actions workflow will then run the same core checks automatically after pushing changes.
