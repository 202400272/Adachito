"""
V8 user-facing workflow helpers.
Optional components are skipped; broken existing components fail.
"""
def _find(page, selectors):
    for selector in selectors:
        try:
            loc = page.locator(selector)
            if loc.count() > 0:
                return loc.first
        except Exception:
            pass
    return None

def homepage(page, base_url):
    page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
    results = [("navigation links are present", page.locator("a[href]").count() > 0)]
    loc = _find(page, [
        "details",
        "button:has-text('What is Adachi to Shimamura')",
        "[aria-expanded]"
    ])
    if loc:
        try:
            loc.click(timeout=1500)
            results.append(("homepage expandable section responds", True))
        except Exception:
            results.append(("homepage expandable section responds", False))
    return results

def search(page, base_url, term="Adachi"):
    page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
    loc = _find(page, [
        "input[type='search']",
        "input[placeholder*='search' i]",
        "input[aria-label*='search' i]"
    ])
    if not loc:
        return None  # optional component
    try:
        loc.fill(term)
        page.wait_for_timeout(250)
        return [("search accepts text", True)]
    except Exception:
        return [("search accepts text", False)]

def reader_controls(page):
    found = 0
    results = []
    for label in ["Next", "Previous", "Next Page", "Previous Page"]:
        loc = _find(page, [
            f"button:has-text('{label}')",
            f"a:has-text('{label}')",
            f"[aria-label*='{label}' i]"
        ])
        if loc:
            found += 1
            try:
                results.append((f"{label} control is visible", loc.is_visible()))
            except Exception:
                results.append((f"{label} control is visible", False))
    return results if found else None

def language_control(page):
    loc = _find(page, [
        "select",
        "[aria-label*='language' i]",
        "[data-language]"
    ])
    if not loc:
        return None
    try:
        return [("language control is visible", loc.is_visible())]
    except Exception:
        return [("language control is visible", False)]
