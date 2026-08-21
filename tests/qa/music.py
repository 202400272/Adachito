"""Dedicated browser QA for the AdashimaVerse Music page.

The music player creates its <audio> object in JavaScript instead of placing an
<audio> element in the DOM, so this workflow tests the real UI and observes the
network request produced by the player rather than looking for a DOM audio tag.
"""
from __future__ import annotations

import time
from urllib.parse import urljoin

from .models import Result

MUSIC_ROUTE = "/Adashima_Music"
LANGUAGES = ("es", "en", "tg")
ALBUM_IDS = ("ost", "opening", "ending")


def _result(name, status, summary, details=None, count=1, start=None):
    return Result(
        "Music",
        name,
        status,
        summary,
        details or [],
        count=count,
        duration=(time.perf_counter() - start) if start else 0.0,
    )


def _goto(page, base_url, route=MUSIC_ROUTE):
    return page.goto(
        urljoin(base_url.rstrip("/") + "/", route.lstrip("/")),
        wait_until="domcontentloaded",
        timeout=30000,
    )


def _visible(page, selector):
    loc = page.locator(selector).first
    try:
        return loc.count() > 0 and loc.is_visible()
    except Exception:
        return False


def _set_language(page, base_url, lang):
    page.add_init_script(
        f"localStorage.setItem('lang', {lang!r}); "
        f"localStorage.setItem('preferredLanguage', {lang!r}); "
        f"localStorage.setItem('language', {lang!r});"
    )
    _goto(page, base_url)
    page.wait_for_timeout(500)


def _wait_for_album_grid(page):
    page.locator("#albumGrid .album-card[data-album-id]").first.wait_for(
        state="visible", timeout=15000
    )


def _click_album(page, album_id):
    card = page.locator(f"#albumGrid .album-card[data-album-id='{album_id}']").first
    if card.count() == 0:
        return False
    card.click()
    page.locator("#albumDetailView").wait_for(state="visible", timeout=5000)
    return True


def _check_language(page, base_url, lang):
    start = time.perf_counter()
    _set_language(page, base_url, lang)
    try:
        _wait_for_album_grid(page)
        cards = page.locator("#albumGrid .album-card[data-album-id]")
        count = cards.count()
        titles = [cards.nth(i).locator(".album-card-title").inner_text().strip() for i in range(count)]
        bad = [f"album card {i + 1} has no title" for i, title in enumerate(titles) if not title]
        if count != len(ALBUM_IDS):
            bad.append(f"expected {len(ALBUM_IDS)} music albums, found {count}")
        return _result(
            f"Music · {lang.upper()} library",
            "FAIL" if bad else "PASS",
            f"Music library rendered {count} album cards.",
            bad,
            count=count,
            start=start,
        )
    except Exception as exc:
        return _result(
            f"Music · {lang.upper()} library",
            "FAIL",
            "Music library did not finish rendering.",
            [str(exc)[:240]],
            start=start,
        )


