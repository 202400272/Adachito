# Data Architecture

## JSON as the content layer

The site keeps catalogue and editorial content in `src/data/`. Page JavaScript loads the relevant JSON with `fetch()` and renders the result into the DOM.

Typical data includes:

- light novel and manga metadata;
- chapter and volume information;
- gallery entries;
- help-center content;
- statistics inputs;
- language-specific copy;
- archive and adaptation information.

For a normal content update, edit the relevant JSON instead of hard-coding the same information in HTML or JavaScript.

## Editing data safely

When changing catalogue data:

1. Preserve the existing JSON structure and field names.
2. Keep identifiers stable unless there is a genuine data-model change.
3. Keep publication metadata internally consistent.
4. Check both language files when localized content exists.
5. Test the page that consumes the data after editing.
6. Avoid adding presentation logic to JSON; JSON should describe content, not how it is rendered.

## Localization

Localized content should remain in the project's existing language-specific data structures. Do not duplicate large blocks of translated text inside page scripts when the page already consumes JSON.

When adding a new Help Center topic, update the corresponding language data rather than creating a second page implementation.

## Catalogue accuracy

The archive is intended to distinguish source material, adaptations, publication information, and fan-translated reading resources. Do not silently convert uncertain information into fact. If a field is unknown or not confirmed, follow the existing data conventions rather than inventing a value.

## Data versus presentation

Use JSON for:

- titles;
- descriptions;
- dates;
- volume/chapter metadata;
- labels and copy;
- catalogue relationships;
- statistics data.

Use JavaScript/CSS for:

- filtering;
- sorting;
- interaction;
- layout;
- visual states;
- responsive behavior.

This separation keeps content updates inexpensive and reduces the chance of inconsistent information across pages.
