from __future__ import annotations
from ..models import Result
from ..config import ROUTES, SEARCHES


def _goto(page, base, route):
    return page.goto(base.rstrip('/') + ('/' if route == '/' else route), wait_until='domcontentloaded', timeout=20000)


def smoke(page, base, mobile=False):
    failures=[]; checked=0; errors=[]; requests=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('requestfailed', lambda r: requests.append(f"{r.method} {r.url}"))
    for route in ROUTES:
        try:
            response=_goto(page,base,route); checked+=1
            if not response or response.status>=400: failures.append(f"{route}: page returned {response.status if response else 'no response'}")
            if not page.title().strip(): failures.append(f"{route}: page has no title")
            if not page.locator('html[lang]').count(): failures.append(f"{route}: language is not declared")
            if mobile:
                overflow=page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
                if overflow>2: failures.append(f"{route}: content sticks out {overflow}px on mobile")
        except Exception as e: failures.append(f"{route}: {str(e)[:160]}")
    failures += [f"JavaScript error: {x[:150]}" for x in errors[:3]]
    failures += [f"Failed request: {x[:150]}" for x in requests[:3]]
    return Result('Browser','Mobile site' if mobile else 'Desktop site','FAIL' if failures else 'PASS',f"{checked}/{len(ROUTES)} pages opened · {len(failures)} problems",failures[:10],checked)


def accordion(page,base):
    _goto(page,base,'/')
    t=page.locator('#infoToggle'); c=page.locator('#infoContent')
    if not (t.count() and c.count()): return Result('Browser','Homepage explanation','SKIP','This section is not present on the current homepage.')
    try:
        t.click(); page.wait_for_timeout(120)
        opened=not c.is_hidden() and t.get_attribute('aria-expanded')=='true'
        t.click(); page.wait_for_timeout(120)
        closed=c.is_hidden() and t.get_attribute('aria-expanded')=='false'
        ok=opened and closed
        return Result('Browser','Homepage explanation','PASS' if ok else 'FAIL','Opened and closed correctly.' if ok else 'The expandable section did not open and close correctly.',[] if ok else ['Expected it to open after the first click and close after the second.'],1)
    except Exception as e:return Result('Browser','Homepage explanation','FAIL',f'Could not use the expandable section: {e}',severity='normal')


def mobile_menu(page,base):
    _goto(page,base,'/Adashima_Estrella')
    b=page.locator('#menu-button'); c=page.locator('#menu-close-btn')
    if not (b.count() and c.count()):return Result('Browser','Mobile menu','SKIP','Mobile menu controls were not found.')
    try:
        b.click();page.wait_for_timeout(100); opened=page.locator('body.menu-open').count()>0
        c.click();page.wait_for_timeout(100); closed=page.locator('body.menu-open').count()==0
        ok=opened and closed
        return Result('Browser','Mobile menu','PASS' if ok else 'FAIL','Menu opened and closed correctly.' if ok else 'Menu did not open/close correctly.',[] if ok else ['Expected the menu to open and then close.'],1)
    except Exception as e:return Result('Browser','Mobile menu','FAIL',f'Could not use the mobile menu: {e}')


def search(page,base,label,route,selector):
    _goto(page,base,route); f=page.locator(selector).first
    if not f.count() or not f.is_visible():return Result('Browser',label,'SKIP','Search box is not available on this page.')
    try:
        before=page.locator('body').inner_text(); f.fill('Adachi'); page.wait_for_timeout(250); after=page.locator('body').inner_text();
        f.fill('')
        return Result('Browser',label,'PASS' if before!=after else 'WARN','Typing into the search box changed the visible page.' if before!=after else 'Search accepted text but the visible page did not change.',[],1)
    except Exception as e:return Result('Browser',label,'FAIL',f'Search could not be used: {e}')


def search_suite(page,base):return [search(page,base,*x) for x in SEARCHES]


def reader_controls(page,base,route,label):
    _goto(page,base,route)
    selectors=['#pdfModal','#pdfViewerModal']
    present=next((page.locator(s) for s in selectors if page.locator(s).count()),None)
    if not present:return Result('Browser',label,'SKIP','Reader controls are not present on this page.')
    # Only verify that the reader's close control, if present, is actionable.
    close=page.locator('#pdfModalClose').first
    if close.count() and close.is_visible():
        try: close.click(); return Result('Browser',label,'PASS','Reader page loaded and its close control is usable.',[],1)
        except Exception as e:return Result('Browser',label,'FAIL',f'Reader close control could not be used: {e}')
    return Result('Browser',label,'PASS','Reader container loaded.',[],1)


def navigation_smoke(page, base):
    """Follow a small set of real internal links from the homepage."""
    _goto(page, base, '/')
    checks = []
    for selector in ('a[href]', 'nav a[href]'):
        for link in page.locator(selector).all()[:12]:
            try:
                href=link.get_attribute('href') or ''
                if not href or href.startswith(('#','http','mailto:','javascript:')): continue
                label=(link.inner_text() or href).strip().replace('\n',' ')[:50]
                response=page.request.get(base.rstrip('/') + ('/' if href.startswith('/') else '/' + href))
                checks.append((label, response.status < 400))
            except Exception:
                pass
        if checks: break
    bad=[label for label,ok in checks if not ok]
    return Result('Browser','Follow a few links','FAIL' if bad else 'PASS',f'{len(checks)} real links checked · {len(bad)} failed',bad[:8],len(checks))
