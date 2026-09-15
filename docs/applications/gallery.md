# Gallery

## What the application does

Gallery is the visual archive for illustrations, covers, and related artwork. It is designed for large collections, so it does not treat every image as an immediately visible DOM element.

## Data flow

1. Collection metadata is loaded for the active language.
2. Artwork metadata is normalized so volume/collection labels have consistent display forms.
3. The application groups artwork into collections/volumes.
4. Filters and search reduce the working set.
5. Visible images are loaded progressively/lazily.

## Progressive rendering

The gallery uses incremental rendering and image caching. Visible images are prioritized, while remaining items can be appended later. This prevents a large archive from causing a large initial layout or excessive simultaneous image requests.

## Viewer

Selecting an artwork opens the viewer with the selected item. The viewer can move between items and return to the filtered exhibition without losing the current collection context.

A slideshow can run through a selected artwork set and can be stopped independently.

## Filters and search

Collection filters, search, and volume grouping are metadata operations. They do not modify the underlying artwork catalog.

## Maintenance

Artwork entries should have stable IDs, collection/volume information, usable image URLs, and localized display metadata. Test lazy loading, random/shuffle views, viewer navigation, filters, slideshow, and large collections.

## Technical implementation

Gallery performance depends on progressive image loading rather than inserting every high-resolution asset at once. Metadata is normalized first, visible artwork is prioritized, and the viewer owns navigation independently from the filtered catalog. Large collections should be tested for request concurrency, image memory pressure, and cleanup when the viewer closes.
