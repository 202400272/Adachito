from __future__ import annotations
import json, os, re, shutil, socket, subprocess, time, urllib.error, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from .config import ROOT, SRC, DIST, ASSETS, ROUTES, REPORT_DIR
from .models import Result

IGNORE = {"http","https","mailto","tel","javascript","data","blob"}

def run_check(category, name, fn):
    start=time.perf_counter()
    try:
        r = fn()
        if isinstance(r, tuple):
            if len(r) == 4:
                status, summary, details, count = r
                r = Result(category, name, status, summary, details, count)
            else:
                raise TypeError(f"check returned unsupported tuple length {len(r)}")
    except Exception as e:
        r=Result(category,name,"FAIL",f"The check crashed: {e}",severity="critical")
    r.category=category; r.name=name; r.duration=time.perf_counter()-start
    return r

def find_npm():
    names=["npm.cmd","npm.exe","npm"] if os.name=="nt" else ["npm"]
    return next((shutil.which(x) for x in names if shutil.which(x)),None)

def find_node(): return shutil.which("node")

def build():
    if not (ROOT/"package.json").is_file(): return Result("Build","Build","FAIL","package.json is missing.",severity="critical")
    npm=find_npm()
    if not npm: return Result("Build","Build","FAIL","Node.js/npm could not be found. Try `npm -v` in this same terminal.",severity="critical")
    p=subprocess.run([npm,"run","build"],cwd=ROOT,text=True,capture_output=True,timeout=180)
    if p.returncode: return Result("Build","Build","FAIL","The production build failed.",(p.stdout+p.stderr).splitlines()[-12:],severity="critical")
    if not DIST.is_dir(): return Result("Build","Build","FAIL","Build said it succeeded, but dist/ was not created.",severity="critical")
    return Result("Build","Build","PASS","Production build completed.",count=1)

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.links=[]; self.resources=[]; self.ids=set(); self.dupes=[]; self.images=[]; self.inputs=[]; self.buttons=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs); i=d.get("id")
        if i:
            if i in self.ids:self.dupes.append(i)
            self.ids.add(i)
        if tag=="a" and d.get("href"):self.links.append(d["href"])
        for k in ("src","href","poster"):
            if d.get(k):self.resources.append(d[k])
        if tag=="img":self.images.append(d)
        if tag=="input":self.inputs.append(d)
        if tag=="button":self.buttons.append(d)

def pages(): return [p for p in [ROOT/"index.html",*(SRC/"pages").rglob("*.html")] if p.is_file()]
def parse(p):
    x=Parser(); x.feed(p.read_text(encoding="utf8",errors="replace")); return x

def external(v): return urlsplit(v).scheme.lower() in IGNORE or v.startswith("//")
def candidates(v,src):
    clean=unquote(v.split("?",1)[0].split("#",1)[0])
    if not clean or external(clean): return []
    if clean in ROUTES: return [ROOT/"src/pages"/(clean.strip("/")+".html"), ROOT/"index.html"]
    if clean == "/privacy": return [ROOT/"src/pages/Privacy.html"]
    if clean == "/terms": return [ROOT/"src/pages/Terms.html"]
    if clean.startswith("/"): return [ROOT/clean.lstrip("/"),DIST/clean.lstrip("/")]
    return [src.parent/clean,ROOT/clean,DIST/clean.lstrip("/")]
def exists(v,src):
    if not v or v.startswith("#") or external(v): return True
    return any(p.is_file() or (p.is_dir() and (p/"index.html").is_file()) for p in candidates(v,src))

def json_check():
    fs=list(SRC.rglob("*.json")); bad=[]
    for p in fs:
        try: json.loads(p.read_text(encoding="utf8"))
        except Exception as e: bad.append(f"{p.relative_to(ROOT)} — {e}")
    return Result("Data","Content files","FAIL" if bad else "PASS",f"{len(fs)} files checked · {len(bad)} unreadable",bad[:8],len(fs))

def locale_check():
    groups={}
    for p in SRC.rglob("*.json"):
        if p.parent.name in {"en","es","tg"}: groups.setdefault(str(p.parent.parent.relative_to(SRC)),{})[p.parent.name]=p
    mism=[]; compared=0
    def shape(x):
        if isinstance(x,dict):return {k:shape(v) for k,v in sorted(x.items())}
        if isinstance(x,list):return [shape(x[0])] if x else []
        return type(x).__name__
    for g,vs in groups.items():
        vals={}
        for lang,p in vs.items():
            try:vals[lang]=json.loads(p.read_text(encoding="utf8"))
            except:pass
        if len(vals)<2:continue
        compared+=1; base=shape(vals[sorted(vals)[0]])
        for lang,v in vals.items():
            if shape(v)!=base:mism.append(f"{g}: {lang} has a different data structure")
    return Result("Data","Translations","WARN" if mism else "PASS",f"{compared} language groups compared · {len(mism)} differences",mism[:8],compared)

