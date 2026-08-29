# Contributing

Thank you for contributing to AdaShimaverse. Contributions can improve the site's code, catalogue, documentation, accessibility, translations, and factual accuracy.

## Before making changes

Before changing the project:

1. Check the relevant documentation in `docs/`.
2. Search the existing implementation before introducing a new pattern.
3. For catalogue or content changes, check `src/data/` first.
4. For routing changes, check `_redirects` and the relevant route configuration.
5. For cache behavior, check `_headers` and the service worker.
6. Follow the existing project structure unless there is a clear reason to change it.

The project already has established patterns for data loading, page structure, themes, routing, and shared UI. Prefer extending those patterns over creating parallel implementations.

---

## Code contributions

Keep the project lightweight and framework-free unless there is a deliberate architectural reason to change that approach.

Prefer:

- Native browser and DOM APIs
- Small page-specific modules and scripts
- Existing CSS patterns and design conventions
- Data-driven rendering
- Accessible semantic HTML
- Straightforward, maintainable code over unnecessary abstraction
- Reusing existing utilities before creating new ones

Avoid introducing a dependency for a problem that can reasonably be solved with existing browser APIs or code already present in the project.

When changing shared functionality, check which pages depend on it before making the change.

---

## Data and catalogue contributions

For catalogue and content edits:

- Edit the JSON source rather than hard-coded page output
- Preserve existing schemas, IDs, and naming conventions
- Verify volume and chapter numbering
- Verify names, dates, publication information, and adaptation details
- Update localized data where applicable
- Keep related language versions consistent when the content exists in multiple languages
- Do not present fan translations as official releases
- Avoid deleting or renaming data fields without checking where they are used

When adding new data, follow the schema and formatting used by existing entries.

---

## UI contributions

New interfaces should:

- Work on both desktop and mobile
- Remain readable across the site's time-based and night themes
- Integrate with the existing menu and theme system
- Preserve accessibility and keyboard usability
- Avoid unnecessary layout shifts or heavy assets
- Reuse existing design patterns where appropriate

Avoid adding decorative images, animations, libraries, or visual effects when they significantly increase page weight without meaningfully improving the user experience.

Before redesigning an existing component, check whether its current structure or styling is shared by other pages.

---

## Formatting

The repository uses Prettier to maintain consistent formatting.

Check formatting with:

```bash
npm run format:check
```

If formatting issues are found, automatically fix them with:

```bash
npm run format
```

Always run the formatting check again after making changes:

```bash
npm run format:check
```

A formatting failure in CI does not necessarily mean the code is invalid. It means the changed files do not match the repository's Prettier configuration.

---

## Testing

Before opening a pull request or pushing significant changes, run:

```bash
npm run lint
npm run format:check
npm run build
```

For the closest equivalent to the first CI stage:

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

### QA tests

The repository includes an automated QA stage that runs:

```bash
python tests/qa.py
```

The CI environment installs Python dependencies and Playwright with Chromium before running the test suite.

If your changes affect pages, content rendering, routes, or functionality covered by the QA tests, run the relevant tests locally where practical.

Refer to the files in `tests/` for the current QA setup and requirements.

### Routing and Cloudflare-specific changes

For changes involving:

- `_redirects`
- `_headers`
- Clean URLs
- Cloudflare Pages behavior
- Deployment-specific behavior

test the built site using Wrangler:

```bash
npm run build
npx wrangler pages dev dist --port 5500
```

This more closely reproduces Cloudflare Pages behavior than Vite Preview because Wrangler understands Cloudflare-specific configuration files.

---

## CI

GitHub Actions automatically checks pushes to `main` and pull requests targeting `main`.

The current workflow performs:

```text
Install dependencies
        ↓
Run linting
        ↓
Check formatting
        ↓
Build the site
        ↓
Run QA tests
```

The QA stage depends on the lint-and-build stage succeeding first.

A failed CI check should be investigated before merging. Common failures include:

- Linting errors
- Prettier formatting issues
- Production build failures
- QA test failures
- Missing or incorrectly committed project files

You can usually reproduce the lint-and-build stage locally with:

```bash
npm ci
npm run lint
npm run format:check
npm run build
```

---

## Commits and pull requests

Keep changes focused whenever practical.

For example, a catalogue correction, UI redesign, build-system change, and unrelated cleanup should normally be separated into different commits or pull requests.

A useful pull request should explain:

- What changed
- Why it changed
- Which pages, components, or data files are affected
- How the changes were tested
- Whether localization was updated
- Whether routing, cache-busting, or deployment behavior needs attention

For visual changes, screenshots can be helpful when they make the review easier.

Avoid including unrelated generated files, formatting changes, or cleanup unless they are relevant to the change being submitted.

---

## Bug reports

When reporting a bug, include as much useful information as possible:

- The affected page or feature
- Steps to reproduce the problem
- Expected behavior
- Actual behavior
- Browser and device, when relevant
- Screenshots, when useful
- Console errors
- Build or CI errors, if available

Clear reproduction steps make issues significantly easier to investigate and fix.

---

## Copyright and takedown requests

Contributors should not independently decide that a copyright, DMCA, or other rights-related complaint is invalid.

Route rights-related requests through the project's designated process described in the Help Center and [Content, Sources & Rights](CONTENT.md).

Do not remove, restore, or redistribute disputed material without following the project's established review process.
