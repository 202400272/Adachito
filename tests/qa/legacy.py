#!/usr/bin/env python3
"""AdashimaVerse QA v5.

Production-preview QA with static integrity checks, functional browser flows,
responsive checks, lightweight performance budgets, and Rich reporting.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
DIST = ROOT / "dist"
ASSETS = ROOT / "assets"
REPORT_DIR = ROOT / ".qa"

EXPECTED_ROUTES = {
    "/": ROOT / "index.html",
    "/Adashima_About": SRC / "pages/Adashima_About.html",
    "/Adashima_Help": SRC / "pages/Adashima_Help.html",
    "/Adashima_Anime": SRC / "pages/Adashima_Anime.html",
    "/Adashima_Drama": SRC / "pages/Adashima_Drama.html",
    "/Adashima_Estrella": SRC / "pages/Adashima_Estrella.html",
    "/Adashima_Extra_Stories": SRC / "pages/Adashima_Extra_Stories.html",
    "/Adashima_Gallery": SRC / "pages/Adashima_Gallery.html",
    "/Adashima_Linea": SRC / "pages/Adashima_Linea.html",
    "/Adashima_Manga": SRC / "pages/Adashima_Manga.html",
    "/Adashima_Music": SRC / "pages/Adashima_Music.html",
    "/Adashima_Novelas": SRC / "pages/Adashima_Novelas.html",
    "/Adashima_Otros": SRC / "pages/Adashima_Otros.html",
    "/Adashima_Stats": SRC / "pages/Adashima_Stats.html",
    "/Juego": SRC / "pages/Juego.html",
    "/otros/Author_Archive": SRC / "pages/otros/Author_Archive.html",
}
IGNORE_SCHEMES = {"http", "https", "mailto", "tel", "javascript", "data", "blob"}
LOCALES = ("en", "es", "tg")

@dataclass
class Result:
    category: str
    name: str
    status: str
    summary: str = ""
    details: list[str] = field(default_factory=list)
    count: int = 0
    duration: float = 0.0


def result(status, summary="", details=None, count=0):
    return Result("", "", status, summary, details or [], count)


def timed(fn, category, name):
    started = time.perf_counter()
    try:
        r = fn()
    except Exception as exc:
        r = result("FAIL", f"Unexpected error: {exc}")
    r.category, r.name, r.duration = category, name, time.perf_counter() - started
    return r


class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.resources = []
        self.images_without_alt = []
        self.ids = set()
        self.duplicate_ids = []
        self.inputs = []
        self.buttons = []
        self.headings = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        ident = d.get("id")
        if ident:
            if ident in self.ids:
                self.duplicate_ids.append(ident)
            self.ids.add(ident)
        if tag == "a" and d.get("href"):
            self.links.append(d["href"])
        for key in ("src", "href", "poster"):
            if d.get(key):
                self.resources.append(d[key])
        if tag == "img" and "alt" not in d:
            self.images_without_alt.append(d.get("src", "<inline image>"))
        if tag == "button":
            self.buttons.append(d)
        if tag == "input":
            self.inputs.append(d)
        if tag in {"h1", "h2", "h3"}:
            self.headings.append(tag)


def html_files(base):
    return sorted(p for p in base.rglob("*.html") if p.is_file())


def parse(path):
    parser = Collector()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser


def is_external(value):
    return urlsplit(value).scheme.lower() in IGNORE_SCHEMES or value.startswith("//")


def candidate_paths(href, source):
    href = unquote(href.split("?", 1)[0].split("#", 1)[0])
    if not href or is_external(href):
        return []
    if href.startswith("/"):
        raw = href.lstrip("/")
        return [ROOT / raw, DIST / raw]
    return [source.parent / href, ROOT / href, DIST / href.lstrip("/")]


def resource_exists(href, source):
    clean = href.split("#", 1)[0].split("?", 1)[0]
    if is_external(href) or href.startswith("#"):
        return True
    if clean in EXPECTED_ROUTES:
        return EXPECTED_ROUTES[clean].is_file()
    for candidate in candidate_paths(clean, source):
        if candidate.is_file():
            return True
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return True
    return False


def find_npm():
    candidates = ["npm.cmd", "npm.exe", "npm"] if os.name == "nt" else ["npm"]
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    return None


def test_build():
    if not (ROOT / "package.json").exists():
        return result("FAIL", "package.json not found")
    npm = find_npm()
    if not npm:
        return result("FAIL", "npm could not be found. Try `npm -v` in this terminal, then restart it if needed.")
    p = subprocess.run([npm, "run", "build"], cwd=ROOT, text=True,
                       capture_output=True, timeout=180)
    if p.returncode:
        return result("FAIL", "npm run build failed",
                      (p.stdout + "\n" + p.stderr).splitlines()[-15:])
    if not DIST.exists():
        return result("FAIL", "Build reported success but dist/ was not created")
    return result("PASS", "Build completed and dist/ exists", count=1)


def test_json():
    files = list(SRC.rglob("*.json"))
    bad = []
    for path in files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            bad.append(f"{path.relative_to(ROOT)} — {exc}")
    return result("FAIL" if bad else "PASS",
                  f"{len(files)} JSON files; {len(bad)} invalid", bad[:12], len(files))


def shape(value, path=""):
    """Return a structural signature without comparing localized values."""
    if isinstance(value, dict):
        return {k: shape(v, f"{path}.{k}".strip(".")) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [shape(value[0], path + "[]")] if value else []
    return type(value).__name__


def test_locale_consistency():
    groups = {}
    for path in SRC.rglob("*.json"):
        if path.parent.name in LOCALES:
            key = path.relative_to(SRC).parent
            groups.setdefault(str(key), {})[path.parent.name] = path
    mismatches = []
    compared = 0
    for group, variants in groups.items():
        if len(variants) < 2:
            continue
        loaded = {}
        for lang, path in variants.items():
            try:
                loaded[lang] = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
        if len(loaded) < 2:
            continue
        compared += 1
        base_lang = sorted(loaded)[0]
        base_shape = shape(loaded[base_lang])
        for lang, value in loaded.items():
            if lang != base_lang and shape(value) != base_shape:
                mismatches.append(f"{group}: {base_lang} vs {lang} structure differs")
    status = "WARN" if mismatches else "PASS"
    return result(status, f"{compared} locale groups compared; {len(mismatches)} structural differences",
                  mismatches[:12], compared)


def test_routes():
    missing = [r for r, p in EXPECTED_ROUTES.items() if not p.is_file()]
    dist_missing = []
    if DIST.exists():
        for route in EXPECTED_ROUTES:
            route_name = route.strip("/")
            if not route_name:
                ok = (DIST / "index.html").is_file()
            else:
                ok = any((DIST / candidate).is_file() for candidate in (
                    f"{route_name}.html", f"{route_name}/index.html", f"src/pages/{route_name}.html"
                ))
            if not ok:
                dist_missing.append(route)
    bad = missing + dist_missing
    return result("FAIL" if bad else "PASS",
                  f"{len(EXPECTED_ROUTES)} routes; {len(bad)} missing", [f"Missing: {x}" for x in bad[:20]],
                  len(EXPECTED_ROUTES))


def test_source_integrity():
    pages = [ROOT / "index.html"] + html_files(SRC / "pages")
    broken_links, broken_assets, missing_alt, duplicate_ids = [], [], [], []
    anchor_count = 0
    for page in pages:
        parser = parse(page)
        for href in parser.links:
            if href.startswith("#"):
                anchor_count += 1
                if href[1:] and href[1:] not in parser.ids:
                    broken_links.append(f"{page.relative_to(ROOT)} → #{href[1:]}")
            elif not resource_exists(href, page):
                broken_links.append(f"{page.relative_to(ROOT)} → {href}")
        for resource in parser.resources:
            if is_external(resource) or resource.startswith("#"):
                continue
            if not resource_exists(resource, page):
                broken_assets.append(f"{page.relative_to(ROOT)} → {resource}")
        missing_alt += [f"{page.relative_to(ROOT)} → {x}" for x in parser.images_without_alt]
        duplicate_ids += [f"{page.relative_to(ROOT)} → #{x}" for x in parser.duplicate_ids]
    return [
        result("FAIL" if broken_links else "PASS", f"{len(pages)} pages; {len(broken_links)} broken links",
               broken_links[:12], len(broken_links)),
        result("FAIL" if broken_assets else "PASS", f"{len(pages)} pages; {len(broken_assets)} missing local assets",
               broken_assets[:12], len(broken_assets)),
        result("FAIL" if missing_alt else "PASS", f"{len(pages)} pages; {len(missing_alt)} images missing alt",
               missing_alt[:12], len(missing_alt)),
        result("FAIL" if duplicate_ids else "PASS", f"{len(pages)} pages; {len(duplicate_ids)} duplicate IDs",
               duplicate_ids[:12], len(duplicate_ids)),
        result("PASS", f"{anchor_count} local anchors inspected", count=anchor_count),
    ]


def test_accessibility_basics():
    pages = [ROOT / "index.html"] + html_files(SRC / "pages")
    issues = []
    checked = 0
    for page in pages:
        parser = parse(page)
        checked += 1
        for button in parser.buttons:
            has_name = bool(button.get("aria-label") or button.get("title") or button.get("value"))
            # Static parser cannot see button text, so only flag icon-only buttons that have no name.
            if not has_name and button.get("type") != "submit":
                # Avoid over-reporting ordinary text buttons; only class/id names strongly suggest icon-only controls.
                hint = f"{button.get('id','')} {button.get('class','')}".lower()
                if any(word in hint for word in ("icon", "close", "prev", "next", "menu", "search", "zoom")):
                    issues.append(f"{page.relative_to(ROOT)} → button #{button.get('id','<no-id>')} has no accessible name")
        for inp in parser.inputs:
            typ = (inp.get("type") or "text").lower()
            if typ in {"hidden", "submit", "button", "reset", "checkbox", "radio"}:
                continue
            if not (inp.get("aria-label") or inp.get("aria-labelledby") or inp.get("placeholder")):
                issues.append(f"{page.relative_to(ROOT)} → input #{inp.get('id','<no-id>')} has no label/placeholder")
    return result("WARN" if issues else "PASS",
                  f"{checked} pages inspected; {len(issues)} basic accessibility findings", issues[:12], checked)


def test_html():
    pages = [ROOT / "index.html"] + html_files(SRC / "pages")
    issues = []
    for path in pages:
        text = path.read_text(encoding="utf-8", errors="replace")
        low = text.lower()
        rel = str(path.relative_to(ROOT))
        if "<!doctype html>" not in low:
            issues.append(f"{rel}: missing doctype")
        if "<title" not in low:
            issues.append(f"{rel}: missing title")
        if 'name="viewport"' not in low:
            issues.append(f"{rel}: missing viewport")
        if not re.search(r"<html\b[^>]*\blang=", text, re.I):
            issues.append(f"{rel}: missing html[lang]")
    return result("FAIL" if issues else "PASS", f"{len(pages)} pages; {len(issues)} structural issues",
                  issues[:12], len(pages))


def test_assets():
    files = [p for p in ASSETS.rglob("*") if p.is_file()] if ASSETS.exists() else []
    heavy = sorted([p for p in files if p.stat().st_size >= 5 * 1024 * 1024],
                   key=lambda p: p.stat().st_size, reverse=True)
    details = [f"{p.relative_to(ROOT)} — {p.stat().st_size / 1024 / 1024:.1f} MiB" for p in heavy[:10]]
    return result("WARN" if heavy else "PASS", f"{len(files)} assets; {len(heavy)} ≥ 5 MiB", details, len(files))


def test_js():
    files = list(SRC.rglob("*.js")) + list(SRC.rglob("*.mjs"))
    bad = []
    node = shutil.which("node")
    if not node:
        return result("SKIP", "Node.js not found; JS syntax check skipped", count=len(files))
    for path in files:
        try:
            proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True, timeout=10)
            if proc.returncode:
                last = (proc.stderr or proc.stdout).strip().splitlines()
                bad.append(f"{path.relative_to(ROOT)} — {last[-1] if last else 'syntax error'}")
        except Exception as exc:
            bad.append(f"{path.relative_to(ROOT)} — {exc}")
    return result("FAIL" if bad else "PASS", f"{len(files)} JS files; {len(bad)} syntax errors", bad[:10], len(files))


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def check_server(base_url):
    try:
        request = urllib.request.Request(base_url, method="HEAD", headers={"User-Agent": "AdashimaVerse-QA/5"})
        with urllib.request.urlopen(request, timeout=5) as response:
            return True, f"HTTP {response.status}"
    except urllib.error.HTTPError as exc:
        return True, f"HTTP {exc.code}"
    except Exception as exc:
        return False, str(getattr(exc, "reason", exc))


def stop_preview(proc):
    if not proc:
        return
    try:
        if proc.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, timeout=10)
        else:
            import signal
            os.killpg(proc.pid, signal.SIGTERM)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def start_preview():
    npm = find_npm()
    if not npm:
        return None, None, "npm could not be found by Python. On Windows, QA looks for npm.cmd. Run `npm -v` in this terminal to verify Node.js is on PATH."
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/"
    cmd = [npm, "run", "preview", "--", "--host", "127.0.0.1", "--port", str(port), "--strictPort"]
    try:
        kwargs = dict(cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                      text=True, encoding="utf-8", errors="replace", bufsize=1)
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        proc = subprocess.Popen(cmd, **kwargs)
    except Exception as exc:
        return None, None, f"Could not start npm run preview: {exc}"
    deadline = time.monotonic() + 30
    output = []
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            if proc.stdout:
                output = proc.stdout.read().splitlines()
            return None, None, f"Preview exited with code {proc.returncode}.\n" + "\n".join(output[-8:])
        ok, _ = check_server(url)
        if ok:
            return proc, url, None
        time.sleep(0.25)
    stop_preview(proc)
    try:
        if proc.stdout:
            output = proc.stdout.read().splitlines()
    except Exception:
        pass
    return None, None, "Preview did not become ready within 30 seconds.\n" + "\n".join(output[-8:])


def browser_targets():
    return list(EXPECTED_ROUTES.keys())


def run_browser(base_url, screenshots=False):
    if not check_server(base_url)[0]:
        return [result("FAIL", f"Server unavailable: {base_url}",
                       ["Start with npm run dev, or let QA manage npm run preview."])]
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
    except ImportError:
        return [result("SKIP", "Playwright is not installed", ["pip install -r tests/requirements.txt"])]

    results = []
    REPORT_DIR.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(headless=True)
        except Exception as exc:
            return [result("SKIP", "Chromium could not launch", [str(exc)[:220], "python -m playwright install chromium"])]

        for width, height, label in ((1440, 900, "Desktop"), (390, 844, "Mobile")):
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
            console_errors, network_errors, page_errors = [], [], []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.on("requestfailed", lambda req: network_errors.append(f"{req.method} {req.url}"))
            route_failures = []
            checked = 0
            try:
                for route in browser_targets():
                    target = base_url.rstrip("/") + (route if route != "/" else "/")
                    try:
                        response = page.goto(target, wait_until="domcontentloaded", timeout=20000)
                        checked += 1
                        if not response or response.status >= 400:
                            route_failures.append(f"{route}: HTTP {response.status if response else 'no response'}")
                            continue
                        if not page.title().strip():
                            route_failures.append(f"{route}: missing title")
                        if not page.locator("html[lang]").count():
                            route_failures.append(f"{route}: missing html[lang]")
                        # Basic responsive invariant: page content must not overflow viewport horizontally.
                        if label == "Mobile":
                            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                            if overflow > 2:
                                route_failures.append(f"{route}: horizontal overflow {overflow}px")
                    except PlaywrightTimeout:
                        route_failures.append(f"{route}: navigation timeout")
                    except Exception as exc:
                        route_failures.append(f"{route}: {str(exc)[:180]}")

                flow_failures = []
                if label == "Desktop":
                    flow_failures += functional_home(page, base_url)
                    flow_failures += functional_searches(page, base_url)
                else:
                    flow_failures += functional_mobile_menu(page, base_url)
                    flow_failures += functional_searches(page, base_url, mobile=True)

                # Lightweight Web Vitals-style measurements on the homepage.
                perf = measure_performance(page, base_url)
                perf_failures = []
                if perf.get("fcp_ms") is not None and perf["fcp_ms"] > 2000:
                    perf_failures.append(f"FCP {perf['fcp_ms']:.0f}ms > 2000ms budget")
                if perf.get("lcp_ms") is not None and perf["lcp_ms"] > 3000:
                    perf_failures.append(f"LCP {perf['lcp_ms']:.0f}ms > 3000ms budget")

                all_failures = route_failures + flow_failures + perf_failures
                all_runtime_errors = console_errors + page_errors + network_errors
                status = "FAIL" if all_failures or all_runtime_errors else "PASS"
                details = (all_failures +
                           [f"Console: {x[:180]}" for x in console_errors[:2]] +
                           [f"PageError: {x[:180]}" for x in page_errors[:2]] +
                           [f"Network: {x[:180]}" for x in network_errors[:2]])[:14]
                summary = (f"{checked}/{len(EXPECTED_ROUTES)} routes · {len(all_failures)} test failures · "
                           f"{len(console_errors)+len(page_errors)} JS errors · {len(network_errors)} failed requests")
                results.append(Result("Browser", f"{label} regression", status, summary, details, checked))
                results.append(Result("Performance", f"{label} homepage budget",
                                      "FAIL" if perf_failures else "PASS",
                                      performance_summary(perf), perf_failures, 3))

                if screenshots and status == "FAIL":
                    shot = REPORT_DIR / f"failure-{label.lower()}.png"
                    page.screenshot(path=str(shot), full_page=True)
                    results[-2].details.append(f"Screenshot: {shot.relative_to(ROOT)}")
            finally:
                context.close()
        browser.close()
    return results


def goto(page, base_url, route):
    page.goto(base_url.rstrip("/") + (route if route != "/" else "/"),
              wait_until="domcontentloaded", timeout=20000)


def functional_home(page, base_url):
    failures = []
    goto(page, base_url, "/")
    toggle = page.locator("#infoToggle")
    content = page.locator("#infoContent")
    if toggle.count() and content.count():
        toggle.click()
        page.wait_for_timeout(150)
        if content.is_hidden() or toggle.get_attribute("aria-expanded") != "true":
            failures.append("Homepage: About accordion did not open")
        toggle.click()
        page.wait_for_timeout(150)
        if not content.is_hidden() or toggle.get_attribute("aria-expanded") != "false":
            failures.append("Homepage: About accordion did not close")
    else:
        failures.append("Homepage: About accordion controls not found")
    return failures


def functional_mobile_menu(page, base_url):
    failures = []
    goto(page, base_url, "/Adashima_Estrella")
    button = page.locator("#menu-button")
    overlay = page.locator("#menu-overlay")
    close = page.locator("#menu-close-btn")
    if not (button.count() and overlay.count() and close.count()):
        return ["Mobile navigation: expected menu controls not found on Adashima_Estrella"]
    button.click(); page.wait_for_timeout(100)
    if not page.locator("body.menu-open").count():
        failures.append("Mobile navigation: menu did not open")
    close.click(); page.wait_for_timeout(100)
    if page.locator("body.menu-open").count():
        failures.append("Mobile navigation: menu did not close")
    return failures


def exercise_search(page, base_url, route, selector, label):
    try:
        goto(page, base_url, route)
        field = page.locator(selector).first
        if not field.count() or not field.is_visible():
            return []  # Optional component: skip silently.
        before = page.locator("body").inner_text(timeout=3000)
        awaitable = field.fill("Adachi")
        page.wait_for_timeout(250)
        after = page.locator("body").inner_text(timeout=3000)
        if before == after:
            return [f"{label}: search input produced no observable page change"]
        field.fill("")
        return []
    except Exception as exc:
        return [f"{label}: {str(exc)[:180]}"]


def functional_searches(page, base_url, mobile=False):
    failures = []
    failures += exercise_search(page, base_url, "/Adashima_Gallery", "#gallerySearch", "Gallery search")
    failures += exercise_search(page, base_url, "/Adashima_Extra_Stories", "#searchInput", "Extra Stories search")
    failures += exercise_search(page, base_url, "/Adashima_Anime", "#guideSearchInput", "Anime search")
    failures += exercise_search(page, base_url, "/Adashima_Help", "#helpSearch", "Help search")
    return failures


def measure_performance(page, base_url):
    try:
        goto(page, base_url, "/")
        return page.evaluate("""async () => {
          const nav = performance.getEntriesByType('navigation')[0];
          const paints = performance.getEntriesByType('paint');
          const fcp = paints.find(x => x.name === 'first-contentful-paint');
          let lcp = null;
          try {
            lcp = await new Promise(resolve => {
              let last = null;
              const obs = new PerformanceObserver(list => {
                const entries = list.getEntries();
                if (entries.length) last = entries[entries.length - 1].startTime;
              });
              obs.observe({type:'largest-contentful-paint', buffered:true});
              setTimeout(() => { obs.disconnect(); resolve(last); }, 150);
            });
          } catch (_) {}
          return {
            fcp_ms: fcp ? fcp.startTime : null,
            lcp_ms: lcp,
            dom_ms: nav ? nav.domContentLoadedEventEnd : null,
            load_ms: nav ? nav.loadEventEnd : null,
            transfer: nav ? nav.transferSize : null
          };
        }""")
    except Exception:
        return {}


def performance_summary(perf):
    if not perf:
        return "Metrics unavailable"
    bits = []
    for key, label in (("fcp_ms", "FCP"), ("lcp_ms", "LCP"), ("dom_ms", "DOM"), ("load_ms", "Load")):
        if perf.get(key) is not None:
            bits.append(f"{label} {perf[key]:.0f}ms")
    if perf.get("transfer") is not None:
        bits.append(f"transfer {perf['transfer']/1024:.0f}KiB")
    return " · ".join(bits) or "Metrics unavailable"


def score(results):
    weights = {"FAIL": 0, "WARN": 0.65, "SKIP": 0.9, "PASS": 1}
    total = sum(weights.get(r.status, 1) for r in results)
    return round(100 * total / len(results)) if results else 0


def print_report(results, elapsed):
    passed = sum(r.status == "PASS" for r in results)
    failed = sum(r.status == "FAIL" for r in results)
    warned = sum(r.status == "WARN" for r in results)
    skipped = sum(r.status == "SKIP" for r in results)
    assertions = sum(r.count for r in results)
    quality = score(results)

    if not RICH_AVAILABLE:
        print("Rich is not installed. Run: pip install -r tests/requirements.txt")
        print(f"RESULT: {'FAILED' if failed else 'PASSED'} | tests={len(results)} | items={assertions} | {elapsed:.2f}s")
        return

    console = Console()
    console.print(Panel.fit(
        "[bold]ADASHIMAVERSE QA v5[/bold]\n[dim]Production preview · integrity · functional regression · responsive · performance[/dim]",
        border_style="cyan"))

    current = None
    for r in results:
        if r.category != current:
            current = r.category
            console.print(f"\n[bold cyan]{current.upper()}[/bold cyan]")
        table = Table(box=None, padding=(0, 1), show_header=False)
        table.add_column("status", width=8)
        table.add_column("name", min_width=28)
        table.add_column("summary", ratio=1)
        table.add_column("time", width=7, justify="right")
        color = {"PASS":"green","FAIL":"red","WARN":"yellow","SKIP":"dim"}[r.status]
        icon = {"PASS":"✓","FAIL":"✗","WARN":"!","SKIP":"–"}[r.status]
        table.add_row(f"[{color}]{icon} {r.status}[/{color}]", r.name, r.summary, f"{r.duration:.2f}s")
        console.print(table)
        if r.details and r.status in {"FAIL", "WARN"}:
            for detail in r.details[:6]:
                console.print(f"    [dim]•[/dim] [{color}]{detail}[/{color}]")

    stats = Table(title="Statistics", box=None, show_header=False)
    stats.add_column("Metric", style="bold")
    stats.add_column("Value", justify="right")
    for key, value in (
        ("Quality score", f"{quality}/100"),
        ("QA tests", f"{len(results):,}"),
        ("Items / assertions", f"{assertions:,}"),
        ("Passed", f"[green]{passed:,}[/green]"),
        ("Failed", f"[red]{failed:,}[/red]"),
        ("Warnings", f"[yellow]{warned:,}[/yellow]"),
        ("Skipped", f"[dim]{skipped:,}[/dim]"),
        ("Runtime", f"{elapsed:.2f}s"),
    ):
        stats.add_row(key, value)
    console.print("\n", stats)
    if failed:
        console.print(Panel(f"[bold red]✗ FAILED[/bold red]  {failed} test(s) need attention.", border_style="red"))
    elif warned:
        console.print(Panel(f"[bold yellow]! PASSED WITH WARNINGS[/bold yellow]  {warned} warning(s) to review.", border_style="yellow"))
    else:
        console.print(Panel("[bold green]✓ ALL CHECKS PASSED[/bold green]", border_style="green"))