def source_integrity():
    ps=pages(); broken=[]; assets=[]; alt=[]; dup=[]; anchors=0
    for p in ps:
        x=parse(p)
        for h in x.links:
            if h.startswith("#"):
                anchors+=1
                if h[1:] and h[1:] not in x.ids: broken.append(f"{p.relative_to(ROOT)} → {h}")
            elif not exists(h,p): broken.append(f"{p.relative_to(ROOT)} → {h}")
        for r in x.resources:
            if not exists(r,p): assets.append(f"{p.relative_to(ROOT)} → {r}")
        alt += [f"{p.relative_to(ROOT)} → {i.get('src','inline image')}" for i in x.images if 'alt' not in i]
        dup += [f"{p.relative_to(ROOT)} → #{i}" for i in x.dupes]
    return [
        Result("Links","Links","FAIL" if broken else "PASS",f"{len(ps)} pages · {len(broken)} broken",broken[:8],len(broken)),
        Result("Links","Missing files","FAIL" if assets else "PASS",f"{len(ps)} pages · {len(assets)} missing local files",assets[:8],len(assets)),
        Result("Accessibility","Image descriptions","WARN" if alt else "PASS",f"{len(ps)} pages · {len(alt)} images without descriptions",alt[:8],len(alt)),
        Result("Links","Duplicate IDs","FAIL" if dup else "PASS",f"{len(ps)} pages · {len(dup)} duplicates",dup[:8],len(dup)),
        Result("Links","Page anchors","PASS",f"{anchors} local anchors checked",[],anchors),
    ]

def page_basics():
    ps=pages(); bad=[]
    for p in ps:
        t=p.read_text(encoding="utf8",errors="replace"); low=t.lower(); rel=str(p.relative_to(ROOT))
        if "<!doctype html>" not in low:bad.append(f"{rel}: missing DOCTYPE")
        if "<title" not in low:bad.append(f"{rel}: missing title")
        if 'name="viewport"' not in low:bad.append(f"{rel}: missing mobile viewport")
        if not re.search(r"<html\b[^>]*\blang=",t,re.I):bad.append(f"{rel}: missing language declaration")
    return Result("Pages","Page basics","FAIL" if bad else "PASS",f"{len(ps)} pages · {len(bad)} issues",bad[:8],len(ps))

def routes():
    missing=[]
    for r in ROUTES:
        p=ROOT/"index.html" if r=="/" else ROOT/"src/pages"/(r.strip("/")+".html")
        if not p.is_file():missing.append(r)
    return Result("Pages","Expected pages","FAIL" if missing else "PASS",f"{len(ROUTES)} expected · {len(missing)} missing",missing[:8],len(ROUTES))

def js_check():
    fs=list(SRC.rglob("*.js"))+list(SRC.rglob("*.mjs")); node=find_node()
    if not node:return Result("JavaScript","JavaScript syntax","SKIP",f"{len(fs)} files found · Node.js not available",count=len(fs))
    bad=[]
    for p in fs:
        q=subprocess.run([node,"--check",str(p)],capture_output=True,text=True,timeout=10)
        if q.returncode:bad.append(f"{p.relative_to(ROOT)} — {(q.stderr or q.stdout).splitlines()[-1] if (q.stderr or q.stdout) else 'syntax error'}")
    return Result("JavaScript","JavaScript syntax","FAIL" if bad else "PASS",f"{len(fs)} files checked · {len(bad)} errors",bad[:8],len(fs))

def large_assets():
    fs=[p for p in ASSETS.rglob("*") if p.is_file()] if ASSETS.is_dir() else []
    heavy=sorted([p for p in fs if p.stat().st_size>=5*1024*1024],key=lambda p:p.stat().st_size,reverse=True)
    details=[f"{p.relative_to(ROOT)} — {p.stat().st_size/1024/1024:.1f} MiB" for p in heavy[:8]]
    return Result("Links","Large files","WARN" if heavy else "PASS",f"{len(fs)} files · {len(heavy)} are 5 MiB or larger",details,len(fs))

def accessibility():
    ps=pages(); issues=[]
    for p in ps:
        x=parse(p); rel=str(p.relative_to(ROOT))
        for b in x.buttons:
            hint=(b.get("id","")+" "+b.get("class","")).lower()
            if any(k in hint for k in ("menu","close","search","prev","next","zoom","icon")) and not (b.get("aria-label") or b.get("title") or b.get("value")):
                issues.append(f"{rel}: button #{b.get('id','<unnamed>')} may need an accessible name")
        for i in x.inputs:
            typ=(i.get("type") or "text").lower()
            if typ in {"hidden","submit","button","reset"}:continue
            if not (i.get("aria-label") or i.get("aria-labelledby") or i.get("placeholder") or i.get("id")):
                issues.append(f"{rel}: text input has no obvious label")
    return Result("Accessibility","Basic accessibility","WARN" if issues else "PASS",f"{len(ps)} pages inspected · {len(issues)} things to review",issues[:8],len(ps))


