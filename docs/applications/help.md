# Help Center

## What the application does

The Help Center is a data-driven, localized support application. The JavaScript renderer is generic; the actual questions and answers live in the language JSON files.

## Data flow

1. The current language is detected.
2. The corresponding Help JSON is loaded.
3. Categories/questions are rendered.
4. Search/filtering operates on the loaded help content.
5. Selecting a question opens its answer/details without requiring a separate hard-coded page for each question.

## What Help content should explain

Every important feature should answer four practical questions:

1. **What is it?**
2. **How do I use it?**
3. **What does it save/remember?**
4. **What should I do if it does not work?**

Reader-related Help entries should specifically cover EPUB continuous scrolling, automatic continuation after illustrations, PDF single/cascade behavior, mobile settings, reading progress, and local storage.

## Localization

English, Spanish, and Tagalog content should remain structurally equivalent. Adding a new feature means adding the corresponding entry to all supported Help language files rather than leaving a feature undocumented in one language.

## Maintenance

Avoid putting implementation-only jargon in the user-facing Help Center. Keep technical details such as storage keys, rendering queues, and parser behavior in the application documentation instead.

## Technical implementation

Help is data-driven: the renderer is shared while localized JSON contains categories, questions, and answers. Supported language files should remain structurally equivalent. User-facing Help describes observable behavior and recovery steps; implementation details such as storage keys, parsers, observers, and rendering queues belong in application documentation.
