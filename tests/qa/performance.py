from __future__ import annotations
from .models import Result

def run(url):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:return [Result('Speed','Homepage speed','SKIP','Playwright is not installed.')]
    with sync_playwright() as pw:
        try:b=pw.chromium.launch(headless=True)
        except Exception as e:return [Result('Speed','Homepage speed','SKIP','Chromium could not start.',[str(e)[:180]])]
        p=b.new_page(viewport={'width':1440,'height':900})
        try:
            p.goto(url,wait_until='load',timeout=30000)
            m=p.evaluate('''() => { const n=performance.getEntriesByType('navigation')[0]; const paints=performance.getEntriesByType('paint'); const f=paints.find(x=>x.name==='first-contentful-paint'); return {fcp:f?f.startTime:null,load:n?n.loadEventEnd-n.startTime:null,dom:n?n.domContentLoadedEventEnd-n.startTime:null,transfer:n?n.transferSize:null}; }''')
            problems=[]
            if m.get('fcp') is not None and m['fcp']>2000:problems.append(f"First useful content took {m['fcp']:.0f}ms (target: under 2000ms).")
            if m.get('load') is not None and m['load']>5000:problems.append(f"Page load took {m['load']:.0f}ms (target: under 5000ms).")
            s=f"First content {m.get('fcp'):.0f}ms" if m.get('fcp') is not None else 'First content unavailable'
            if m.get('load') is not None:s+=f" · page load {m['load']:.0f}ms"
            if m.get('transfer') is not None:s+=f" · transfer {m['transfer']/1024:.0f} KiB"
            return [Result('Speed','Homepage speed','FAIL' if problems else 'PASS',s,problems,1)]
        finally:b.close()
