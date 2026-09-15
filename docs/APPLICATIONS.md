# AdaShimaverse Application Documentation

This folder documents **how each application works**, not just what it contains. Each app has its own Markdown file so implementation details, user flows, storage behavior, and content rules can be maintained independently.

| Application    | Documentation                                     |
| -------------- | ------------------------------------------------- |
| Novels         | [novels.md](applications/novels.md)               |
| Manga          | [manga.md](applications/manga.md)                 |
| Extra Stories  | [extra-stories.md](applications/extra-stories.md) |
| Music          | [music.md](applications/music.md)                 |
| Anime          | [anime.md](applications/anime.md)                 |
| Drama CD       | [drama-cd.md](applications/drama-cd.md)           |
| Gallery        | [gallery.md](applications/gallery.md)             |
| Timeline       | [timeline.md](applications/timeline.md)           |
| Constellation  | [constellation.md](applications/constellation.md) |
| Stats          | [stats.md](applications/stats.md)                 |
| Others         | [others.md](applications/others.md)               |
| Help Center    | [help.md](applications/help.md)                   |
| Settings & PWA | [settings.md](applications/settings.md)           |
| Global Search  | [global-search.md](applications/global-search.md) |

## Common application model

AdaShimaverse is primarily a client-side/static web application. Pages load localized JSON data, render the application UI, and use browser APIs such as `localStorage`, media playback, canvas, PDF.js, and ZIP/EPUB parsing where required.

A typical content flow is:

1. The page determines the active language.
2. The page loads the corresponding localized data file(s).
3. JavaScript normalizes the data and builds cards, lists, filters, or readers.
4. User actions update the current UI state.
5. Persistent preferences/progress are written to browser storage when the application supports them.
6. The page restores those values the next time the same browser loads the application.

This means **browser-local state is not automatically the same as account/cloud state**. Clearing site data can remove progress, favorites, bookmarks, and preferences depending on the application.

## Documentation rule

When adding or changing an application, update its dedicated document first. If the change affects shared behavior—such as language handling, storage conventions, navigation, or reader controls—also update the relevant shared documentation and Help Center entries.

## Technical documentation expectations

Each application document should describe both the **user-facing flow** and the **implementation boundary**: data sources and normalization, stable identifiers, rendering/playback behavior, local versus derived state, localization boundaries, failure handling, mobile constraints, performance-sensitive operations, and QA/maintenance requirements.

Reader documentation should explain the underlying document model. EPUB uses a package/manifest/spine/navigation structure, while PDF is a page-oriented document model. The EPUB specification defines the spine as the ordered default reading sequence and requires reading systems to process the navigation document. citeturn0search5turn0search4
