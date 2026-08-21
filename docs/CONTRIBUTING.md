# Contributing

Thank you for contributing to AdaShimaverse. Contributions can improve the site's code, catalogue, documentation, accessibility, and accuracy.

## Before you change something

1. Check the relevant documentation in `docs/`.
2. Search the existing implementation before creating a new pattern.
3. For catalogue changes, check `src/data/` first.
4. For routing changes, check `_redirects`.
5. For cache behavior, check `_headers` and the service worker.

## Code contributions

Keep the project lightweight and framework-free unless a deliberate architectural decision says otherwise.

Prefer:

- native DOM APIs;
- small page-specific modules/scripts;
- existing CSS patterns;
- data-driven rendering;
- accessible HTML;
- straightforward code over abstraction for its own sake.

Do not introduce a dependency for a problem that can reasonably be solved with existing browser or project APIs.

## Data contributions

For catalogue/content edits:

- edit the JSON source rather than hard-coded page output;
- preserve existing schemas and IDs;
- verify volume/chapter numbering;
- verify names, dates, and adaptation information;
- update localized data where applicable;
- do not present fan translations as official releases.

## UI contributions

New interfaces should work on desktop and mobile, remain readable in night mode, and integrate with the existing menu/theme system.

Avoid adding decorative assets or effects when they increase page weight without improving the experience.

## Testing

At minimum, run:

```bash
npm run lint
npm run format:check
npm run build
```

For routing/header-sensitive changes, also run:

```bash
npx wrangler pages dev dist --port 5500
```

There is currently no Playwright test suite in the repository. Playwright is installed as a development dependency, but contributors should not assume that automated E2E coverage already exists.

## Commits and pull requests

Keep changes focused. A catalogue correction, UI redesign, build change, and unrelated cleanup should normally be separate changes.

A useful pull request should explain:

- what changed;
- why it changed;
- which pages/data files are affected;
- how it was tested;
- whether cache-busting, routing, localization, or deployment behavior needs attention.

## Bug reports

Include the affected page, reproduction steps, expected behavior, actual behavior, browser/device when relevant, and console/build errors if available.

## Copyright and takedown requests

Contributors should not independently decide that a DMCA or copyright complaint is invalid. Route rights-related requests through the project's designated process described in the Help Center and [Content, Sources & Rights](CONTENT.md).
