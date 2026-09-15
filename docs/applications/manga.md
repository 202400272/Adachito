# Manga

## What the application does

Manga is the visual reading application for manga chapters/volumes. Content is organized by version, volume, and chapter metadata and is primarily delivered as PDF documents.

The page can switch between grid/list presentations, search/filter the catalog, open volume details, and launch the PDF reader.

## Catalog flow

1. Localized manga data is loaded.
2. Versions are resolved so the same chapter can be presented with the correct language/version metadata.
3. Chapters are grouped into volumes.
4. The user can search/filter the catalog.
5. Selecting a chapter opens its PDF reader.

Volume modals provide a higher-level view before opening an individual chapter.

## PDF reader

The standard reader renders one page at a time with PDF.js. It tracks the current page and exposes controls for navigation, zoom, fullscreen, thumbnails, and search where the PDF contains usable text data.

The renderer uses a queue so rendering work happens incrementally instead of blocking the interface by rendering the entire document at once.

## Cascade mode

Cascade mode is designed for touch reading. Instead of asking the user to press Next for every page, pages are placed into a vertical scrolling document.

Only pages near the viewport need to remain rendered. The cascade renderer queues visible/nearby pages and can unload distant pages, reducing memory usage for large manga PDFs.

Zoom is handled separately for single-page and cascade views so changing zoom does not unnecessarily rebuild unrelated pages.

## Search

PDF search depends on the PDF text layer. Image-only manga pages cannot provide meaningful text search unless the source PDF contains OCR/text information.

## Persistence

Reader preferences and reading position are browser-local. They are not an account-level synchronized manga library.

## Maintenance checklist

When adding a manga volume, verify version metadata, chapter grouping, PDF URLs, thumbnails, page counts, mobile navigation, cascade rendering, zoom, and back/close behavior.

## Technical implementation

Manga PDF reading is built around incremental PDF rendering. Single-page mode renders the requested page at the current scale, while cascade mode creates a vertical sequence and prioritizes pages near the viewport. Search depends on the PDF text layer; image-only scans cannot provide reliable search without OCR. Reader preferences and position are browser-local unless synchronization is added later.
