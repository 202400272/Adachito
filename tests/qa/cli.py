from __future__ import annotations
import argparse
from .runner import run
from .report import print_report,save_json,save_html,save_baseline
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn

def main(argv=None):
    p=argparse.ArgumentParser(description='AdashimaVerse QA — check the site before you publish it.')
    p.add_argument('mode',nargs='?',choices=['full','pages','browser','perf','static'],default='full',help='full, pages, browser, perf, or static')
    p.add_argument('--no-build',action='store_true',help='Skip npm run build')
    p.add_argument('--browser',metavar='URL',help='Use an already-running site instead of npm run preview')
    p.add_argument('--screenshots',action='store_true',help='Save screenshots when browser checks fail')
    p.add_argument('--save-baseline',action='store_true',help='Save this run as the comparison baseline')
    p.add_argument('--no-html',action='store_true',help='Do not generate the friendly HTML report')
    a=p.parse_args(argv)
    with Progress(SpinnerColumn(), TextColumn('[progress.description]{task.description}'), BarColumn(), TaskProgressColumn(), TimeElapsedColumn(), transient=False) as progress:
        task = progress.add_task('Preparing QA run', total=1)
        def on_progress(label, status, done, total, elapsed):
            if total <= 0:
                total = 1
            progress.update(task, total=total, completed=min(done, total), description=f'{label} [{status}]')
        rs,elapsed=run(a.mode,a.no_build,a.browser,a.screenshots,progress_callback=on_progress)
        progress.update(task, completed=progress.tasks[0].total)
    print_report(rs,elapsed)
    path=save_json(rs,elapsed)
    html_path=None if a.no_html else save_html(rs,elapsed)
    if a.save_baseline: baseline=save_baseline(rs,elapsed); print(f'\nBaseline saved: {baseline}')
    print(f'\nMachine-readable report: {path}')
    if html_path: print(f'Browser-friendly report: {html_path}')
    return 1 if any(r.status=='FAIL' for r in rs) else 0
