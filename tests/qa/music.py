"""Dedicated browser QA for the AdashimaVerse Music page.

The Music suite intentionally walks every track exposed by the EN and ES
Music manifests. Each track is clicked through the real UI and the resulting
R2 audio request plus player title are verified.
"""
from __future__ import annotations

import json
import time
from urllib.parse import quote, urljoin

from .models import Result

MUSIC_ROUTE = "/Adashima_Music"
LANGUAGES = ("en", "es")
ALBUM_IDS = ("ost", "opening", "ending")
TRACK_TIMEOUT_MS = 15000
HEARTBEAT_SECONDS = 2.0


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
    card = page.locator(
        f"#albumGrid .album-card[data-album-id='{album_id}']"
    ).first
    if card.count() == 0:
        return False
    card.click()
    page.locator("#albumDetailView").wait_for(state="visible", timeout=5000)
    return True


def _load_manifest(page, lang):
    """Read the same language manifest the Music page loads."""
    return page.evaluate(
        """async (lang) => {
            const response = await fetch(`/src/data/music/${lang}.json?v=qa`);
            if (!response.ok) throw new Error(`Music manifest HTTP ${response.status}`);
            return await response.json();
        }""",
        lang,
    )


def _track_label(track):
    return (
        track.get("title")
        or track.get("title_es")
        or track.get("title_en")
        or track.get("title_jp")
        or track.get("id")
        or "Untitled"
    )


def _progress(lang, album_name, index, total, track_name, phase, started):
    elapsed = time.perf_counter() - started
    print(
        f'  Music · {lang.upper()} · {album_name} · {index}/{total} · "{track_name}"',
        flush=True,
    )
    print(f"    ⟳ {phase} · elapsed {elapsed:.1f}s", flush=True)


def _verify_track(page, album, track, lang, index, total, started, request_log, response_log):
    track_id = str(track["id"])
    filename = str(track["filename"])
    folder = str(album.get("folder") or album["id"])
    expected_suffix = f"/music/{folder}/{quote(filename, safe='')}"
    label = _track_label(track)

    row = page.locator(f"#albumTrackTable .track-row[data-id='{track_id}']").first
    if row.count() == 0:
        return False, f'{track_id}: row not rendered for "{label}"'

    request_log.clear()
    response_log.clear()
    _progress(lang, album["id"], index, total, label, "clicking track", started)
    row.locator(".col-play-btn").click()

    deadline = time.monotonic() + TRACK_TIMEOUT_MS / 1000
    next_heartbeat = time.monotonic() + HEARTBEAT_SECONDS
    seen_audio = False
    bad_status = []
    expected_request = False

    while time.monotonic() < deadline:
        for req in request_log:
            if expected_suffix in req.url:
                expected_request = True
                seen_audio = True
        for res in response_log:
            if expected_suffix in res.url:
                seen_audio = True
                if res.status >= 400:
                    bad_status.append(res.status)

        title = ""
        try:
            title = page.locator("#playerTitle").inner_text().strip()
        except Exception:
            pass

        title_ok = bool(title) and title == label
        if expected_request and title_ok and not bad_status:
            _progress(lang, album["id"], index, total, label, "✓ audio + player title verified", started)
            return True, ""

        if time.monotonic() >= next_heartbeat:
            phase = "waiting for audio request / player title"
            if expected_request:
                phase = "audio request seen · waiting for player title"
            _progress(lang, album["id"], index, total, label, phase, started)
            next_heartbeat = time.monotonic() + HEARTBEAT_SECONDS
        page.wait_for_timeout(100)

    if bad_status:
        return False, f"{track_id}: audio request returned HTTP {bad_status}"
    if not expected_request:
        return False, f"{track_id}: expected audio request did not appear: {expected_suffix}"
    try:
        title = page.locator("#playerTitle").inner_text().strip()
    except Exception:
        title = ""
    if title != label:
        return False, f'{track_id}: player title mismatch (expected "{label}", got "{title}")'
    return False, f"{track_id}: timed out after {TRACK_TIMEOUT_MS / 1000:.0f}s"


