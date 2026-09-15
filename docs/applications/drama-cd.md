# Drama CD

## What the application does

Drama CD presents audio drama content through a channel/TV-inspired interface. The visual presentation is intentionally different from the Music application even though both ultimately play audio.

## Playback flow

1. Drama metadata identifies available channels/items.
2. Selecting a channel changes the visible program/content information.
3. Selecting playback starts the associated audio resource.
4. The interface updates playback state while preserving the channel-style presentation.

The application can expose menus, fullscreen behavior, playback controls, and CRT/static-style presentation effects.

## Visual effects

CRT/static effects are presentation layers. They do not modify audio files or content metadata.

## Maintenance

When adding drama content, verify the channel/item identifier, audio path, title/localization, playback controls, fullscreen behavior, and mobile interaction. Keep visual effects optional enough that they do not prevent basic audio use.

## Technical implementation

The Drama CD interface separates audio playback state from its TV/CRT presentation layer. Channel selection changes metadata and visual state; the audio element remains responsible for loading, playback, seeking, duration, and ended events. CRT/static effects are optional presentation layers and should never be required for basic audio use.