def music_data_check():
    """Validate the Music page's three locale datasets without downloading audio."""
    music_dir = SRC / "data" / "music"
    files = [music_dir / f"{lang}.json" for lang in ("en", "es", "tg")]
    issues = []
    loaded = {}
    total_tracks = 0
    for p in files:
        if not p.is_file():
            issues.append(f"Missing music dataset: {p.relative_to(ROOT)}")
            continue
        try:
            data = json.loads(p.read_text(encoding="utf8"))
        except Exception as exc:
            issues.append(f"{p.relative_to(ROOT)} — invalid JSON: {exc}")
            continue
        albums = data.get("albums")
        if not isinstance(albums, list) or not albums:
            issues.append(f"{p.relative_to(ROOT)} — albums must be a non-empty list")
            continue
        loaded[p.stem] = data
        seen = set()
        for album in albums:
            aid = album.get("id") if isinstance(album, dict) else None
            if not aid:
                issues.append(f"{p.name} — album is missing id")
                continue
            tracks = album.get("tracks", [])
            if not isinstance(tracks, list) or not tracks:
                issues.append(f"{p.name} — album {aid} has no tracks")
                continue
            for track in tracks:
                total_tracks += 1
                tid = track.get("id") if isinstance(track, dict) else None
                if not tid:
                    issues.append(f"{p.name} / {aid} — track is missing id")
                    continue
                if tid in seen:
                    issues.append(f"{p.name} — duplicate track id {tid}")
                seen.add(tid)
                for key in ("filename", "duration", "title", "artist"):
                    if not track.get(key):
                        issues.append(f"{p.name} / {aid} / {tid} — missing {key}")
                if track.get("duration") and not re.fullmatch(r"\d{1,3}:\d{2}", str(track["duration"])):
                    issues.append(f"{p.name} / {aid} / {tid} — invalid duration {track['duration']!r}")
    if loaded:
        reference = loaded.get("en") or next(iter(loaded.values()))
        ref_shape = [(a.get("id"), len(a.get("tracks", []))) for a in reference.get("albums", [])]
        for lang, data in loaded.items():
            shape = [(a.get("id"), len(a.get("tracks", []))) for a in data.get("albums", [])]
            if shape != ref_shape:
                issues.append(f"{lang}.json — album/track structure differs from the reference locale")
    return Result("Music", "Music data", "FAIL" if issues else "PASS", f"{len(loaded)} locale files · {total_tracks} track entries checked · {len(issues)} issues", issues[:12], total_tracks)


def check_server(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,method="GET",headers={"User-Agent":"AdashimaVerse-QA/6"}),timeout=5) as r:return True,r.status
    except urllib.error.HTTPError as e:return True,e.code
    except Exception as e:return False,str(e)

def free_port():
    with socket.socket() as s:s.bind(("127.0.0.1",0));return s.getsockname()[1]

def start_preview():
    npm=find_npm()
    if not npm:return None,None,"npm was not found. Run `npm -v` here first."
    port=free_port(); url=f"http://127.0.0.1:{port}/"; cmd=[npm,"run","preview","--","--host","127.0.0.1","--port",str(port),"--strictPort"]
    try:
        kw=dict(cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding="utf8",errors="replace")
        if os.name=="nt":kw["creationflags"]=subprocess.CREATE_NEW_PROCESS_GROUP
        else:kw["start_new_session"]=True
        proc=subprocess.Popen(cmd,**kw)
    except Exception as e:return None,None,f"Could not start npm run preview: {e}"
    end=time.monotonic()+30
    while time.monotonic()<end:
        if proc.poll() is not None:
            out=(proc.stdout.read().splitlines() if proc.stdout else [])[-8:]
            return None,None,"Preview stopped unexpectedly:\n"+"\n".join(out)
        ok,_=check_server(url)
        if ok:return proc,url,None
        time.sleep(.25)
    stop_preview(proc); return None,None,"Preview did not become ready within 30 seconds."

def stop_preview(proc):
    if not proc:return
    try:
        if proc.poll() is None:
            if os.name=="nt":subprocess.run(["taskkill","/PID",str(proc.pid),"/T","/F"],capture_output=True,timeout=10)
            else:proc.terminate()
    except Exception:
        try:proc.kill()
        except Exception:pass
