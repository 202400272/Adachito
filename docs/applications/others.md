# Others

## What the application does

Others is the miscellaneous resource/document section. It is intended for material that does not naturally belong in Novels, Manga, Music, Anime, Gallery, or the other primary applications.

## Data flow

1. Localized resource metadata is loaded.
2. Resource cards are generated from the configured title/description/type information.
3. Selecting an item executes the configured open/download behavior.

The application does not interpret every resource as a reader. The resource's configured action determines whether it is opened, downloaded, or handled by the browser.

## Maintenance

Keep filenames/URLs valid, titles localized, and resource descriptions clear about what the user is opening. Test direct downloads and browser-native document opening separately.

## Technical implementation

Others is a metadata-driven router for resources that should not be interpreted by a custom reader. Each item needs a stable identity, display metadata, and an explicit action/URL. Browser-native opening and direct downloads should be tested separately because they follow different browser behavior.
