from __future__ import annotations
from pathlib import Path
from bs4 import BeautifulSoup
from .config import DIST


def _page_path(route):
    route=route.split('#',1)[0].split('?',1)[0]
    if not route or route=='/': return 'index.html'
    route=route.lstrip('/')
    if route in {'privacy', 'terms'}:
        return f'src/pages/{route.capitalize()}.html'
    if route.startswith('Adashima_'):
        return f'src/pages/{route}.html'
    if route.startswith('otros/'):
        return f'src/pages/{route}.html'
    if route == 'Juego':
        return 'src/pages/Juego.html'
    if route.endswith('.html'): return route
    return f'{route}.html'


def orphan_pages():
    if not DIST.exists(): return 'SKIP','Production output does not exist.',[],0
    # Components such as src/components/footer.html are runtime fragments, not
    # standalone pages. Only inspect the actual generated page entries.
    pages=[
        p for p in DIST.rglob('*.html')
        if p.name not in {'offline.html'}
        and (p.relative_to(DIST).as_posix() == 'index.html'
             or p.relative_to(DIST).as_posix().startswith('src/pages/'))
    ]
    routes=set()
    for page in pages:
        try: soup=BeautifulSoup(page.read_text(encoding='utf8',errors='ignore'),'html.parser')
        except Exception: continue
        for a in soup.select('a[href]'):
            href=(a.get('href') or '').strip()
            if href.startswith(('#','http:','https:','mailto:','tel:','javascript:')): continue
            if href: routes.add(_page_path(href))
    orphan=[]
    for page in pages:
        rel=page.relative_to(DIST).as_posix()
        if rel=='index.html': continue
        if rel not in routes: orphan.append('/'+rel[:-5])
    status='PASS' if not orphan else 'WARN'
    return status, f'{len(pages)} page(s) checked · {len(orphan)} orphaned page(s)', orphan[:30], len(pages)
