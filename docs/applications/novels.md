# Novels

## What the application does

Novels is the site's light-novel catalogue and document-reading application. A volume is described by the catalogue data layer and may expose an EPUB, a PDF, or both. The catalogue decides **what document to open**; the reader owns **how that document is loaded, rendered, navigated, and persisted locally**.

The two readers are deliberately separate because EPUB and PDF are fundamentally different document models:

- **EPUB** is a ZIP package containing structured XHTML, CSS, images, fonts, navigation metadata, and other resources. The reader reconstructs a browser-readable document tree from that package.
- **PDF** is a page-oriented document format. The reader delegates parsing, font/image decoding, page interpretation, and rasterization to PDF.js and controls which pages are rendered into canvas.

```text
Novel catalogue
      │
      ├── volume metadata
      │     ├── title
      │     ├── id
      │     ├── EPUB filename
      │     └── PDF filename
      │
      └── reader selection
             │
       ┌─────┴─────┐
       ▼           ▼
   EPUB reader   PDF reader
       │           │
     JSZip      PDF.js
       │           │
 XHTML/CSS      PDF pages
       │           │
 browser DOM     Canvas
```

## Volume and reader lifecycle

The novel page follows this general lifecycle:

```text
catalogue JSON
     ↓
normalize volume metadata
     ↓
user selects volume
     ↓
reader preference / available format
     ↓
open EPUB or PDF reader
     ↓
load document
     ↓
restore local reading state
     ↓
render current position
     ↓
update navigation + progress
     ↓
persist position locally
```

Reader state is intentionally keyed to the stable volume/file identity rather than the translated display title. This prevents changing a localized title from creating a second reading history entry.

---

# EPUB reader architecture

## 1. EPUB is treated as a package, not as a web page

An `.epub` file is a ZIP container. The browser cannot directly navigate to an XHTML file inside it, so the reader first downloads the package as an `ArrayBuffer` and passes it to **JSZip**.

The package is then resolved through the EPUB container/OPF structure:

```text
EPUB ZIP
 │
 ├── META-INF/container.xml
 │       │
 │       └── points to the package document (.opf)
 │
 └── package.opf
         │
         ├── metadata
         ├── manifest
         │     ├── XHTML
         │     ├── CSS
         │     ├── images
         │     ├── fonts
         │     └── other resources
         │
         └── spine
               │
               └── ordered XHTML reading sequence
```

The implementation starts at `META-INF/container.xml`, reads the OPF path, builds a manifest map keyed by `id`, and then resolves the spine's `itemref` entries against that manifest.

The spine is the **reading order**. It is not automatically the **chapter list**.

That distinction is important because a normal novel EPUB may contain spine entries for:

- cover pages;
- title pages;
- copyright pages;
- dedication pages;
- illustrations;
- chapter text;
- end matter;
- publisher pages.

Counting spine entries therefore produces incorrect chapter totals.

## 2. Resource resolution

Resources inside an EPUB use relative URLs. For example, an XHTML file might contain:

```text
images/chapter-01.webp
../Styles/main.css
../Fonts/book-font.woff2
```

Those paths are relative to the XHTML/CSS file that references them, not to the ZIP root.

The reader therefore resolves every path against its source file before looking it up in JSZip:

```text
source XHTML
    │
    ├── relative image path
    │        ↓
    │   resolveEpubPath()
    │        ↓
    │   ZIP-relative path
    │        ↓
    │   JSZip lookup
    │        ↓
    │   Blob
    │        ↓
    │   URL.createObjectURL()
    │        ↓
    │   browser-readable URL
```

Object URLs are tracked in `epubObjectUrls` and revoked when the reader closes or changes books. This is necessary because object URLs hold references to browser-managed resources and should not accumulate across reader sessions.

The same resolution process is used for:

- `<img src>`;
- `<source src>`;
- SVG `<image href>` / `xlink:href`;
- SVG `<use href>` / `xlink:href>`;
- inline `style="url(...)"`;
- stylesheet `url(...)` references.

