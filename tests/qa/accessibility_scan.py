from __future__ import annotations
from .config import CRITICAL_ROUTES
from .models import Result


def run(page, base):
    out=[]
    for route in CRITICAL_ROUTES:
        try:
            page.goto(base.rstrip('/') + ('/' if route=='/' else route), wait_until='domcontentloaded', timeout=20000)
            issues=page.evaluate('''() => {
                const issues=[];
                document.querySelectorAll('img').forEach((el,i)=>{ if(!el.hasAttribute('alt')) issues.push(`image ${i+1} has no alt attribute`); });
                document.querySelectorAll('button, a[href], input, select, textarea').forEach((el,i)=>{
                    const label=el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || '';
                    if(!String(label).trim() && !el.id && !el.getAttribute('aria-labelledby')) issues.push(`interactive control ${i+1} has no accessible name`);
                });
                document.querySelectorAll('[aria-labelledby]').forEach(el=>{ for(const id of el.getAttribute('aria-labelledby').split(/\\s+/)){ if(id && !document.getElementById(id)) issues.push(`aria-labelledby references missing #${id}`); } });
                document.querySelectorAll('[aria-controls]').forEach(el=>{ for(const id of el.getAttribute('aria-controls').split(/\\s+/)){ if(id && !document.getElementById(id)) issues.push(`aria-controls references missing #${id}`); } });
                const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>+h.tagName[1]);
                for(let i=1;i<headings.length;i++) if(headings[i]>headings[i-1]+1) issues.push(`heading hierarchy skips h${headings[i-1]} to h${headings[i]}`);
                return issues;
            }''')
            out.append(Result('Accessibility',f'Accessibility scan: {route}','PASS' if not issues else 'WARN',f'{len(issues)} issue(s) found.',issues[:20],count=1))
        except Exception as exc:
            out.append(Result('Accessibility',f'Accessibility scan: {route}','FAIL',f'Could not scan page: {exc}',severity='high'))
    return out
