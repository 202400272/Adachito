# Timeline

## What the application does

Timeline is a chronological reference application. It turns localized timeline data into a visual sequence with year filters and expandable information.

## Data flow

1. Timeline data is loaded for the active language.
2. Entries are normalized into the timeline structure.
3. Year filter controls are generated from the available entries.
4. The timeline renders its visible entries.
5. Selecting a timeline bubble/card opens additional information in a modal.

## Filtering

Year filtering changes which timeline entries are visible; it does not delete or modify source data.

## Progress/visual behavior

The application uses visibility checks to update timeline presentation/progress effects as the user scrolls. Decorative star/sakura effects are presentation features and are separate from the underlying timeline records.

## Maintenance

Keep dates/years and entry IDs stable. Check year filters, modal positioning, mobile layouts, and long descriptions whenever timeline data is changed.

## Technical implementation

Timeline keeps source entries immutable while filtering and presentation state are derived in the UI. Year filters operate on normalized date/year fields. Visibility effects and scroll animations are presentation concerns and should not modify timeline data. Stable entry IDs are useful for modal state and future deep links.