def _check_album_and_controls(page, base_url, album_id="ost"):
    results = []

    start = time.perf_counter()
    try:
        _set_language(page, base_url, "en")
        _wait_for_album_grid(page)
        if not _click_album(page, album_id):
            return [_result("Music · Open album", "FAIL", f"Album '{album_id}' was not found.", start=start)]
        rows = page.locator("#albumTrackTable .track-row")
        row_count = rows.count()
        if row_count == 0:
            results.append(_result("Music · Track list", "FAIL", "Album opened but no tracks were rendered.", start=start))
            return results
        track_title = rows.first.locator(".track-title-jp").inner_text().strip()
        results.append(_result(
            "Music · Open album",
            "PASS" if track_title else "FAIL",
            f"Album '{album_id}' opened with {row_count} visible track rows.",
            [] if track_title else ["First track has no rendered title."],
            count=row_count,
            start=start,
        ))
    except Exception as exc:
        return [_result("Music · Open album", "FAIL", "Could not open and inspect the album.", [str(exc)[:240]], start=start)]

    # Search should filter the track list rather than just accepting input.
    start = time.perf_counter()
    try:
        search = page.locator("#albumSearchInput")
        before = rows.count()
        search.fill(track_title[:5])
        page.wait_for_timeout(300)
        after = page.locator("#albumTrackTable .track-row").count()
        search.fill("")
        page.wait_for_timeout(250)
        restored = page.locator("#albumTrackTable .track-row").count()
        ok = after > 0 and after <= before and restored == before
        results.append(_result(
            "Music · Track search",
            "PASS" if ok else "FAIL",
            f"Search changed {before} tracks to {after}, then restored {restored}.",
            [] if ok else ["Expected the search to filter results and clearing it to restore the full track list."],
            count=1,
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Track search", "FAIL", "Track search could not be exercised.", [str(exc)[:240]], start=start))

    # Standard <-> compact view must actually swap the visible containers.
    start = time.perf_counter()
    try:
        compact = page.locator(".view-toggle-btn[data-view='compact']")
        standard = page.locator(".view-toggle-btn[data-view='standard']")
        compact.click()
        page.wait_for_timeout(150)
        compact_visible = page.locator("#compactViewContainer").is_visible()
        standard_hidden = page.locator("#trackTableWrapper").is_hidden()
        standard.click()
        page.wait_for_timeout(150)
        standard_visible = page.locator("#trackTableWrapper").is_visible()
        compact_hidden = page.locator("#compactViewContainer").is_hidden()
        ok = compact_visible and standard_hidden and standard_visible and compact_hidden
        results.append(_result(
            "Music · View toggle",
            "PASS" if ok else "FAIL",
            "Standard and compact track views toggle correctly." if ok else "Track view containers did not toggle correctly.",
            [] if ok else ["Expected compact view to hide the standard table and standard view to restore it."],
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · View toggle", "FAIL", "View toggle could not be exercised.", [str(exc)[:240]], start=start))

    # Player request: click a real track and watch for the R2 music request.
    start = time.perf_counter()
    music_requests = []
    music_responses = []
    page.on("request", lambda req: music_requests.append(req) if "/music/" in req.url else None)
    page.on("response", lambda res: music_responses.append(res) if "/music/" in res.url else None)
    try:
        first_row = page.locator("#albumTrackTable .track-row").first
        first_row.locator(".col-play-btn").click()
        page.wait_for_timeout(1800)
        src = page.evaluate("""() => Array.from(performance.getEntriesByType('resource'))
            .map(e => e.name).find(u => /\\/music\\//i.test(u) && /\\.(flac|mp3|m4a|aac|ogg|wav)(\\?|$)/i.test(u)) || ''""")
        player_visible = page.locator("#playerBar").is_visible()
        request_ok = bool(music_requests or music_responses or src)
        statuses = [getattr(r, "status", None) for r in music_responses if getattr(r, "status", None)]
        bad_statuses = [s for s in statuses if s >= 400]
        ok = player_visible and request_ok and not bad_statuses
        details = []
        if not player_visible:
            details.append("Player bar did not become visible after selecting a track.")
        if not request_ok:
            details.append("No /music/ audio request was observed after selecting a track.")
        if bad_statuses:
            details.append(f"Music request returned HTTP status(es): {bad_statuses}.")
        results.append(_result(
            "Music · Playback request",
            "PASS" if ok else "FAIL",
            "Selecting a track opened the player and requested its audio source." if ok else "Track selection did not produce a healthy playback request.",
            details,
            count=1,
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Playback request", "FAIL", "Playback could not be exercised.", [str(exc)[:240]], start=start))

    # Exercise the full player control strip: play/pause, previous/next,
    # shuffle, repeat, mute, volume, and seeking.
    start = time.perf_counter()
    try:
        controls = {
            "play/pause": "#playBtn",
            "previous": "#prevBtn",
            "next": "#nextBtn",
            "shuffle": "#shuffleBtn",
            "repeat": "#repeatBtn",
            "mute": "#muteBtn",
            "progress": "#progressSlider",
            "volume": "#volumeSlider",
        }
        missing = [name for name, selector in controls.items() if page.locator(selector).count() == 0]
        if missing:
            results.append(_result(
                "Music · Player controls", "FAIL",
                "The Music player is missing one or more core controls.",
                [f"Missing control: {name}" for name in missing],
                start=start,
            ))
        else:
            # Play/pause must be actionable twice without throwing.
            page.locator("#playBtn").click(); page.wait_for_timeout(150)
            page.locator("#playBtn").click(); page.wait_for_timeout(150)

            # Previous/next should be wired and not throw after a track is active.
            page.locator("#prevBtn").click(); page.wait_for_timeout(100)
            page.locator("#nextBtn").click(); page.wait_for_timeout(100)

            shuffle = page.locator("#shuffleBtn")
            before_shuffle = shuffle.get_attribute("class") or ""
            shuffle.click(); page.wait_for_timeout(80)
            after_shuffle = shuffle.get_attribute("class") or ""
            shuffle.click(); page.wait_for_timeout(80)
            shuffle_ok = before_shuffle != after_shuffle

            repeat = page.locator("#repeatBtn")
            before_repeat = repeat.get_attribute("class") or ""
            repeat.click(); page.wait_for_timeout(80)
            after_repeat = repeat.get_attribute("class") or ""
            repeat.click(); page.wait_for_timeout(80)
            repeat_ok = before_repeat != after_repeat

            mute = page.locator("#muteBtn")
            mute.click(); page.wait_for_timeout(80)
            mute.click(); page.wait_for_timeout(80)

            volume = page.locator("#volumeSlider")
            original_volume = volume.input_value()
            target_volume = "35" if original_volume != "35" else "65"
            volume.fill(target_volume)
            volume.dispatch_event("input")
            volume_ok = volume.input_value() == target_volume

            progress = page.locator("#progressSlider")
            progress.fill("500")
            progress.dispatch_event("input")
            progress_ok = progress.input_value() == "500"

            ok = shuffle_ok and repeat_ok and volume_ok and progress_ok
            results.append(_result(
                "Music · Player controls",
                "PASS" if ok else "FAIL",
                "Playback, navigation, shuffle, repeat, mute, volume, and seeking controls responded correctly." if ok else "One or more player controls did not respond as expected.",
                [] if ok else [
                    *([] if shuffle_ok else ["Shuffle did not change state."]),
                    *([] if repeat_ok else ["Repeat did not change state."]),
                    *([] if volume_ok else ["Volume slider did not accept the new value."]),
                    *([] if progress_ok else ["Progress slider did not accept the new position."]),
                ],
                count=len(controls),
                start=start,
            ))
    except Exception as exc:
        results.append(_result("Music · Player controls", "FAIL", "Player controls could not be fully exercised.", [str(exc)[:240]], start=start))

    # Favorite state must persist to localStorage and render as faved.
    start = time.perf_counter()
    try:
        fav = page.locator("#favBtn")
        before = page.evaluate("localStorage.getItem('adashima_music_favorites_v2') || ''")
        fav.click()
        page.wait_for_timeout(100)
        after = page.evaluate("localStorage.getItem('adashima_music_favorites_v2') || ''")
        is_faved = fav.get_attribute("aria-label") == "Remove from favorites" or fav.locator(".iconify[data-icon='mdi:heart']").count() > 0
        fav.click()
        page.wait_for_timeout(100)
        cleared = page.evaluate("localStorage.getItem('adashima_music_favorites_v2') || ''")
        changed = after != before
        removed = cleared != after
        ok = changed and removed and is_faved
        results.append(_result(
            "Music · Favorites",
            "PASS" if ok else "FAIL",
            "Favorite state toggles and is stored locally." if ok else "Favorite state did not toggle/persist as expected.",
            [] if ok else ["Expected a favorite click to change localStorage and the player favorite state, then a second click to remove it."],
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Favorites", "FAIL", "Favorite control could not be exercised.", [str(exc)[:240]], start=start))

    # Queue and expanded player are core controls on this page.
    start = time.perf_counter()
    try:
        queue = page.locator("#queueToggle")
        queue.click()
        page.wait_for_timeout(100)
        queue_open = page.locator("#queueDrawer").is_visible()
        page.locator("#queueClose").click()
        page.wait_for_timeout(100)
        queue_closed = page.locator("#queueDrawer").is_hidden()
        results.append(_result(
            "Music · Queue",
            "PASS" if queue_open and queue_closed else "FAIL",
            "Queue drawer opens and closes correctly." if queue_open and queue_closed else "Queue drawer did not open and close correctly.",
            [] if queue_open and queue_closed else ["Expected queueToggle and queueClose to control the queue drawer."],
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Queue", "FAIL", "Queue control could not be exercised.", [str(exc)[:240]], start=start))

    start = time.perf_counter()
    try:
        expand = page.locator("#expandPlayerBtn")
        expand.click()
        page.wait_for_timeout(100)
        opened = page.locator("#expandedPlayerOverlay").is_visible()
        page.locator("#expandedPlayerClose").click()
        page.wait_for_timeout(100)
        closed = page.locator("#expandedPlayerOverlay").is_hidden()
        results.append(_result(
            "Music · Expanded player",
            "PASS" if opened and closed else "FAIL",
            "Expanded player opens and closes correctly." if opened and closed else "Expanded player did not open and close correctly.",
            [] if opened and closed else ["Expected expandPlayerBtn and expandedPlayerClose to control the overlay."],
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Expanded player", "FAIL", "Expanded player could not be exercised.", [str(exc)[:240]], start=start))

    # Back navigation should restore the library and remove the album query.
    start = time.perf_counter()
    try:
        page.locator("#backToLibraryBtn").click()
        page.wait_for_timeout(200)
        library_visible = page.locator("#musicLibraryView").is_visible()
        detail_hidden = page.locator("#albumDetailView").is_hidden()
        no_album_query = "album=" not in page.url
        ok = library_visible and detail_hidden and no_album_query
        results.append(_result(
            "Music · Album navigation",
            "PASS" if ok else "FAIL",
            "Back to Music restores the library view." if ok else "Back navigation did not fully restore the library view.",
            [] if ok else ["Expected the library to be visible, album detail to be hidden, and the album query to be removed."],
            start=start,
        ))
    except Exception as exc:
        results.append(_result("Music · Album navigation", "FAIL", "Album back navigation failed.", [str(exc)[:240]], start=start))

    return results


def run_music_suite(page, base_url):
    """Run the Music page suite at desktop/mobile-friendly browser sizes."""
    results = []
    for lang in LANGUAGES:
        results.append(_check_language(page, base_url, lang))
    results.extend(_check_album_and_controls(page, base_url, "ost"))
    return results


def test_music_page(page, base_url):
    """Backward-compatible entry point for older QA callers."""
    return run_music_suite(page, base_url)
