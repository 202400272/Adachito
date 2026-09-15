# Anime

## What the application does

Anime is the video application for episodes and related animated content. It combines an episode catalog with stream/source information and local viewing progress.

## Catalog flow

1. Localized anime metadata is loaded.
2. Episode groups/folders are built from the metadata.
3. The user selects an episode.
4. The player opens the configured stream variant.
5. Playback state can be retained locally so the catalog can indicate watched/current progress.

## Sources and variants

The stream catalog can contain more than one source variant. The application resolves the available variant for the current language/configuration and can expose source switching when alternatives exist.

A missing source in the data catalog is different from a player error: the player cannot create a stream that is not present in the configured source data.

## Progress

Episode progress is used for resume/current-episode presentation and watched indicators. Storage is browser-local unless another synchronization mechanism is added.

## Mini Anime

Mini Anime is a separate supplemental catalog. It uses its own localized data so short-form animated material can be displayed without mixing it into the main episode sequence.

## Maintenance

When adding an episode, verify its stable ID, title, folder/group, stream variants, thumbnail, language data, and playback/progress behavior. Test a missing source as well as a valid source so the error state remains understandable.

## Technical implementation

Anime separates catalog metadata from playable media URLs. Stable episode identifiers are used for progress rather than localized titles. The catalog resolves the selected episode and source variant, then hands the media URL to the browser player. Playback state stays separate from catalog rendering so filters and language changes do not reset the active player. Browser-local progress is suitable for resume indicators but is not account synchronization.
