# AdashimaVerse QA Tester

The AdashimaVerse QA tester is a conservative automated quality-assurance suite for the site. It checks the source, structured content, routes, browser behavior, accessibility, performance, and selected user workflows while deliberately avoiding speculative checks that can create false errors.

## Quick start

```powershell
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/qa.py
```

## Common commands

```powershell
python tests/qa.py static
python tests/qa.py pages
python tests/qa.py content
python tests/qa.py structure
python tests/qa.py browser
python tests/qa.py accessibility
python tests/qa.py perf
python tests/qa.py visual
python tests/qa.py --screenshots
python tests/qa.py --save-baseline
```

To test an already-running site:

```powershell
python tests/qa.py browser --no-build --browser http://127.0.0.1:5173/
```

## Localization completeness: EN / ES / TG

The content suite includes **Localization completeness (EN/ES/TG)**. It is designed to detect genuine translation coverage gaps without assuming that every locale must be structurally identical.

The check:

- discovers locale groups containing `en.json`, `es.json`, and/or `tg.json`;
- uses English as the reference when `en.json` is available;
- reports missing locale files for the expected EN/ES/TG set;
- reports paths that exist in English but are missing from Spanish or Tagalog;
- matches collection items by stable identifiers such as `id`, `slug`, `key`, or `code`, so different item ordering does not create a false error;
- allows extra locale-specific keys and metadata;
- does not treat extra translated content as a problem;
- returns **WARN** for incomplete coverage rather than **FAIL**, because partial translations can be intentional during localization.

A missing English file also produces a warning because the tester cannot safely determine canonical key coverage without the reference locale.

## Accuracy and false-positive policy

The QA tester follows a conservative rule: **report definite problems, skip uncertain assumptions**.

Examples:

- Accessibility checks should recognize legitimate accessible names instead of requiring one specific attribute.
- Optional or locale-specific JSON fields are allowed.
- Reordered collections should not be treated as missing translations when stable IDs are available.
- Intentional duplicate content is not automatically considered an error.
- Environment-specific build or browser limitations should be **SKIPPED**, not reported as website defects.

A **SKIP** means the tester could not reliably perform that check. It does not mean the check passed.

## QA layers

### Static and data checks

These inspect the repository without requiring a browser:

- production builds and generated pages
- JSON/content readability
- locale data and localization completeness
- music data
- expected pages and routes
- links, assets, anchors, and duplicate IDs
- page basics and basic accessibility
- JavaScript syntax and large assets
- schema health and structural checks
- orphan pages

### Browser checks

When a preview is available, the suite can test real interactions and project workflows in Chromium. Music coverage also validates supported locale libraries, rendering, search, views, playback requests, favorites, queues, expanded player behavior, and navigation.

### Accessibility, visual, and performance checks

Optional suites provide browser accessibility scanning, visual regression comparison, screenshots, and local performance checks.

## Reports and artifacts

After a run, QA artifacts are written under `.qa/`:

- `.qa/latest.json` — machine-readable results
- `.qa/report.html` — browser-friendly report
- `.qa/baseline.json` — optional regression baseline
- failure artifacts and screenshots when relevant checks are enabled

## Understanding statuses

- **PASS** — the check completed and found no actionable issue.
- **WARN** — the tester found something worth reviewing, but it may not be a broken site.
- **FAIL** — a definite or high-confidence problem prevented the check from succeeding.
- **SKIP** — the check could not be run reliably, was not applicable, or was intentionally disabled to avoid unreliable results.

Review **FAIL** items first. Review **WARN** items in context, especially localization coverage during active translation work.

## Extending the tester

When adding a new check:

1. Prefer deterministic evidence over heuristics.
2. Avoid requiring conventions that are not explicitly defined by the project.
3. Use **WARN** for review-oriented findings and **FAIL** for definite failures.
4. Use **SKIP** when the environment cannot perform a check reliably.
5. Test optional data and legitimate alternative implementations before tightening a rule.
6. Keep output actionable by including the affected file, route, key, or element.

For the broader tester documentation, see `../docs/QA.md`.
