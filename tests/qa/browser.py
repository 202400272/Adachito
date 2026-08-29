from __future__ import annotations
from .music import run_music_suite
from .models import Result
from .config import REPORT_DIR
from .workflows.browser import smoke, accordion, mobile_menu, search_suite, reader_controls, navigation_smoke, user_journeys


def _notify(callback, label, status, done, total, elapsed=0):
    if callback:
        callback(label, status, done, total, elapsed)


def run(url, screenshots=False, progress_callback=None):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return [Result('Browser','Browser tests','SKIP','Playwright is not installed. Run `pip install -r tests/requirements.txt`.')]

    out=[]
    REPORT_DIR.mkdir(exist_ok=True)
    browser_steps = 26
    done = 0

    with sync_playwright() as pw:
        try:
            browser=pw.chromium.launch(headless=True)
        except Exception as e:
            return [Result('Browser','Browser tests','SKIP','Chromium could not start.',[str(e)[:200],'Run: python -m playwright install chromium'])]

        for w,h,label in ((1440,900,'Desktop'),(390,844,'Mobile')):
            ctx=browser.new_context(viewport={'width':w,'height':h})
            page=ctx.new_page()
            try:
                _notify(progress_callback, f'{label}: opening all pages', 'RUN', done, browser_steps)
                result = smoke(page,url,label=='Mobile')
                out.append(result); done += 1
                _notify(progress_callback, f'{label}: opening all pages', result.status, done, browser_steps)

                if label=='Desktop':
                    for name, fn in [
                        ('Desktop: navigation links', lambda: navigation_smoke(page,url)),
                        ('Desktop: homepage explanation', lambda: accordion(page,url)),
                    ]:
                        _notify(progress_callback,name,'RUN',done,browser_steps)
                        result=fn(); out.append(result); done += 1
                        _notify(progress_callback,name,result.status,done,browser_steps)

                    for result in search_suite(page,url):
                        done += 1; out.append(result)
                        _notify(progress_callback,result.name,result.status,done,browser_steps)

                    for name, route, label_text in [
                        ('Desktop: novel reader','/Adashima_Novelas','Novel reader'),
                        ('Desktop: manga reader','/Adashima_Manga','Manga reader'),
                    ]:
                        _notify(progress_callback,name,'RUN',done,browser_steps)
                        result=reader_controls(page,url,route,label_text); out.append(result); done += 1
                        _notify(progress_callback,name,result.status,done,browser_steps)

                    for result in user_journeys(page, url):
                        out.append(result); done += 1
                        _notify(progress_callback,result.name,result.status,done,browser_steps)

                    _notify(progress_callback,'Desktop: Music page suite','RUN',done,browser_steps)
                    music_results = run_music_suite(page,url)
                    for result in music_results:
                        out.append(result); done += 1
                        _notify(progress_callback,result.name,result.status,done,browser_steps)

                else:
                    _notify(progress_callback,'Mobile: menu interaction','RUN',done,browser_steps)
                    result=mobile_menu(page,url); out.append(result); done += 1
                    _notify(progress_callback,'Mobile: menu interaction',result.status,done,browser_steps)

                if screenshots and any(r.status=='FAIL' for r in out[-12:]):
                    path=REPORT_DIR/f'failure-{label.lower()}.png'
                    page.screenshot(path=str(path),full_page=True)
            finally:
                ctx.close()
        browser.close()
    return out


def run_v8_workflows(page, base_url):
    from .workflows import homepage, search, reader_controls, language_control
    results = {"Homepage": homepage(page, base_url)}
    s = search(page, base_url)
    results["Search"] = s if s is not None else [("optional search component", None)]
    r = reader_controls(page)
    results["Reader controls"] = r if r is not None else [("optional reader controls", None)]
    l = language_control(page)
    results["Language control"] = l if l is not None else [("optional language control", None)]
    return results


def run_v9_music_test(page, base_url):
    return run_music_suite(page, base_url)
