# AdaShimaverse

A curated, data-driven archive and reference site for **Adachi and Shimamura (安達としまむら)**. The project combines a lightweight static web architecture with structured JSON data, modular CSS, and client-side JavaScript to provide an accessible archive for the novels, manga, statistics, gallery, reading resources, and related series information.

---

## Overview

AdaShimaverse is designed as a **static-first archive** rather than a traditional database-backed web application.

The project separates:

- **Content** — structured JSON data
- **Presentation** — modular HTML/CSS
- **Behavior** — vanilla JavaScript
- **Assets** — local images, icons, fonts, and downloadable resources

This separation makes the archive easy to maintain, deploy, and update without requiring a backend or database for ordinary catalogue changes.

---

## Technology Stack

### Core

| Technology | Role |
|---|---|
| **HTML5** | Page structure and semantic markup |
| **CSS3** | Layout, visual system, responsive design, animations, and themes |
| **JavaScript (ES6+)** | Client-side rendering, filtering, navigation, search, statistics, and UI interactions |
| **JSON** | Primary content/data source for catalogue metadata |
| **SVG** | Icons and scalable interface graphics |

The site intentionally avoids a large frontend framework. Most functionality is implemented with **native browser APIs and modular vanilla JavaScript**.

### Styling

The stylesheet architecture is component-oriented rather than being a single monolithic stylesheet.

Major areas include:

```text
src/css/
├── manga/
├── novels/
├── gallery/
├── stats/
├── help/
├── reader/
├── downloads/
└── components/
```

Manga and Novel pages are further divided into component styles for elements such as:

- page titles
- search controls
- filters
- volume grids
- volume cards
- list views
- metadata
- responsive layouts

This keeps page-specific styling isolated and reduces the need to modify global styles when changing an individual component.

### JavaScript

The JavaScript layer is similarly divided by feature/page.

Typical responsibilities include:

- loading JSON data
- rendering catalogue entries
- search and filtering
- grid/list view switching
- chapter and volume interactions
- statistics calculations
- gallery behavior
- help-center search
- navigation and theme behavior
- local UI state

The application uses browser-native APIs wherever practical instead of introducing a framework dependency.

---

## Data Architecture

The archive uses JSON as its primary content layer.

Conceptually:

```text
JSON data
   │
   ▼
JavaScript data loader
   │
   ▼
Page renderer
   │
   ▼
HTML components
   │
   ▼
Modular CSS
```

This allows catalogue information to be updated independently from the visual implementation.

### Why JSON?

JSON works particularly well for this project because the archive contains structured, mostly read-only information such as:

- volume metadata
- publication dates
- chapter information
- page counts
- descriptions
- characters
- tags
- artwork metadata
- release status
- series information

A content update therefore normally requires changing the relevant JSON rather than modifying page markup.

---

## Site Architecture

The project is organized around independent archive sections.

### Novels

The novel archive presents the light novel catalogue and its associated metadata.

Primary UI concerns:

- volume browsing
- cover presentation
- metadata
- search/filter controls
- grid/list views
- responsive layouts

### Manga

The manga archive presents manga editions and volume information.

It uses the same general data-driven philosophy while maintaining its own component stylesheet structure.

### Statistics

The statistics section turns the catalogue data into derived information such as:

- released volumes
- upcoming volumes
- chapter counts
- page counts
- publication span
- publication patterns
- translation-related metrics

Statistics should be treated as **derived values**, not manually maintained duplicate data.

### Gallery

The gallery provides a visual catalogue for cover artwork and related publication imagery.

### Help Center

The Help Center provides documentation for navigating and understanding the archive, including explanations of catalogue conventions and statistics.

### Reader / Downloads

Reading and download-related features are kept separate from the general catalogue UI so that archive browsing and reading functionality do not become tightly coupled.

---

## Theme System

The interface uses a **time-based theme system**.

The navigation menu acts as the visual reference for the three primary states:

```text
Morning
   ↓
Afternoon
   ↓
Night
```

The library sections mirror the menu's theme values rather than defining an unrelated dark/light system.

### Night Mode

Night mode is intended to be a genuine dark interface rather than simply applying darker cards.

It changes:

- page backgrounds
- surfaces
- borders
- text hierarchy
- controls
- accents
- shadows
- focus states

The night palette prioritizes readability, with bright primary text and softer secondary text against the deep purple background.

Theme transitions are intentionally subtle, and reduced-motion preferences are respected where applicable.

---

## Responsive Design

The project uses responsive CSS rather than a separate mobile application.

Layouts adapt across:

- desktop
- tablet
- mobile

The catalogue pages use flexible grids, responsive controls, and mobile-specific adjustments where necessary.

The design goal is to preserve information hierarchy while reducing visual density on smaller screens.

---

## Performance Philosophy

AdaShimaverse is designed around a **static-first, low-dependency architecture**.

Key principles:

### Minimal JavaScript dependencies

Vanilla JavaScript avoids the runtime and bundle overhead of a large frontend framework.

### Local assets

Frequently used assets can be served locally rather than depending on third-party services.

### Data-driven rendering

Content is loaded from structured data instead of duplicating large amounts of HTML.

### Componentized CSS

Page and component styles are separated to make the stylesheet easier to reason about and maintain.

### Progressive enhancement

Core archive information should remain understandable without relying on complex client-side effects.

---

## Project Structure

A simplified structure looks like:

