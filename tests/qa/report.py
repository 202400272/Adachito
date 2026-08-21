from __future__ import annotations
import html, json, time
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from .models import Result
from .config import FRIENDLY, REPORT_DIR
from .compare import compare


def score(rs):
    if not rs:return 0
    weights={'PASS':1,'WARN':.7,'SKIP':.9,'FAIL':0}
    return round(sum(weights.get(r.status,1) for r in rs)/len(rs)*100)


def icon(s):return {'PASS':'[green]✓[/green]','FAIL':'[red]✗[/red]','WARN':'[yellow]![/yellow]','SKIP':'[dim]–[/dim]'}[s]


def payload(rs,elapsed):
    p=sum(r.status=='PASS' for r in rs);f=sum(r.status=='FAIL' for r in rs);w=sum(r.status=='WARN' for r in rs);s=sum(r.status=='SKIP' for r in rs)
    return {'version':11,'timestamp':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'health':score(rs),'runtime_seconds':round(elapsed,3),'summary':{'checks':len(rs),'things_checked':sum(r.count for r in rs),'passed':p,'failed':f,'warnings':w,'skipped':s},'results':[r.to_dict() for r in rs]}


def print_report(rs,elapsed):
    c=Console(); data=payload(rs,elapsed); p=data['summary']['passed'];f=data['summary']['failed'];w=data['summary']['warnings'];s=data['summary']['skipped'];things=data['summary']['things_checked']
    c.print(Panel.fit('[bold cyan]ADASHIMAVERSE QA v11[/bold cyan]\n[dim]Checks the site like a visitor, then explains what needs attention.[/dim]',border_style='cyan'))
    current=None
    for r in rs:
        heading,desc=FRIENDLY.get(r.category,(r.category,''))
        if heading!=current:
            current=heading;c.print(f'\n[bold cyan]{heading.upper()}[/bold cyan] [dim]{desc}[/dim]')
        t=Table(box=None,show_header=False,expand=True,padding=(0,1));t.add_column(width=8);t.add_column(min_width=28);t.add_column(ratio=1);t.add_column(width=7,justify='right')
        t.add_row(icon(r.status),r.name,r.summary,f'{r.duration:.2f}s');c.print(t)
        if r.details and r.status in {'FAIL','WARN'}:
            color='red' if r.status=='FAIL' else 'yellow'
            for d in r.details[:5]:c.print(f'    [{color}]•[/] {d}')
    stats=Table(title='At a glance',box=None,show_header=False);stats.add_column('');stats.add_column('',justify='right')
    for k,v in [('Site health',f'{data["health"]}/100'),('Checks',f'{len(rs):,}'),('Things checked',f'{things:,}'),('Passed',f'[green]{p:,}[/green]'),('Needs fixing',f'[red]{f:,}[/red]'),('Warnings',f'[yellow]{w:,}[/yellow]'),('Skipped',f'[dim]{s:,}[/dim]'),('Time',f'{elapsed:.2f}s')]:stats.add_row(k,v)
    c.print('\n',stats)
    baseline=compare(data)
    if baseline:c.print(Panel('[bold yellow]Changes since the saved baseline[/bold yellow]\n'+'\n'.join('• '+x for x in baseline),border_style='yellow'))
    if f:c.print(Panel(f'[bold red]✗ {f} check(s) need fixing[/bold red]\nStart with the red items above.',border_style='red'))
    elif w:c.print(Panel(f'[bold yellow]! Site looks okay, but {w} warning(s) are worth reviewing.[/bold yellow]',border_style='yellow'))
    else:c.print(Panel('[bold green]✓ Everything checked passed.[/bold green]',border_style='green'))


def save_json(rs,elapsed):
    REPORT_DIR.mkdir(exist_ok=True);p=REPORT_DIR/'latest.json';d=payload(rs,elapsed);p.write_text(json.dumps(d,indent=2),encoding='utf8');return p


