from __future__ import annotations
import time
from .core import run_check,build,json_check,locale_check,source_integrity,page_basics,routes,js_check,large_assets,accessibility,music_data_check,start_preview,stop_preview
from .browser import run as browser_run
from .performance import run as perf_run
from .models import Result


def _progress(label, status, done, total, elapsed, callback=None):
    if callback:
        callback(label, status, done, total, elapsed)


def run(mode='full', no_build=False, browser_url=None, screenshots=False, progress_callback=None):
    start = time.perf_counter()
    rs = []
    proc = None
    url = browser_url

    steps = []
    if mode in {'full', 'static', 'pages'}:
        steps += [('Build', lambda: run_check('Build', 'Build', build) if not no_build else Result('Build','Build','SKIP','Build skipped by --no-build.',count=1))]
        steps += [
            ('Content files', lambda: run_check('Data','Content files',json_check)),
            ('Translations', lambda: run_check('Data','Translations',locale_check)),
            ('Music data', lambda: run_check('Music','Music data',music_data_check)),
            ('Expected pages', lambda: run_check('Pages','Expected pages',routes)),
        ]
        if mode != 'pages':
            steps += [
                ('Links', lambda: run_check('Links','Links',lambda:source_integrity()[0])),
                ('Missing files', lambda: run_check('Links','Missing files',lambda:source_integrity()[1])),
                ('Image descriptions', lambda: run_check('Accessibility','Image descriptions',lambda:source_integrity()[2])),
                ('Duplicate IDs', lambda: run_check('Links','Duplicate IDs',lambda:source_integrity()[3])),
                ('Page anchors', lambda: run_check('Links','Page anchors',lambda:source_integrity()[4])),
                ('Page basics', lambda: run_check('Pages','Page basics',page_basics)),
                ('Basic accessibility', lambda: run_check('Accessibility','Basic accessibility',accessibility)),
                ('Large files', lambda: run_check('Links','Large files',large_assets)),
                ('JavaScript syntax', lambda: run_check('JavaScript','JavaScript syntax',js_check)),
            ]

    total = len(steps)
    done = 0
    for label, fn in steps:
        _progress(label, 'RUN', done, total, time.perf_counter()-start, progress_callback)
        result = fn()
        rs.append(result)
        done += 1
        _progress(label, result.status, done, total, time.perf_counter()-start, progress_callback)

    if mode in {'full','browser','perf'}:
        if not url:
            _progress('Starting production preview', 'RUN', done, total + 1, time.perf_counter()-start, progress_callback)
            proc, url, error = start_preview()
            if error:
                rs.append(Result('Preview','Production preview','FAIL','Could not start `npm run preview`.',error.splitlines()[-8:],severity='critical'))
            else:
                rs.append(Result('Preview','Production preview','PASS',f'Site is ready at {url}',count=1))
            done += 1
            _progress('Starting production preview', rs[-1].status, done, total + 1, time.perf_counter()-start, progress_callback)

        if url and mode in {'full','browser'}:
            browser_results = browser_run(url, screenshots, progress_callback=progress_callback)
            rs.extend(browser_results)

        if url and mode in {'full','perf'}:
            _progress('Performance checks', 'RUN', done, max(total + 1, done + 1), time.perf_counter()-start, progress_callback)
            perf_results = perf_run(url)
            rs.extend(perf_results)
            done += 1
            status = 'FAIL' if any(r.status == 'FAIL' for r in perf_results) else 'PASS'
            _progress('Performance checks', status, done, max(total + 1, done), time.perf_counter()-start, progress_callback)

        if proc:
            stop_preview(proc)
            rs.append(Result('Preview','Clean up','PASS','Preview server was stopped.',count=1))

    return rs, time.perf_counter() - start
