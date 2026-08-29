<h1 align="center"> 
  AdaShimaverse 
</h1>

<p align="center">
  <strong>A curated archive for <em>Adachi and Shimamura</em> (安達としまむら)</strong>
</p>

<p align="center">
  Novels · Manga · Music · Stories · Gallery · Statistics · Reference
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Static--first-Archive-2f5d62?style=flat-square" alt="Static-first archive">
  <img src="https://img.shields.io/badge/Built%20with-Vite-646cff?style=flat-square&logo=vite&logoColor=white" alt="Built with Vite">
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS-f7df1e?style=flat-square&logo=javascript&logoColor=black" alt="Vanilla JavaScript">
  <img src="https://img.shields.io/badge/Languages-English%20%2F%20Español-6b7280?style=flat-square" alt="English and Spanish">
</p>

---

AdaShimaverse is a static-first, data-driven archive and reference site dedicated to **Adachi and Shimamura**. It brings together the series' novels, manga, music, stories, gallery material, statistics, reading resources, and related works in one interconnected place.

## Overview

<table>
<tr>
<td width="50%" valign="top">

### Built for exploration

Browse the archive across multiple formats and discover connections between the series' stories, adaptations, music, artwork, and related material.

</td>
<td width="50%" valign="top">

### Built to stay lightweight

The site uses vanilla HTML, CSS, and JavaScript, with Vite handling development and production builds.

</td>
</tr>

<tr>
<td width="50%" valign="top">

### Data-driven

Catalogue content is maintained through structured JSON, keeping content separate from presentation and making the archive easier to expand.

</td>
<td width="50%" valign="top">

### Static-first

No traditional backend is required. The site can be built and deployed as a static application.

</td>
</tr>
</table>

## Features

- **Archive** — novels, manga, web stories, drama, music, artwork, and related material.
- **Reference tools** — statistics, reading resources, publication information, and curated guides.
- **Data-driven content** — structured JSON powers catalogue and archive content.
- **Responsive design** — built for desktop, tablet, and mobile.
- **Multilingual support** — English and Spanish content where available.
- **Accessible by design** — semantic structure and usability considerations are part of the frontend.
- **Static-first architecture** — fast, portable, and deployable without a traditional backend.

## Quick start

### Install

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

### Create a production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Documentation

The root README provides a quick overview. More detailed documentation is available in [`docs/`](docs/).

| Document                                 | Description                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| [`Architecture`](docs/ARCHITECTURE.md)   | Project structure and how the major pieces fit together                |
| [`Data`](docs/DATA.md)                   | JSON schemas, catalogue data, and content relationships                |
| [`Frontend`](docs/FRONTEND.md)           | HTML, CSS, JavaScript, themes, accessibility, and performance          |
| [`Build & Deployment`](docs/BUILD.md)    | Development workflow, production builds, routing, and Cloudflare Pages |
| [`Content & Rights`](docs/CONTENT.md)    | Accuracy, translations, sources, and copyright considerations          |
| [`Contributing`](docs/CONTRIBUTING.md)   | Guidelines for code, content, documentation, and testing               |
| [`Development Notes`](docs/DEV-NOTES.md) | Operational notes, tooling details, and repository gotchas             |

For the full documentation index, see [`docs/README.md`](docs/README.md).

## Testing & quality assurance

Automated QA lives in [`tests/`](tests/).

The test suite covers multiple layers of the project, including:

- production builds and generated pages
- links, assets, and local references
- structured content and data integrity
- desktop and mobile browser behavior
- search, navigation, readers, and interactive components
- visual regression checks
- accessibility and structural checks
- content relationships, duplicates, and orphaned pages
- regression reporting and failure artifacts

The Music QA suite is intentionally exhaustive: it validates **every declared Music track across the available language data**, including manifest data, audio objects, and real UI playback requests.

See [`tests/README.md`](tests/README.md) for the complete testing workflow.

## Project structure

```text
adashimaverse/
├── src/
│   ├── pages/        # HTML pages
│   ├── js/           # Client-side functionality
│   ├── css/          # Styles and themes
│   └── data/         # Structured catalogue content
│
├── public/           # Static public assets
├── scripts/          # Build and development helpers
├── tests/            # Automated QA and regression checks
├── docs/             # Project documentation
│
├── package.json
├── vite.config.js
└── README.md
```

## Project principles

> **Preserve information clearly.**  
> Keep content structured, traceable, and easy to maintain.

> **Make exploration natural.**  
> Help visitors move between stories, adaptations, characters, music, and related material.

> **Keep the technology out of the way.**  
> Prefer a lightweight architecture that is easy to understand and maintain.

> **Treat the archive as a living project.**  
> Content, research, translations, and reference material can continue to grow over time.

## License & third-party content

The original project code is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

The MIT License applies only to the original code and materials created for this project. It does **not** grant rights to third-party characters, stories, artwork, music, video, trademarks, or other copyrighted material represented by or linked from the archive.

All third-party rights remain with their respective owners.

---

<p align="center">
  <sub>
    AdaShimaverse<br>
    <i>archive · reference · storytelling</i>
  </sub>
</p>