```text
adashimaverse/
├── src/
│   ├── pages/
│   │   ├── Adashima_Novels.html
│   │   ├── Adashima_Manga.html
│   │   ├── Adashima_Stats.html
│   │   ├── Adashima_Gallery.html
│   │   └── Adashima_Help.html
│   │
│   ├── js/
│   │   ├── novels/
│   │   ├── manga/
│   │   ├── gallery/
│   │   ├── stats/
│   │   └── help/
│   │
│   ├── css/
│   │   ├── novels/
│   │   ├── manga/
│   │   ├── gallery/
│   │   ├── stats/
│   │   └── components/
│   │
│   ├── data/
│   │   ├── novels/
│   │   ├── manga/
│   │   ├── gallery/
│   │   ├── help/
│   │   └── ...
│   │
│   └── assets/
│       ├── images/
│       ├── icons/
│       └── ...
│
├── package.json
└── README.md
```

The exact directory contents may evolve as new archive sections are added.

---

## Development

### Requirements

A modern browser is required for the full experience.

Recommended:

- Chromium-based browsers
- Firefox
- Safari

For local development, a simple static HTTP server is recommended rather than opening HTML files directly with `file://`.

This avoids common browser restrictions around:

- JSON requests
- module loading
- local asset paths
- fetch-based data loading

### Local server

If the project uses a Node-based development setup, install dependencies first:

```bash
npm install
```

Then use the development command defined in `package.json`.

If no development server is required, any static server can be used.

For example:

```bash
python -m http.server
```

Then open the displayed local address in a browser.

---

## Updating Catalogue Data

Catalogue updates should normally be made in the relevant JSON files.

Recommended workflow:

1. Locate the appropriate data file.
2. Update the existing object rather than creating duplicate entries.
3. Preserve the existing schema.
4. Verify dates, volume numbers, chapter numbers, and status values.
5. Reload the relevant page.
6. Check derived statistics.
7. Test both desktop and mobile layouts.

Avoid hard-coding catalogue information directly into page JavaScript when the information belongs in the data layer.

---

## CSS Development Guidelines

When modifying the interface:

- Prefer the existing component stylesheet.
- Avoid adding page-specific rules to global CSS unless they genuinely belong there.
- Reuse existing CSS variables.
- Keep the time-based theme synchronized with the navigation menu.
- Do not reintroduce decorative image backgrounds into the library pages unless there is a deliberate design reason.
- Preserve readable contrast in Night Mode.
- Respect `prefers-reduced-motion`.
- Test responsive layouts after changing card or grid dimensions.

The Manga and Novel pages intentionally use separate component styles even where their UI patterns are similar.

---

## JavaScript Development Guidelines

When modifying behavior:

- Prefer existing utility functions before introducing duplicates.
- Keep data loading separate from rendering where practical.
- Avoid unnecessary DOM reflows.
- Cache frequently accessed DOM elements.
- Use event delegation for repeated dynamic elements where appropriate.
- Do not duplicate JSON data inside JavaScript.
- Keep derived statistics calculated from source data.

Because the project is primarily an archive, correctness and maintainability are generally more important than adding framework-level abstraction.

---

## Accessibility

Accessibility is treated as part of the UI architecture.

Important considerations include:

- semantic HTML
- keyboard-accessible controls
- visible focus states
- readable text contrast
- descriptive labels
- responsive text sizing
- reduced-motion support
- avoiding color as the sole indicator of state

Night Mode in particular should maintain sufficient contrast between:

```text
Primary text
Secondary text
Metadata
Interactive controls
Disabled content
Background surfaces
```

---

## Browser Storage and Client State

Where local browser state is used, it should remain limited to interface preferences and other non-authoritative information.

Examples may include:

- view preference
- navigation state
- theme preference where applicable

Catalogue information itself remains authoritative in the project's data files.

---

## Deployment

The architecture is suitable for static hosting.

Possible deployment targets include any platform capable of serving:

- HTML
- CSS
- JavaScript
- JSON
- image assets

No server-side application is required for the core archive experience.

Before deployment:

```text
✓ Verify asset paths
✓ Verify JSON loading
✓ Verify all page routes
✓ Test mobile layouts
✓ Test Night Mode
✓ Test navigation/theme synchronization
✓ Check console for JavaScript errors
✓ Verify statistics against source data
```

---

## Design Principles

AdaShimaverse follows a few broad principles:

### Archive first

The site should feel like a maintained reference archive rather than a generic landing page.

### Data before decoration

Visual design should support the catalogue rather than obscure it.

### Consistency

Navigation, library pages, statistics, gallery, and help documentation should feel like parts of the same system.

### Lightweight by default

Avoid adding dependencies when native browser capabilities are sufficient.

### Maintainable over clever

A future update should be understandable without having to reverse-engineer a complicated abstraction layer.

### Readability over effects

Especially in Night Mode, typography and contrast take priority over visual effects.

---

## Content and Accuracy

The project is a fan-maintained reference/archive and should distinguish between:

- confirmed publication information
- catalogue metadata
- derived statistics
- editorial descriptions
- community-maintained information

When adding new information, preserve the existing source/data conventions and avoid presenting derived calculations as independently sourced facts.

---

## License / Rights

The project code and original site design are separate from the copyrighted works represented by the archive.

**Adachi and Shimamura** and its associated characters, artwork, and published materials belong to their respective copyright holders.

Do not interpret inclusion in the archive as ownership of the underlying copyrighted material.

---

## Maintenance Notes

When making substantial UI changes, update this README if the change affects:

- the technology stack
- project structure
- data architecture
- build/deployment process
- theme architecture
- development workflow

Small visual changes do not require README changes.

---

## Status

AdaShimaverse is an actively maintained archive project. Its architecture is intentionally modular so additional series information, catalogue sections, statistics, documentation, and visual collections can be added without replacing the underlying platform.