## 3. Publisher CSS versus reader CSS

The EPUB's CSS is loaded because it contains useful structural information: heading sizes, figure layout, text decoration, image sizing, and other publisher formatting.

The reader then applies its own presentation layer on top.

```text
EPUB XHTML
    +
EPUB publisher CSS
    ↓
rendered reader DOM
    +
reader theme / typography overrides
    ↓
final reading presentation
```

The reader does not rewrite the source EPUB. It modifies the browser representation only.

This separation is important because the same EPUB can be displayed with different user preferences without changing the original package.

## 4. XHTML rendering

Each rendered spine XHTML document becomes an `.epub-chapter` article inside one scroll container:

```text
#epubViewer
   └── #epubReaderScroll
         ├── .epub-chapter[data-chapter-index="0"]
         ├── .epub-chapter[data-chapter-index="1"]
         ├── .epub-chapter[data-chapter-index="2"]
         └── ...
```

The reader starts with the requested spine item and appends later spine items as the reader approaches the bottom. This avoids rendering the entire book into the DOM immediately while preserving continuous reading.

The current implementation intentionally uses continuous scrolling rather than a page-turning layout.

## 5. Automatic continuation

When the reader is close to the end of the active spine article, `handleEpubScroll()` requests the next spine item.

```text
scroll position
     ↓
near end of current article?
     │
    yes
     ↓
append next spine XHTML
     ↓
load its CSS/resources
     ↓
append to same scroll container
```

This matters for EPUBs where an illustration or other XHTML fragment exists as its own spine item. The user should experience:

```text
chapter text → illustration → next text
```

rather than:

```text
chapter → stop → press Next → illustration → press Next → text
```

The spine is therefore a rendering/streaming boundary, not a user-visible chapter boundary.

---

# EPUB chapter detection

## Why chapter detection exists

A previous implementation used `epubSpine.length` as the chapter count. That is technically incorrect. A spine item is an ordered publication resource; it does not mean "one chapter".

The reader now maintains two separate structures:

```text
EPUB spine
──────────
spineIndex 0 → cover.xhtml
spineIndex 1 → title.xhtml
spineIndex 2 → ch01.xhtml
spineIndex 3 → illustration.xhtml
spineIndex 4 → ch02.xhtml
...

Detected chapters
──────────────────
chapter 0 → Chapter 1 → spine 2
chapter 1 → Chapter 2 → spine 4
...
```

`epubSpine` controls document loading order.

`epubChapters` controls user-facing chapter numbering.

## Detection priority

Chapter detection uses a layered strategy because EPUB quality varies between publishers.

### Priority 1: EPUB 3 navigation / EPUB 2 NCX

The reader first inspects the EPUB navigation metadata.

For EPUB 3 it looks for the navigation document and its table-of-contents navigation. For EPUB 2 it falls back to the NCX referenced by the spine or found in the manifest.

Entries are candidates when they:

- carry chapter/part navigation semantics; or
- have labels such as `Chapter 1`, `Chapter II`, `Prologue`, `Epilogue`, `Interlude`, `Side Story`, `Extra`, etc.

Front matter such as `Cover`, `Title Page`, `Copyright`, `Contents`, and `Dedication` is excluded.

### Priority 2: XHTML headings

If navigation metadata is incomplete, the reader parses XHTML spine documents and looks for heading elements such as `h1` through `h6` whose text matches chapter-like patterns.

This fallback is especially useful when multiple chapters share one XHTML file and each chapter heading has an `id`:

```html
<h1 id="chapter-3">Chapter 3</h1>
...
<h1 id="chapter-4">Chapter 4</h1>
```

The reader stores the heading ID as a fragment, allowing the chapter boundary to exist inside a single spine document.

### Priority 3: meaningful TOC entries

If explicit chapter headings cannot be identified, non-front-matter TOC entries are used as the best available approximation.

### Priority 4: spine fallback

Only when the EPUB provides no usable chapter/navigation information does the reader fall back to one detected section per spine item.

This is intentionally the least preferred path.

## Chapter identity

