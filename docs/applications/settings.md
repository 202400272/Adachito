# Settings & PWA

## What the application does

Settings is the site's preference center. It controls site-wide preferences and exposes PWA-related behavior without mixing those controls into individual content applications.

## Site preferences

The settings application manages values such as:

- language;
- appearance/theme-related site preferences;
- reduced motion;
- data saver behavior;
- mobile navigation/burger behavior;
- other persisted interface preferences supported by the current settings page.

Settings are read from and written to browser storage, then applied to the current page where appropriate.

## Reader settings vs site settings

Reader-specific controls belong inside the reader because they only affect reading presentation. For example, EPUB font size, font family, line height, paragraph spacing, theme, and desktop content width are EPUB-reader settings rather than global site settings.

## PWA

The PWA area explains installation and service-worker behavior for supported browsers. Installation availability depends on the browser/platform meeting the required PWA conditions.

## Recommended future settings

Useful additions include:

- Reset reader settings without deleting reading progress.
- Clear reading progress separately from bookmarks/favorites.
- Keep screen awake during long reading sessions where supported.
- Configure reader toolbar auto-hide delay.
- Reduced motion and reduced visual effects.
- Optional smooth/instant scrolling.
- More reader theme presets.

For mobile, avoid large previews and tall decorative components inside settings. Settings should remain a fast control surface.

## Technical implementation

Settings is a persistence boundary for site-wide preferences. Controls read current values from browser storage, update the active UI immediately, and persist normalized values. Reader-specific settings stay inside the reader so global preferences cannot accidentally overwrite EPUB typography. PWA controls should reflect browser-supported behavior without assuming every platform supports installation.