def save_baseline(rs,elapsed):
    from .compare import save_baseline
    return save_baseline(payload(rs,elapsed))


def save_html(rs,elapsed):
    REPORT_DIR.mkdir(exist_ok=True)
    d=payload(rs,elapsed); s=d['summary']
    groups=[]
    import itertools
    for category, grouped in itertools.groupby(d['results'], key=lambda x:x['category']):
        items=list(grouped)
        heading, desc = FRIENDLY.get(category,(category,''))
        rows=[]
        for r in items:
            status=r['status']; cls=status.lower()
            details=''.join('<li>'+html.escape(x)+'</li>' for x in r.get('details',[])[:8])
            detail_html='<details><summary>Details</summary><ul>'+details+'</ul></details>' if details else ''
            rows.append('<article class="result '+cls+'"><div class="status-dot"></div><div class="result-main"><div class="result-head"><strong>'+html.escape(r['name'])+'</strong><span class="badge '+cls+'">'+html.escape(status)+'</span></div><p>'+html.escape(r['summary'])+'</p>'+detail_html+'</div><time>'+f"{r['duration']:.2f}"+'s</time></article>')
        groups.append('<section class="section"><div class="section-head"><div><h2>'+html.escape(heading)+'</h2><p>'+html.escape(desc)+'</p></div><span class="section-count">'+str(len(items))+' checks</span></div>'+''.join(rows)+'</section>')

    health=d['health']
    css='''
:root{--bg:#090d14;--panel:#111823;--panel2:#151e2b;--line:#263244;--text:#edf3fb;--muted:#8d9bb0;--cyan:#61d9ff;--green:#55d88b;--red:#ff6878;--yellow:#f5c86b;--shadow:0 20px 60px rgba(0,0,0,.28)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0%,#13253a 0,transparent 35%),var(--bg);color:var(--text);font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--cyan)}
.wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:36px 0 70px}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:28px}.eyebrow{color:var(--cyan);font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:11px}h1{font-size:clamp(28px,5vw,46px);line-height:1.05;margin:7px 0}.subtitle,.meta,.section-head p{color:var(--muted);margin:0}
.health{display:flex;align-items:center;gap:16px;background:var(--panel);border:1px solid var(--line);padding:14px 18px;border-radius:18px;box-shadow:var(--shadow)}.ring{--p:__HEALTH__%;width:78px;height:78px;border-radius:50%;background:conic-gradient(var(--cyan) var(--p),#273344 0);display:grid;place-items:center;position:relative}.ring::after{content:"";position:absolute;width:58px;height:58px;background:var(--panel);border-radius:50%}.ring span{position:absolute;font-size:18px;font-weight:800;z-index:1}.health small{color:var(--muted);display:block}.health strong{font-size:24px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px}.metric,.section,.toolbar{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}.metric{padding:18px}.metric small{color:var(--muted);display:block;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800}.metric strong{display:block;font-size:26px;margin-top:6px}.pass{color:var(--green)}.fail{color:var(--red)}.warn{color:var(--yellow)}.skip{color:#98a4b6}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;margin-bottom:18px;position:sticky;top:12px;z-index:5;backdrop-filter:blur(14px)}.filters{display:flex;gap:7px;flex-wrap:wrap}button{border:1px solid var(--line);background:#0d141f;color:var(--muted);padding:8px 11px;border-radius:10px;cursor:pointer}button.active,button:hover{color:var(--text);border-color:#3a7184;background:#122531}
.section{overflow:hidden;margin:18px 0}.section-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:20px 22px;border-bottom:1px solid var(--line)}.section-head h2{margin:0 0 3px;font-size:17px}.section-count{font-size:11px;color:var(--muted);white-space:nowrap}.result{display:grid;grid-template-columns:10px 1fr auto;gap:14px;align-items:start;padding:15px 22px;border-bottom:1px solid rgba(38,50,68,.65)}.result:last-child{border-bottom:0}.status-dot{width:8px;height:8px;border-radius:50%;margin-top:7px;background:#98a4b6}.result.pass .status-dot{background:var(--green)}.result.fail .status-dot{background:var(--red)}.result.warn .status-dot{background:var(--yellow)}.result-head{display:flex;gap:10px;align-items:center;justify-content:space-between}.result p{color:var(--muted);margin:4px 0 0}time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px;padding-top:2px}.badge{font-size:10px;font-weight:800;letter-spacing:.07em;border-radius:999px;padding:3px 8px;background:#1d2735}.badge.pass{color:var(--green);background:#113024}.badge.fail{color:var(--red);background:#351722}.badge.warn{color:var(--yellow);background:#332b18}.badge.skip{color:#aeb7c5}details{margin-top:9px;color:var(--muted)}summary{cursor:pointer;color:#b8c6d8;font-size:12px}ul{margin:7px 0 0;padding-left:18px}footer{color:var(--muted);text-align:center;margin-top:28px;font-size:12px}
@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.top{align-items:flex-start;flex-direction:column}.health{width:100%}}@media(max-width:560px){.wrap{width:min(100% - 20px,1180px);padding-top:22px}.grid{grid-template-columns:1fr 1fr}.toolbar{position:static;align-items:flex-start;flex-direction:column}.result{grid-template-columns:8px 1fr}time{grid-column:2}.section-head{align-items:flex-start;flex-direction:column}}
'''.replace('__HEALTH__',str(health))
    doc='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdashimaVerse QA Dashboard</title><style>'''+css+'''</style></head><body><main class="wrap">
<header class="top"><div><div class="eyebrow">AdashimaVerse QA / v11</div><h1>Quality dashboard</h1><p class="subtitle">A readable snapshot of what the automated tester checked.</p><p class="meta">Generated __TIMESTAMP__ · Runtime __RUNTIME__s</p></div><div class="health"><div class="ring"><span>__HEALTH__</span></div><div><small>Overall health</small><strong>__HEALTH__/100</strong></div></div></header>
<div class="grid"><div class="metric"><small>Checks</small><strong>__CHECKS__</strong></div><div class="metric"><small>Things checked</small><strong>__THINGS__</strong></div><div class="metric"><small>Passed</small><strong class="pass">__PASSED__</strong></div><div class="metric"><small>Failed</small><strong class="fail">__FAILED__</strong></div><div class="metric"><small>Warnings</small><strong class="warn">__WARNINGS__</strong></div></div>
<div class="toolbar"><div><strong>Results</strong> <span class="meta">Filter the run</span></div><div class="filters"><button class="active" data-filter="all">All</button><button data-filter="PASS">Passed</button><button data-filter="FAIL">Failed</button><button data-filter="WARN">Warnings</button><button data-filter="SKIP">Skipped</button></div></div>
__GROUPS__
<footer>AdashimaVerse automated QA · Report generated locally from the test runner.</footer></main>
<script>const buttons=[...document.querySelectorAll('[data-filter]')];const results=[...document.querySelectorAll('.result')];buttons.forEach(b=>b.addEventListener('click',()=>{buttons.forEach(x=>x.classList.remove('active'));b.classList.add('active');const f=b.dataset.filter;results.forEach(r=>r.style.display=f==='all'||r.classList.contains(f.toLowerCase())?'grid':'none')}));</script></body></html>'''
    replacements={'__TIMESTAMP__':html.escape(d['timestamp']),'__RUNTIME__':f"{d['runtime_seconds']:.2f}",'__HEALTH__':str(health),'__CHECKS__':f"{s['checks']:,}",'__THINGS__':f"{s['things_checked']:,}",'__PASSED__':f"{s['passed']:,}",'__FAILED__':f"{s['failed']:,}",'__WARNINGS__':f"{s['warnings']:,}",'__GROUPS__':''.join(groups)}
    for k,v in replacements.items(): doc=doc.replace(k,v)
    p=REPORT_DIR/'report.html';p.write_text(doc,encoding='utf8');return p