A detected chapter contains:

```text
id
label
chapterIndex
spineIndex
fragment
source
```

For example:

```text
id:          toc-7
label:       Chapter 4
chapterIndex: 3
spineIndex:   11
fragment:     chapter-4
source:       toc
```

This lets the UI say:

```text
Chapter 4 / 20
```

while the renderer still knows that the chapter lives inside spine document 11.

## Active chapter detection

The reader determines the visible chapter in two stages:

1. Identify the active spine article from the scroll position.
2. If several detected chapters belong to that spine article, inspect their fragment IDs and compare their positions to a reading anchor near the top of the viewport.

Conceptually:

```text
viewport anchor
      │
      ▼
┌────────────────────────────┐
│ Chapter 3 heading          │ ← already above anchor
│                            │
│ text                       │
│                            │
│ Chapter 4 heading          │ ← nearest heading above anchor
│                            │
│ text                       │
└────────────────────────────┘
```

The last chapter boundary that has crossed the reading anchor becomes the active chapter.

This means the header, footer, TOC highlight, and progress display all use the same detected chapter state.

## Chapter navigation

The Previous/Next buttons now navigate the **detected chapter list**, not raw spine indices.

If the target chapter is in the current spine document, the reader scrolls directly to its fragment. If it belongs to another spine document, that document is rendered first and the reader then jumps to the target fragment.

```text
Previous / Next
       ↓
epubChapters[n ± 1]
       ↓
   same spine?
    /       \
  yes        no
   ↓          ↓
scroll     render spine
fragment       ↓
            scroll fragment
```

This prevents a "Next chapter" button from accidentally landing on a cover, illustration, or other non-chapter spine resource.

## Progress model

EPUB progress now distinguishes:

- `spineIndex`: physical EPUB reading resource;
- `chapterIndex`: detected user-facing chapter;
- `chapterId`: stable detected chapter identity for the current EPUB package;
- `percentage`: approximate scroll position inside the active spine document.

Local progress retains `spineIndex` for backward compatibility with older saved state while adding chapter metadata.

The visible chapter progress is calculated from the detected chapter list rather than `epubSpine.length`.

For example, an EPUB with:

```text
24 spine XHTML files
3 front-matter files
2 illustration files
19 actual chapters
```

will display:

```text
Chapter 7 / 19
```

not:

```text
Chapter 7 / 24
```

The percentage display also uses detected chapter position as its high-level denominator. It is therefore consistent with the chapter counter rather than treating every spine document as a chapter.

## Saved progress migration

Older local progress may contain only:

```json
{
  "chapterIndex": 7,
  "percentage": 42
}
```

The reader interprets that legacy `chapterIndex` as the old spine index when no `spineIndex` is available.

New state can contain:

```json
{
  "spineIndex": 11,
  "chapterIndex": 6,
  "chapterId": "toc-12",
  "percentage": 42,
  "updatedAt": 1770000000000
}
```

This allows old browser storage to continue working without forcing a destructive migration.

---

# PDF reader architecture

## 1. PDF.js is the document engine

The PDF reader does not parse PDF syntax itself. It loads PDF.js on demand and gives PDF.js the remote document URL.

```text
volume metadata
      ↓
PDF URL
      ↓
pdfjsLib.getDocument()
      ↓
PDFDocumentProxy
      ↓
getPage(pageNumber)
      ↓
PDFPageProxy
      ↓
getViewport()
      ↓
page.render()
      ↓
CanvasRenderingContext2D
```

PDF.js handles PDF-specific concerns such as:

- object streams;
- fonts;
- images;
- vector graphics;
- page geometry;
- text extraction;
- compressed PDF structures;
- page interpretation.

The application's PDF reader is therefore primarily a **viewer/orchestration layer** around PDF.js.

## 2. Lazy PDF.js loading

PDF.js is not loaded as a render-blocking dependency on the novels page. The page loads the library when a PDF reader is actually needed.

This reduces the cost of visiting the novel catalogue when the user only wants to browse volumes or use EPUB.

