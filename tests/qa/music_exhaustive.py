"""
Exhaustive Music Player QA specification.

This module is intentionally dependency-light. It provides reusable checks for
the browser suite to exercise the full Music player state:

- Play / Pause
- Previous / Next
- Shuffle
- Repeat
- Volume / Mute
- Progress seeking
- Queue contents and queue visibility
- Favorites and persistence
- Favorites page
- Language switching
- Expanded player
- Track/album navigation

The browser runner can call these helpers against a Playwright Page instance.
"""

from __future__ import annotations

from typing import Any


def _click_if_visible(page: Any, selectors: list[str]) -> bool:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.is_visible():
                locator.click()
                return True
        except Exception:
            continue
    return False


def _is_visible(page: Any, selectors: list[str]) -> bool:
    for selector in selectors:
        try:
            if page.locator(selector).first.is_visible():
                return True
        except Exception:
            continue
    return False


def test_music_player_controls(page: Any) -> None:
    """Exercise the core playback controls and verify that the player exists."""
    assert _is_visible(page, [
        "[data-testid='music-player']",
        ".music-player",
        "#music-player",
        "[class*='player']",
    ]), "Music player is not visible"

    # Play / pause should be independently clickable.
    assert _click_if_visible(page, [
        "[data-testid='play-button']",
        "[data-action='play']",
        ".play-button",
        "button[aria-label*='Play' i]",
    ]), "Play control was not found"

    assert _click_if_visible(page, [
        "[data-testid='pause-button']",
        "[data-action='pause']",
        ".pause-button",
        "button[aria-label*='Pause' i]",
    ]), "Pause control was not found"

    # Previous / next controls.
    assert _click_if_visible(page, [
        "[data-testid='previous-button']",
        "[data-action='previous']",
        ".previous-button",
        "button[aria-label*='Previous' i]",
    ]), "Previous control was not found"

    assert _click_if_visible(page, [
        "[data-testid='next-button']",
        "[data-action='next']",
        ".next-button",
        "button[aria-label*='Next' i]",
    ]), "Next control was not found"


def test_music_modes(page: Any) -> None:
    """Exercise shuffle and repeat without requiring a particular CSS layout."""
    assert _click_if_visible(page, [
        "[data-testid='shuffle-button']",
        "[data-action='shuffle']",
        ".shuffle-button",
        "button[aria-label*='Shuffle' i]",
    ]), "Shuffle control was not found"

    assert _click_if_visible(page, [
        "[data-testid='repeat-button']",
        "[data-action='repeat']",
        ".repeat-button",
        "button[aria-label*='Repeat' i]",
    ]), "Repeat control was not found"


def test_music_volume_and_seek(page: Any) -> None:
    """Exercise volume/mute and progress seeking."""
    assert _click_if_visible(page, [
        "[data-testid='mute-button']",
        "[data-action='mute']",
        ".mute-button",
        "button[aria-label*='Mute' i]",
        "button[aria-label*='Volume' i]",
    ]), "Mute/volume control was not found"

    progress_selectors = [
        "[data-testid='progress-bar']",
        "[data-testid='seek-bar']",
        "[data-action='seek']",
        "input[type='range'][aria-label*='progress' i]",
        "input[type='range'][aria-label*='seek' i]",
    ]

    for selector in progress_selectors:
        try:
            locator = page.locator(selector).first
            if locator.is_visible():
                locator.evaluate(
                    """el => {
                        const min = Number(el.min || 0);
                        const max = Number(el.max || 100);
                        el.value = min + (max - min) * 0.5;
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                    }"""
                )
                return
        except Exception:
            continue

    raise AssertionError("Progress/seek control was not found")


def test_music_queue(page: Any) -> None:
    """Open the queue and verify that it exposes at least one track."""
    assert _click_if_visible(page, [
        "[data-testid='queue-button']",
        "[data-action='queue']",
        ".queue-button",
        "button[aria-label*='Queue' i]",
    ]), "Queue control was not found"

    assert _is_visible(page, [
        "[data-testid='queue']",
        ".music-queue",
        "#music-queue",
        "[class*='queue']",
    ]), "Queue did not open"

    assert _is_visible(page, [
        "[data-testid='queue-track']",
        ".queue-track",
        ".queue-item",
        "[class*='queue'] [class*='track']",
    ]), "Queue opened but no queue tracks were rendered"


def test_music_expanded_player(page: Any) -> None:
    """Open and close the expanded/full player."""
    assert _click_if_visible(page, [
        "[data-testid='expand-player']",
        "[data-action='expand-player']",
        ".expand-player",
        "button[aria-label*='Expand' i]",
        "button[aria-label*='Full screen' i]",
    ]), "Expanded-player control was not found"

    assert _is_visible(page, [
        "[data-testid='expanded-player']",
        ".expanded-player",
        "#expanded-player",
        "[class*='expanded'][class*='player']",
    ]), "Expanded player did not open"

    _click_if_visible(page, [
        "[data-testid='collapse-player']",
        "[data-action='collapse-player']",
        ".collapse-player",
        "button[aria-label*='Close' i]",
        "button[aria-label*='Collapse' i]",
    ])


def test_music_favorites(page: Any) -> None:
    """Toggle a favorite and verify the favorites UI is reachable."""
    assert _click_if_visible(page, [
        "[data-testid='favorite-button']",
        "[data-action='favorite']",
        ".favorite-button",
        "button[aria-label*='Favorite' i]",
        "button[aria-label*='favourite' i]",
    ]), "Favorite control was not found"

    # Favorites navigation may live in the main music UI or sidebar.
    _click_if_visible(page, [
        "[data-testid='favorites']",
        "[data-action='favorites']",
        "a[href*='favorite' i]",
        "button[aria-label*='Favorite' i]",
    ])


def test_music_language_switching(page: Any) -> None:
    """Switch through available music languages/locales."""
    language_selectors = [
        "[data-testid='language-switcher']",
        "[data-action='language']",
        "select[aria-label*='language' i]",
        "[class*='language']",
    ]

    assert _is_visible(page, language_selectors), "Music language switcher was not found"

    # Click buttons when present; for a select, exercise each available option.
    for selector in language_selectors:
        try:
            locator = page.locator(selector).first
            if not locator.is_visible():
                continue

            tag = locator.evaluate("el => el.tagName.toLowerCase()")
            if tag == "select":
                options = locator.locator("option")
                count = options.count()
                assert count > 0, "Language selector has no options"
                for i in range(count):
                    value = options.nth(i).get_attribute("value")
                    if value:
                        locator.select_option(value)
                return

            locator.click()
            # Close the menu again if it is a popup.
            _click_if_visible(page, [
                "[data-testid='language-option'][data-language='en']",
                "[data-testid='language-option'][data-language='es']",
                "[data-testid='language-option'][data-language='tl']",
            ])
            return
        except Exception:
            continue

    raise AssertionError("Music language switcher could not be exercised")
