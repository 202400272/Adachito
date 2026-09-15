# Extra Stories

## What the application does

Extra Stories is the archive for supplementary stories that do not belong to the primary numbered novel sequence. It combines a searchable/filterable library with a built-in HTML story reader.

## Library flow

1. The page loads localized story metadata.
2. Optional source metadata is loaded separately.
3. The application builds filter options from story type, store/source, volume, and other metadata.
4. Search/filter operations reduce the visible story set without rebuilding the entire page unnecessarily.
5. Selecting a story opens the reader and updates the URL/history so a story can be reopened through navigation.

## Reader

Story content is loaded separately from the catalog metadata. The reader displays title, metadata, tags, source information, and story content and provides navigation to adjacent stories.

The reader supports immersive mode and a settings panel for typography/presentation.

## Bookmarks and read state

Each story can be bookmarked and can be marked read/unread. The application also records approximate reading progress.

A Continue Reading area can be generated from saved progress so users can resume unfinished stories without manually finding them again.

## Local storage

Bookmarks, read/unread state, reader settings, and progress are browser-local. They survive normal page reloads but can be lost when site storage is cleared. They are not automatically synchronized across browsers/devices.

## Maintenance

Story IDs must remain stable because they are used by bookmarks/progress. If an ID is changed, existing local state will no longer match the renamed item.

## Technical implementation

Extra Stories uses metadata for discovery and loads story content separately. Stable story IDs are the storage key for bookmarks, read state, and progress. Search/filtering operates on normalized metadata, while the reader owns typography, immersive mode, progress, and navigation. This prevents translated title changes from invalidating local reading state.