## 3. Streaming and loading

The PDF reader passes the URL directly to `pdfjsLib.getDocument()`.

When the server supports HTTP range requests, PDF.js can request document byte ranges instead of requiring the application to download the entire PDF before rendering the first page.

```text
PDF URL
  ↓
PDF.js loading task
  ↓
range requests when supported
  ↓
PDFDocumentProxy
  ↓
page 1 available
```

If the origin does not support suitable range-request behavior, PDF.js can fall back to a full download. The reader does not require a custom download pipeline for either case.

## 4. Page rendering

The reader is page-oriented. It keeps a current page number and asks PDF.js for that page only when needed.

A page is rendered into an HTML canvas.

The rendering pipeline accounts for device pixel ratio:

```text
logical page size
      ↓
requested zoom scale
      ↓
viewport
      ↓
device-pixel-ratio adjustment
      ↓
canvas backing resolution
      ↓
CSS display size
```

The canvas backing resolution can therefore be larger than its CSS size, producing sharper text and line art on high-DPI displays without changing the logical page dimensions.

## 5. Fit-to-width

Fit-to-width is calculated from the available viewer width and the page viewport width.

The reader adjusts the PDF scale rather than stretching the rendered canvas with CSS. This preserves PDF.js's page geometry and avoids introducing a second layer of image scaling.

## 6. Single-page mode

Single mode maintains one primary canvas. Navigation changes `modalPageNum`, schedules a render, and updates the toolbar/page counter.

The render path is protected by a small state machine:

```text
idle
 ↓
render requested
 ↓
isRendering?
 ├── no → render page
 └── yes → pendingRender = true
                    ↓
             current render ends
                    ↓
             render pending page
```

This prevents rapid navigation or zoom clicks from creating an uncontrolled stack of simultaneous canvas renders.

## 7. Continuous/cascade mode

Novel PDFs default to continuous/cascade mode because a long-form novel is easier to read when pages flow vertically.

Cascade mode renders a bounded set of pages into the scrolling reader rather than rendering the complete PDF at once.

The reader uses page visibility and preloading to determine which pages deserve active rendering resources.

Conceptually:

```text
previous pages   visible pages   next pages
      │               │               │
      └── retained ───┼── rendered ───┘
                      │
                 preload cache
                      │
               bounded memory
```

This is fundamentally different from EPUB continuous scrolling. EPUB appends XHTML documents; PDF cascade mode appends rendered PDF pages.

## 8. Preload cache and hot-page cache

The PDF reader maintains small caches for recently useful pages.

A preload cache stores lower-cost rendered representations for nearby navigation. A hot-page cache keeps PDF.js page objects that are likely to be reused.

The caches are bounded and evict older entries rather than allowing every visited page to remain in memory indefinitely.

When the PDF document itself leaves the document LRU, the document can be destroyed so PDF.js can release its internal resources.

This is important for large light-novel PDFs because a 400-page document should not imply 400 simultaneously decoded/rendered canvas resources.

## 9. PDF text search

The novels page maintains a text index for PDF search using PDF.js's `getTextContent()` API.

Text extraction is intentionally decoupled from initial page rendering:

```text
PDF loaded
   ↓
show page immediately
   │
   └── background text extraction
           ↓
       page text cache
           ↓
       search index
```

This prevents opening a PDF from being blocked by extracting every page before the first page becomes visible.

Search results can therefore become available incrementally as pages are indexed.

## 10. PDF cancellation and lifecycle safety

PDF loading and preloading use `AbortController`/PDF.js loading-task destruction where appropriate.

Closing the PDF modal aborts active work, cancels thumbnail work, clears page references, resets UI state, and drops modal-owned caches. The outer PDF document cache can retain reusable `PDFDocumentProxy` objects for quick reopening when safe.

The important ownership rule is:

```text
catalog
  owns volume metadata

novel page
  owns which reader is open

PDF reader
  owns modal page/render state

PDF document cache
  owns reusable PDFDocumentProxy objects
```

This avoids destroying a shared PDF document merely because the modal UI was closed.