def _check_language_and_tracks(page, base_url, lang):
    start = time.perf_counter()
    failures = []
    total_tracks = 0
    checked_tracks = 0
    request_log = []
    response_log = []
    page.on("request", lambda req: request_log.append(req) if "/music/" in req.url else None)
    page.on("response", lambda res: response_log.append(res) if "/music/" in res.url else None)

    try:
        _set_language(page, base_url, lang)
        _wait_for_album_grid(page)
        manifest = _load_manifest(page, lang)
        albums = {str(album["id"]): album for album in manifest.get("albums", [])}

        missing_albums = [album_id for album_id in ALBUM_IDS if album_id not in albums]
        if missing_albums:
            return _result(
                f"Music · {lang.upper()} exhaustive tracks",
                "FAIL",
                f"Manifest is missing albums: {', '.join(missing_albums)}.",
                count=0,
                start=start,
            )

        total_tracks = sum(len(albums[album_id].get("tracks", [])) for album_id in ALBUM_IDS)
        print(f"  Music · {lang.upper()} · exhaustive track run · {total_tracks} tracks", flush=True)

        for album_id in ALBUM_IDS:
            album = albums[album_id]
            tracks = album.get("tracks", [])
            if not _click_album(page, album_id):
                failures.append(f"{album_id}: album could not be opened")
                continue

            rows = page.locator("#albumTrackTable .track-row")
            rendered = rows.count()
            if rendered != len(tracks):
                failures.append(f"{album_id}: manifest has {len(tracks)} tracks but UI rendered {rendered}")
                continue

            for index, track in enumerate(tracks, 1):
                ok, detail = _verify_track(
                    page, album, track, lang, index, len(tracks), start, request_log, response_log
                )
                checked_tracks += 1
                if not ok:
                    failures.append(detail)

            # Opening an album hides the library grid. Restore the library before
            # attempting the next album so the next card is actually actionable.
            back = page.locator("#backToLibraryBtn").first
            if back.count() and back.is_visible():
                back.click()
                page.locator("#musicLibraryView").wait_for(state="visible", timeout=5000)
            else:
                # A fresh navigation is a safe fallback if the page variant has
                # no visible back control.
                _goto(page, base_url)
                _wait_for_album_grid(page)

        status = "PASS" if not failures and checked_tracks == total_tracks else "FAIL"
        summary = (
            f"Verified every Music track in {lang.upper()}: "
            f"{checked_tracks}/{total_tracks} tracks across {len(ALBUM_IDS)} albums."
        )
        return _result(
            f"Music · {lang.upper()} exhaustive tracks",
            status,
            summary,
            failures,
            count=checked_tracks,
            start=start,
        )
    except Exception as exc:
        return _result(
            f"Music · {lang.upper()} exhaustive tracks",
            "FAIL",
            "Exhaustive Music track verification did not finish.",
            [str(exc)[:500]],
            count=checked_tracks,
            start=start,
        )


def _check_player_controls(page, base_url):
    results = []
    start = time.perf_counter()
    try:
        _set_language(page, base_url, "en")
        _wait_for_album_grid(page)
        if not _click_album(page, "ost"):
            return [_result("Music · Player controls", "FAIL", "OST album could not be opened.", start=start)]
        row = page.locator("#albumTrackTable .track-row").first
        row.locator(".col-play-btn").click()
        page.wait_for_timeout(500)
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
            return [_result("Music · Player controls", "FAIL", "Core player controls are missing.", [f"Missing control: {name}" for name in missing], start=start)]

        page.locator("#playBtn").click(); page.wait_for_timeout(100)
        page.locator("#playBtn").click(); page.wait_for_timeout(100)
        page.locator("#prevBtn").click(); page.wait_for_timeout(100)
        page.locator("#nextBtn").click(); page.wait_for_timeout(100)

        shuffle = page.locator("#shuffleBtn")
        before_shuffle = shuffle.get_attribute("class") or ""
        shuffle.click(); page.wait_for_timeout(80)
        after_shuffle = shuffle.get_attribute("class") or ""
        shuffle.click(); page.wait_for_timeout(80)

        repeat = page.locator("#repeatBtn")
        before_repeat = repeat.get_attribute("class") or ""
        repeat.click(); page.wait_for_timeout(80)
        after_repeat = repeat.get_attribute("class") or ""
        repeat.click(); page.wait_for_timeout(80)

        volume = page.locator("#volumeSlider")
        original_volume = volume.input_value()
        target_volume = "35" if original_volume != "35" else "65"
        volume.fill(target_volume)
        volume.dispatch_event("input")

        progress = page.locator("#progressSlider")
        progress.fill("500")
        progress.dispatch_event("input")

        ok = (
            before_shuffle != after_shuffle
            and before_repeat != after_repeat
            and volume.input_value() == target_volume
            and progress.input_value() == "500"
        )
        return [_result(
            "Music · Player controls",
            "PASS" if ok else "FAIL",
            "Core playback controls responded correctly." if ok else "One or more core playback controls did not respond correctly.",
            [] if ok else ["Shuffle/repeat/volume/progress control assertion failed."],
            start=start,
        )]
    except Exception as exc:
        return [_result("Music · Player controls", "FAIL", "Player controls could not be exercised.", [str(exc)[:500]], start=start)]


def run_music_suite(page, base_url):
    """Run exhaustive EN/ES Music track checks, then core player controls."""
    results = []
    for lang in LANGUAGES:
        results.append(_check_language_and_tracks(page, base_url, lang))
    results.extend(_check_player_controls(page, base_url))
    return results


def test_music_page(page, base_url):
    """Backward-compatible entry point for older QA callers."""
    return run_music_suite(page, base_url)
