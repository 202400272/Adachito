# Constellation

## What the application does

Constellation is an interactive progression application. Users interact with stars on a canvas to complete constellation patterns, unlock related profiles/rewards, and eventually reach final progression events.

## Data loading

The application loads three main categories of data:

- localized interface/content text;
- constellation definitions;
- reward definitions.

The constellation definitions describe the stars/points and the information associated with each constellation.

## Interaction flow

1. The sky/canvas is generated for the current viewport.
2. A constellation is selected.
3. The user interacts with the target stars.
4. Pointer/touch positions are translated into canvas coordinates.
5. Star proximity/snap logic determines whether an interaction connects with the intended point.
6. Connections are drawn as progress is made.
7. When the constellation is complete, the application updates progress and can trigger its reward/profile flow.

## Rewards and profiles

Completing constellations can unlock profile content and rewards. Reward dialogs provide feedback and the sidebar can display unlocked items.

A final event can be triggered after the required constellation progression is complete.

## Sound and effects

Completion sounds and particle/star effects are optional presentation feedback around the progression events.

## Persistence

Progress is saved in browser storage and restored when the application starts. It is therefore local to the browser unless a synchronization layer is added.

## Maintenance

When changing constellation data, verify star coordinates/IDs, completion thresholds, reward IDs, profile mapping, localization, mobile pointer/touch handling, canvas resizing, reset behavior, and progress restoration.

## Technical implementation

Constellation is an interaction-heavy canvas application. Star positions are stored as data and transformed into the current canvas coordinate system so resizing does not require rewriting constellation definitions. Pointer/touch coordinates are converted into canvas coordinates and checked against star hit areas before connections are accepted. Completion state is persisted locally while reward/profile identifiers remain separate from translated display labels.