---

# EPUB versus PDF: why the architecture differs

| Concern            | EPUB                              | PDF                              |
| ------------------ | --------------------------------- | -------------------------------- |
| Primary model      | Reflowable document               | Fixed-layout pages               |
| Package            | ZIP archive                       | Binary PDF document              |
| Engine             | JSZip + DOM/CSS                   | PDF.js                           |
| Layout             | Browser layout engine             | PDF page geometry                |
| Text               | Native DOM text                   | PDF.js text extraction/rendering |
| Images             | Object URLs from ZIP resources    | Decoded by PDF.js                |
| Navigation         | Spine + EPUB nav/NCX + fragments  | Page numbers / PDF structure     |
| User chapter model | Detected from navigation/headings | Not inferred from page count     |
| Rendering          | XHTML articles appended to DOM    | Canvas page rendering            |
| Zoom               | CSS/browser typography settings   | PDF viewport scale               |
| Continuous mode    | Append XHTML spine items          | Render/append PDF pages          |
| Search             | DOM/text from XHTML spine         | PDF.js text extraction           |
| Progress           | Chapter + scroll position         | Page number + page percentage    |
| Persistence        | `localStorage`                    | `localStorage`                   |

The most important architectural distinction is that **EPUB has semantic structure while PDF primarily exposes pages**. The EPUB reader can therefore derive a chapter model from navigation metadata and document headings. The PDF reader should not pretend that `page 37` is `chapter 7` unless the PDF itself provides a reliable outline/bookmark structure and the application explicitly chooses to consume it.

---

# Local persistence

Neither reader requires a server-side account.

The browser stores state in `localStorage`:

```text
EPUB settings
EPUB progress
EPUB reading statistics
PDF page/zoom state
PDF reader preferences
```

This means:

- state survives normal reloads;
- state is device/browser-local;
- clearing site storage removes it;
- there is no cross-device synchronization;
- there is no server-side bookmark/note system.

This is intentional for the current static-site architecture.

---

# QA matrix for readers

## EPUB

Test at minimum:

1. EPUB 3 navigation document.
2. EPUB 2 NCX-only navigation.
3. No navigation metadata.
4. Cover/title/copyright/dedication front matter.
5. One XHTML file per chapter.
6. Multiple chapters in one XHTML file.
7. Chapter headings with fragment IDs.
8. Chapter headings without fragment IDs.
9. Standalone illustration spine items.
10. Multiple TOC entries targeting one XHTML document.
11. TOC entries that contain parts/sections in addition to chapters.
12. SVG images and `xlink:href` resources.
13. Relative CSS image URLs.
14. Publisher CSS with aggressive colors/backgrounds.
15. Saved progress from the previous reader version.
16. Final chapter auto-advance behavior.
17. Previous/next chapter navigation across spine boundaries.
18. Previous/next chapter navigation within one XHTML document.
19. Mobile header/footer chapter counts.
20. Large EPUBs with many spine resources.

## PDF

Test at minimum:

1. Small and large PDFs.
2. PDFs with embedded fonts.
3. PDFs containing image-heavy pages.
4. High-DPI displays.
5. Single-page mode.
6. Continuous/cascade mode.
7. Fit-to-width.
8. Rapid next/previous navigation.
9. Rapid zoom changes.
10. Search while text extraction is still running.
11. Search on PDFs without useful text layers.
12. Thumbnail loading/cancellation.
13. Closing while a page is rendering.
14. Closing while the PDF is downloading.
15. Reopening a recently viewed PDF from cache.
16. Fullscreen transitions.
17. Local page/zoom restoration.
18. Very large page counts and bounded cache behavior.

## Chapter-count correctness

For every new EPUB, verify that:

```text
reported chapter count
        ==
actual user-facing chapter entries
```

and **not**:

```text
reported chapter count
        ==
EPUB spine item count
```

When an EPUB has ambiguous or broken metadata, the reader should fall back conservatively and the EPUB should be added to the QA matrix rather than introducing a title-specific hardcoded chapter count.
