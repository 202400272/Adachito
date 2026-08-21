from __future__ import annotations
import json
from pathlib import Path
from .config import REPORT_DIR

BASELINE = REPORT_DIR / 'baseline.json'

def load_baseline():
    if not BASELINE.is_file():
        return None
    try:
        return json.loads(BASELINE.read_text(encoding='utf8'))
    except Exception:
        return None

def compare(current):
    old = load_baseline()
    if not old:
        return []
    findings=[]
    old_sum=old.get('summary',{})
    new_sum=current.get('summary',{})
    for key,label in [('failed','failed checks'),('warnings','warnings'),('things_checked','things checked')]:
        if key in old_sum and key in new_sum:
            delta=new_sum[key]-old_sum[key]
            if key in ('failed','warnings') and delta>0:
                findings.append(f'{label.capitalize()} increased by {delta} ({old_sum[key]} → {new_sum[key]})')
    if 'health' in old and 'health' in current and current['health'] < old['health']-5:
        findings.append(f'Site health dropped from {old["health"]}/100 to {current["health"]}/100')
    return findings

def save_baseline(current):
    REPORT_DIR.mkdir(exist_ok=True)
    BASELINE.write_text(json.dumps(current,indent=2),encoding='utf8')
    return BASELINE
