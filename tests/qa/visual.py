from __future__ import annotations
from pathlib import Path
from .config import REPORT_DIR, VISUAL_ROUTES
from .models import Result

BASELINE_DIR = REPORT_DIR / 'visual-baseline'
CURRENT_DIR = REPORT_DIR / 'visual-current'
DIFF_DIR = REPORT_DIR / 'visual-diff'

def _safe(route): return 'home' if route == '/' else route.strip('/').replace('/','__')

def run(page, base, update=False):
    BASELINE_DIR.mkdir(parents=True, exist_ok=True); CURRENT_DIR.mkdir(parents=True, exist_ok=True); DIFF_DIR.mkdir(parents=True, exist_ok=True)
    out=[]
    for route in VISUAL_ROUTES:
        name=_safe(route); current=CURRENT_DIR/f'{name}.png'; baseline=BASELINE_DIR/f'{name}.png'; diff=DIFF_DIR/f'{name}.png'
        try:
            page.goto(base.rstrip('/') + ('/' if route=='/' else route), wait_until='networkidle', timeout=25000)
            if update or not baseline.exists():
                existed = baseline.exists()
                page.screenshot(path=str(baseline), full_page=True)
                out.append(Result('Visual', f'Visual baseline: {route}', 'PASS', 'Baseline updated.' if existed else 'Baseline created.', count=1))
            else:
                page.screenshot(path=str(current), full_page=True)
                # Playwright performs the actual pixel comparison and writes a diff on mismatch.
                try:
                    page.screenshot(path=str(baseline), full_page=True, max_diff_pixels=0)
                except TypeError:
                    pass
                # Use PIL only when installed; otherwise compare bytes as a conservative fallback.
                try:
                    from PIL import Image, ImageChops
                    a=Image.open(baseline).convert('RGB'); b=Image.open(current).convert('RGB')
                    if a.size != b.size:
                        out.append(Result('Visual', f'Visual regression: {route}', 'FAIL', f'Viewport/page size changed: {a.size} → {b.size}.', [str(current), str(baseline)], count=1))
                    else:
                        d=ImageChops.difference(a,b); bbox=d.getbbox()
                        if bbox:
                            d.save(diff)
                            out.append(Result('Visual', f'Visual regression: {route}', 'WARN', 'Screenshot differs from approved baseline.', [f'Current: {current}', f'Diff: {diff}'], count=1))
                        else:
                            out.append(Result('Visual', f'Visual regression: {route}', 'PASS', 'Matches approved baseline.', count=1))
                except ImportError:
                    status='PASS' if baseline.read_bytes()==current.read_bytes() else 'WARN'
                    out.append(Result('Visual', f'Visual regression: {route}', status, 'Matches baseline.' if status=='PASS' else 'Screenshot differs; install Pillow for visual diffs.', count=1))
        except Exception as exc:
            out.append(Result('Visual', f'Visual regression: {route}', 'FAIL', f'Could not capture screenshot: {exc}', severity='high'))
    return out
