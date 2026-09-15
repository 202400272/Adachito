# Global Search

## What the application does

Global Search provides a single entry point for finding content across different applications instead of requiring the user to know which section contains an item.

## Index flow

The search system uses a manifest/index containing searchable metadata from the site's major content areas. Results can include categories such as novels, manga, music, Extra Stories, and gallery metadata.

Search normalizes user text before matching so differences in case/formatting are less likely to prevent a match.

## Result flow

1. The user enters a search term.
2. The search system normalizes the query.
3. Indexed entries are compared against the query.
4. Results are grouped/presented with enough metadata to identify the target application.
5. Selecting a result routes the user to the relevant content/application.

## Maintenance

When adding a new application or content type, decide whether it belongs in the global search manifest. Add stable IDs and destination information rather than relying on localized display titles as identifiers.

Search should remain useful even when the active language changes; identifiers and destination metadata should remain stable while display text can be localized.

## Technical implementation

Global Search is an index-driven feature. Search records should contain stable IDs, application/type information, destination information, and localized searchable fields. Queries are normalized before matching. Display labels may change with language, but routing should use stable identifiers or canonical destinations.
