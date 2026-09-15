# Music Application — Technical Architecture

## 1. Purpose and scope

The Music application is a browser-side audio library. It combines three layers:

1. **Localized catalog data** — album and track metadata lives in `src/data/music/{en,es,tg}.json`.
2. **Presentation and interaction** — `src/pages/Adashima_Music.html` provides the application shell and UI targets.
3. **Runtime player** — `src/js/music.js` owns catalog state, the HTML audio element, queue, playback controls, favorites, album views, downloads, and UI synchronization.

The application does not use a server-side player session. Playback state is held in the current browser tab, while selected user preferences and favorites are persisted with `localStorage`.

---

## 2. Runtime architecture

```text
Localized JSON
    │
    ▼
 musicData
    │
    ├──────────────► Album/library renderer
    │                         │
    │                         ├── standard album cards
    │                         ├── compact/list presentation
    │                         └── album detail + track rows
    │
    └──────────────► Track identity layer
                              │
                              ▼
                       currentAlbum/currentTrackId
                              │
                              ▼
                         HTMLAudioElement
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
              progress     ended/error   play/pause
                 │            │            │
                 └────────────┴────────────┘
                              ▼
                       UI synchronization

localStorage ─────► favorites + view preference
```

The important architectural boundary is **track identity**. UI labels are localized strings, but playback and favorites use stable IDs. This prevents a language switch from changing what a favorite points to.

---

## 3. Catalog data model

The application loads one of three language files:

- `src/data/music/es.json`
- `src/data/music/en.json`
- `src/data/music/tg.json`

`SUPPORTED_LANGUAGES` is `es`, `en`, and `tg`. `normalizeLanguage()` accepts the full language value or a language-region value such as `en-US` and reduces it to the supported base language.

The selected language is initially resolved from the site's language switcher when available, then from several existing local-storage keys, with Spanish as the final fallback.

### Why IDs matter

A track has an ID independent from its localized title. The favorite key is constructed as:

```text
albumId:trackId
```

For example, conceptually:

```text
album-01:track-03
```

The exact IDs come from the catalog JSON; the example above is only a format illustration.

This means:

- `Adachi`/`アダチ`/a translated title can change without breaking a favorite.
- A translated title does not need to be reverse-mapped to determine the selected track.
- Queue entries can remain compact because they only need track IDs.

---

## 4. Album and track state

The player is implemented inside an IIFE in `music.js`, which keeps mutable runtime state private to the music application.

Important state includes:

- `albums` — loaded catalog albums.
- `currentAlbum` — currently opened album object.
- `currentAlbumId` — stable ID of the active album.
- `currentTrackId` — stable ID of the active track.
- `isPlaying` — whether playback is considered active by the UI.
- `duration` — current media duration.
- `volume` — application volume value.
- `isMuted` — mute state.
- `shuffle` — shuffle mode.
- `repeatMode` — repeat behavior.
- `queue` — ordered track IDs used for next/previous playback.
- `favorites` — a `Set` of stable `albumId:trackId` keys.
- `currentView` — standard or compact presentation.

Keeping these values in one runtime state layer avoids having each album card, track row, queue drawer, and player bar maintain independent playback state.

---

## 5. Audio architecture

The actual playback engine is a native browser object:

```js
const audio = new Audio();
```

The application does not decode audio itself. The browser handles media loading, buffering, seeking, duration calculation, playback, and media errors.

When a track is selected, the application resolves the track's remote file through `getTrackUrl(albumFolder, filename)`. Filenames are URL-encoded so spaces and special characters do not produce malformed resource URLs.

The resulting URL is assigned to the shared `Audio` instance. The same audio element is reused as tracks change.

### Why use one shared audio element?

A single audio object provides a predictable source of truth:

```text
Track selection
     │
     ▼
shared audio.src
     │
     ├── currentTime
     ├── duration
     ├── paused
     └── media events
```

Creating a new `Audio` object for every row would make synchronization harder and could leave abandoned media objects playing or buffering. Reusing one element also makes the player bar independent from the currently rendered album view.

---

## 6. Playback event flow

The player listens to native media events and converts them into application state/UI updates.

Conceptually:

```text
user clicks Play
       │
       ▼
audio.play()
       │
       ▼
 browser playback
       │
       ├── timeupdate ──► progress slider + current time
       ├── loadedmetadata ──► duration
       ├── play/pause ──► player state + row state
       ├── ended ──► queue/repeat/next-track logic
       └── error ──► playback error notice
```

The player bar and visible track rows are then updated from the same `currentTrackId` and `isPlaying` state.

This is important when navigating between the library, album details, favorites, and queue: changing the visible page should not create a second playback state.

---

## 7. Queue architecture

The queue stores stable track IDs rather than complete track objects.

When an album is played, the album's track IDs can populate the queue. Previous/next operations resolve those IDs against the currently loaded catalog.

This design has two advantages:

1. The queue is small and serialization-friendly.
2. Queue entries remain independent of localized display titles.

Shuffle modifies the order used for navigation without changing the identity of the tracks themselves. Repeat behavior is handled at the playback-navigation boundary, particularly when the native `ended` event fires.

---

## 8. Favorites persistence

Favorites are stored under:

```text
adashima_music_favorites_v2
```

The persisted value is an array. `hydrateFavorites()` accepts both the current object representation and the older string-style representation and normalizes both into the internal `Set` format.

Internal representation:

```text
Set<string>

"albumId:trackId"
```

### Why normalize on load?

It gives the application a compatibility boundary. Older saved data can be read without forcing the rest of the player to understand multiple storage formats.

When favorites change, the application serializes the stable IDs back to `localStorage`.

Favorites are therefore:

- local to the browser/device;
- independent of language;
- independent of visible album-card order;
- independent of translated titles.

---

## 9. View persistence

The selected music presentation is stored under:

```text
adashima_music_view
```

The implementation currently accepts `standard` and `compact` as persisted values.

This is deliberately separate from playback state. Reloading the page can restore the preferred presentation without attempting to restore an active media session.

---

## 10. Localization architecture

Localization affects **presentation**, not identity.

For example, `getLocalizedTrackTitle(track)` selects the appropriate localized title for `currentLang`, with fallbacks when a specific translation is unavailable.

The separation is:

```text
stable ID ───────────────► favorite / queue / playback identity

localized title ────────► visible UI only
```

This is the correct direction of dependency. The application should never use a translated title as the primary key for a track.

---

## 11. Album rendering

Opening an album changes the application from library mode to album mode and stores the selected album in `currentAlbum`.

The album detail renderer updates:

- cover artwork;
- badge/type label;
- title and Japanese title where available;
- artist;
- release year;
- track count;
- aggregate duration;
- track rows.

Track duration strings are converted to seconds to calculate the album's total duration and then formatted for display.

Artwork has a fallback image path and an error handler so a missing album cover does not leave an unhandled broken-image state.

---

## 12. Standard vs compact track rendering

The application supports two presentation forms:

- **standard** — richer track rows for album detail pages;
- **compact** — denser rows intended for browsing larger lists.

Both representations point back to the same track IDs and player state. Switching the visual representation therefore does not replace the underlying media session.

When a track's favorite or playback state changes, the implementation can update affected rows instead of unnecessarily rebuilding the entire application.

This is particularly useful as the library grows because DOM churn is kept localized to the elements whose state actually changed.

---

## 13. Favorites view

The favorites view resolves the saved favorite keys back into album/track objects from the loaded catalog.

This is another reason stable IDs are important: the saved data does not need to contain localized strings, artwork URLs, or duplicated track metadata.

The renderer can reconstruct the current presentation from the authoritative catalog each time.

If a saved favorite points to an item that no longer exists in the current catalog, it can be ignored rather than producing a broken track object.

---

## 14. Direct downloads

The download path intentionally attempts a normal `fetch()` first.

Flow:

```text
Download click
     │
     ▼
fetch(track URL)
     │
     ├── success + body
     │       │
     │       ▼
     │    stream chunks
     │       │
     │       ▼
     │    Blob → object URL
     │       │
     │       ▼
     │    temporary <a download>
     │
     └── failure
             │
             ▼
       direct URL fallback
             │
             ▼
       user-facing notice
```

