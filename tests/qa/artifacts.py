from __future__ import annotations
import json
from .config import REPORT_DIR

def save_failure_context(results, url):
    failures=[r.to_dict() for r in results if r.status in {'FAIL','WARN'}]
    if not failures: return None
    path=REPORT_DIR/'failure-context.json'; path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps({'url':url,'issues':failures},indent=2),encoding='utf8')
    return path
