# Performance Verification

Phase 6 is the verification pass for the production build. Always audit the generated `dist/`, not the development server.

## Quick check

```bash
npm run build
npm run perf:audit
```

The audit reports:

- total production size
- HTML/CSS/JS/image counts
- largest generated assets
- remaining CSS `@import` usage
- `backdrop-filter` usage
- potentially blocking stylesheets
- potentially parser-blocking classic scripts
- unusually large images

A non-zero exit code means the audit found something worth reviewing. It is intentionally a warning system rather than a hard quality gate.

## Browser verification

Use the built site with the project's normal preview workflow and test at least:

- Desktop: Home, Anime, Manga, Gallery, Extra Stories, About
- Mobile: Home, Gallery, Extra Stories, About
- first navigation into another page
- back/forward navigation
- first load and repeat load
- light/dark/time-based themes
- music/player interactions
- modal opening/closing
- long-page scrolling

In Chrome DevTools > Performance, record a cold load and a long scroll. Look for long tasks over 50 ms, repeated layout/recalculate-style work, large paint areas, and dropped frames.

## Visual regression

Run the existing QA/visual regression suite after performance changes. Performance work must not silently change established layouts, including the mobile changelog's horizontal version scrolling.

## Interpreting results

Do not chase a perfect Lighthouse score at the expense of the site's design. Prioritize user-visible smoothness:

1. stable first paint
2. responsive interaction
3. smooth scrolling
4. low layout shift
5. fast repeat visits

Large images, expensive blur/filter effects, repeated DOM work, and synchronous page initialization should be investigated before micro-optimizations.
