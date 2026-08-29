# QA Tester Documentation

## Purpose

The AdashimaVerse QA tester provides automated checks for source integrity, structured content, localization, browser workflows, accessibility, visual regressions, and performance. Its design goal is not to produce the largest possible number of findings; it is to produce findings that are useful and trustworthy.

The tester therefore favors **high-confidence detection over aggressive heuristics**.

## Running the tester

From the repository root:

```powershell
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/qa.py
```

The detailed command reference is maintained in [`tests/README.md`](../tests/README.md).

## Test architecture

The QA implementation is organized into focused modules under `tests/qa/`.

Typical responsibilities include:

- `core.py` — foundational source and build checks;
- `runner.py` — check orchestration and mode selection;
- `content_intelligence.py` — localization completeness and conservative content checks;
- `accessibility_scan.py` — browser accessibility checks;
- `site_structure.py` — structural and orphan-page checks;
- browser/workflow modules — interactive Chromium tests;
- visual/performance modules — optional rendering and performance checks;
- report/artifact modules — result output and failure context.

`tests/qa.py` is the command-line entry point.

## Localization completeness

### Supported locales

The localization completeness check recognizes:

- English: `en`
- Spanish: `es`
- Tagalog: `tg`

It searches the project's data directory for locale groups containing one or more files with those names.

### Reference model

When available, `en.json` is treated as the canonical reference. Spanish and Tagalog are checked for coverage of English paths.

The check reports:

- missing `en.json`, `es.json`, or `tg.json` within a discovered locale group;
- unreadable locale files;
- missing paths that exist in English but not in Spanish or Tagalog;
- missing identified collection records when stable record IDs are available.

### Avoiding false positives

Localization files are not required to be byte-for-byte or key-for-key identical.

The tester deliberately allows:

- extra locale-specific metadata;
- additional locale-only content;
- different ordering of collections with stable IDs;
- optional fields that do not exist in the English reference.

For list-based collections, the tester first looks for a unique stable identity field such as `id`, `slug`, `key`, or `code`. If found, records are matched by that identity instead of position.

For ordinary positional lists, the tester avoids assuming that reordering is automatically an error. This keeps the check useful for real content without forcing every JSON file into an artificial schema.

### Status behavior

Localization incompleteness produces **WARN**, not **FAIL**. This is intentional: a project can be healthy while a translation is still in progress.

A **PASS** means no coverage gaps were found according to the current reference rules. It does not certify the linguistic quality of a translation.

## Result philosophy

### PASS

Use when the check completed and no actionable problem was found.

### WARN

Use when there is a real item to review, but the project may still be functioning correctly. Missing translation coverage is the main example.

### FAIL

Use only for a definite or high-confidence failure, such as invalid data that cannot be read or a required workflow that demonstrably fails.

### SKIP

Use when a check cannot be performed reliably. Examples include unavailable browser tooling or an environment-specific native dependency problem.

A skipped environment-dependent check should not be presented as a website defect.

## Adding or changing checks

New checks should follow these rules:

1. **Prefer explicit project rules.** Do not invent a requirement simply because it is common practice.
2. **Avoid broad guesses.** Repeated text, alternative schemas, and optional metadata can be intentional.
3. **Provide precise evidence.** Include affected paths, files, selectors, or records.
4. **Choose the right severity.** Use WARN for review items and FAIL for clear breakage.
5. **Be platform-aware.** Native dependencies and executables can behave differently after ZIP extraction or on another operating system.
6. **Keep checks independent where possible.** One unavailable optional subsystem should not create unrelated failures.

## Troubleshooting

### Browser checks do not start

```powershell
python -m playwright install chromium
```

### Build tools fail after extracting a ZIP

`node_modules` can contain operating-system-specific binaries. Reinstall dependencies for the current platform instead of assuming the site source is broken.

### A warning appears to be a false positive

Confirm whether the tester is enforcing a genuine project requirement. If the finding comes from an optional or intentionally variable structure, the check should be refined rather than forcing the content to satisfy an incorrect heuristic.

## Related documentation

- [`tests/README.md`](../tests/README.md) — setup, commands, and practical usage.
- [`DATA.md`](DATA.md) — project data conventions.
- [`FRONTEND.md`](FRONTEND.md) — frontend, accessibility, and performance guidance.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributor workflow and testing expectations.