The response body is read in chunks rather than relying on a single convenience conversion. A temporary object URL is then created and assigned to an invisible download anchor.

The fallback exists because browser download behavior can be affected by server headers, cross-origin restrictions, browser policies, extensions, or ad blockers.

The UI also temporarily changes the download icon to loading/success/error states.

---

## 15. Icon rendering

The page uses Iconify icons. `refreshIconify()` calls `Iconify.scan(document.body)` after DOM/load events so dynamically inserted track rows and cards can receive their icon rendering.

This matters because much of the Music UI is generated after the initial HTML document has loaded.

Static markup alone cannot guarantee that an icon inserted later will be processed by the icon library, so the runtime explicitly asks Iconify to rescan.

---

## 16. Responsive architecture

Responsive behavior is primarily CSS-driven. The HTML provides the same logical player controls while the CSS changes their arrangement and density for smaller screens.

The JavaScript therefore does not maintain a separate mobile player engine. Mobile and desktop use the same underlying:

- track IDs;
- audio element;
- queue;
- favorite set;
- playback events;
- localization state.

Only the presentation changes.

This reduces the risk of desktop and mobile playback becoming behaviorally inconsistent.

---

## 17. Failure handling

The Music application generally treats browser persistence and remote media as unreliable boundaries.

Examples:

- `localStorage` failures are caught so the player can continue in memory.
- Missing translations fall back to another available title.
- Missing album artwork has a fallback.
- Download failures have a direct-URL fallback and visible notice.
- Playback errors can be surfaced to the user instead of silently leaving the UI in a loading state.

This follows a useful rule for the application: **failure at an optional persistence or presentation layer should not unnecessarily destroy the core playback session.**

---

## 18. Security and browser-boundary considerations

Remote music files are loaded from the configured R2 origin. Track filenames are URL-encoded before being inserted into the remote URL.

The application does not treat localized metadata as executable content. Track titles are display data and should continue to be escaped whenever inserted through HTML template strings.

Direct downloads remain subject to browser and server CORS/download policies; client JavaScript cannot override those policies.

`localStorage` should likewise be considered untrusted persisted state. The current normalization layer validates the expected favorite structure before using it.

---

## 19. Adding a new album

A new album should be added to all required localization files with the same stable album ID and compatible track IDs.

At minimum verify:

1. Stable album ID.
2. Stable track IDs.
3. Album folder/path.
4. Cover image path.
5. Track filenames.
6. Localized titles.
7. Artist/year metadata where applicable.
8. Duration strings.
9. Queue behavior.
10. Playback behavior.
11. Favorite persistence.
12. Download behavior.
13. Standard and compact rendering.
14. Mobile presentation.

Do not create different IDs merely because a title is translated.

---

## 20. Debugging checklist

### Album appears but track does not play

Check:

- the track filename;
- the album folder;
- the generated R2 URL;
- browser network errors;
- whether the remote resource is actually an audio file;
- server CORS/media headers.

### Favorite disappears after changing language

Check that the favorite key uses `albumId:trackId`, not a localized title.

### Queue plays the wrong track

Check that queue entries and `currentTrackId` refer to the same stable IDs and that lookup does not accidentally compare translated labels.

### Download opens a new tab

This is normally the fallback path. Check the remote response, CORS behavior, browser download restrictions, and whether an extension/ad blocker interferes with the fetch.

### Icons are missing on dynamically rendered content

Run `refreshIconify()` after the relevant DOM has been inserted, or ensure the existing render path already triggers the Iconify scan.

---

## 21. Design principles

The current Music implementation is intentionally organized around several boundaries:

**Identity boundary**

Stable IDs define what a track is.

**Presentation boundary**

Localized strings and responsive markup define how a track is displayed.

**Media boundary**

The native `Audio` object owns actual browser playback.

**Persistence boundary**

`localStorage` retains favorites and view preference, but the player remains functional if persistence is unavailable.

**Remote-resource boundary**

R2 supplies media files; the browser remains responsible for CORS, buffering, media decoding, and download policy.

Together, these boundaries let the Music application grow without coupling localization, rendering, playback, and persistence into one fragile data structure.
