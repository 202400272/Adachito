# AdashimaVerse QA v10

A plain-English automated QA tool for the AdashimaVerse site.

## Install

```powershell
pip install -r tests/requirements.txt
python -m playwright install chromium
```

## Recommended command

```powershell
python tests/qa.py
```

This builds the site, starts `npm run preview` on a free local port, runs source + browser + performance checks, stops the preview server, and creates reports in `.qa/`.

## Useful commands

```powershell
python tests/qa.py static
python tests/qa.py pages
python tests/qa.py browser
python tests/qa.py perf
python tests/qa.py --screenshots
python tests/qa.py --save-baseline
```

To test an already-running server:

```powershell
python tests/qa.py browser --no-build --browser http://127.0.0.1:5173/
```

## Music coverage

The Music checks are part of the normal browser suite. They verify all three supported locale libraries, album/track rendering, track search, standard/compact views, playback network requests, favorites persistence, queue open/close, expanded player open/close, and album back-navigation. The static suite also validates every music JSON track entry without downloading the audio files.

## Reports

After a run:

- `.qa/latest.json` — machine-readable results
- `.qa/report.html` — easy-to-read browser report
- `.qa/baseline.json` — optional baseline for regression comparisons

## What v7 adds

- Real link-following smoke checks
- Stronger interaction tests
- Regression comparison against a saved baseline
- Friendly HTML report
- Cleaner command-line options
- Keeps the Windows `npm.cmd` handling and production-preview workflow from v5/v6

## V8 — User-facing workflows

V8 adds optional workflow helpers for homepage interactions, search, reader controls,
and language controls. Missing optional components are skipped rather than treated
as failures; existing components that do not behave correctly fail.

## V10 — Music page

Adds a dedicated Music workflow that opens the real Music route and tests the library in all three supported languages (ES/EN/TG), album/track rendering, track search, standard/compact views, real audio network requests, favorites persistence, queue controls, expanded player controls, and album back-navigation. The player creates its Audio object in JavaScript, so the browser test watches the actual music request instead of relying on a DOM `<audio>` element.

## Exhaustive Music QA

`tests/qa/music_exhaustive.py` contains the expanded Music-page browser checks for
play/pause, previous/next, shuffle, repeat, mute/volume, seeking, queue,
expanded player, favorites, and language switching.

These helpers are selector-tolerant so they can work with the project's existing
Music UI without requiring a redesign of the page.
