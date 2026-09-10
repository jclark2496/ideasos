#!/usr/bin/env python3
"""The site contract for ideasos. Prints `validation ok` or stops at the first thing that is wrong.

    python3 scripts/validate.py
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_skills  # noqa: E402

KINDS = {"guide", "howto", "note"}


def need(text: str, parts: list[str], what: str) -> None:
    for p in parts:
        if p not in text:
            raise SystemExit(f"{what} is missing {p!r}")


def front(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).split("\n"):
            k = re.match(r"^([\w-]+):\s*(.*)$", line)
            if k:
                meta[k.group(1)] = k.group(2).strip()
    return meta


# ---- the files that must exist ----
for f in ("index.html", "index.json", "llms.txt", "src/app.css", "src/app.js", "assets/brand/favicon.svg",
          "scripts/build_skills.py", "scripts/validate.py", "scripts/qa.py", "README.md", "LICENSE.md", "CLAUDE.md", ".claude/launch.json"):
    if not (ROOT / f).is_file():
        raise SystemExit(f"missing {f}")

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "src" / "app.css").read_text(encoding="utf-8")
js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
index = json.loads((ROOT / "index.json").read_text(encoding="utf-8"))
llms = (ROOT / "llms.txt").read_text(encoding="utf-8")

# ---- the page: no inline script or style, the pieces the app expects, the versions in step ----
if re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html) or re.search(r"<style\b", html) or re.search(r"\sstyle=", html) or re.search(r"\son\w+=", html):
    raise SystemExit("index.html must not carry inline script, styles, or handlers")
need(html, ['id="view"', 'id="status"', 'id="s-counts"', 'id="s-theme"', 'id="toast"', 'class="mark"', 'ideas_os', 'data-nav="home"', 'data-nav="agents"', 'data-nav="about"',
            'data-theme="light"', 'data-theme="dark"', 'data-theme="system"', 'src/app.css?v=', 'src/app.js?v=', 'assets/brand/favicon.svg', 'rel="canonical" href="https://ideasos.io/"'], "index.html")
css_v = re.search(r'src/app\.css\?v=(\d+)', html).group(1)
js_v = re.search(r'src/app\.js\?v=(\d+)', html).group(1)

# ---- the stylesheet: both themes drawn as tokens, in the three-state pattern ----
need(css, [":root {", "@media (prefers-color-scheme: dark)", ':root:not([data-theme="light"])', ':root[data-theme="dark"]', "--ground:", "--panel:", "--ink:", "--muted:", "--on:", "--agent-bg:", "--agent-on:",
           ".cards { list-style: none; display: grid; grid-template-columns: repeat(3,", 'html[data-side="you"] .step .agent { display: none; }', 'html[data-side="agent"] .step .you { display: none; }',
           ".install {", ".status {", "@media print", "prefers-reduced-motion", "overflow-x: clip"], "app.css")
if ".rail" in css or "parseFlow" in js or ".index" in css or 'class="index"' in js or "data-jump" in js:
    raise SystemExit("nothing sits beside a post: the wiring drawing and then the step index were both removed on 2026-09-09; a post is one column as wide as its head")
if ".post { padding: clamp(28px, 4vw, 52px) 0 40px; max-width: 960px" not in css:
    raise SystemExit("a post is one 960px column")
root_block = re.search(r":root \{(.*?)\n\}", css, re.S).group(1)
for token in ("--ground", "--panel", "--panel-2", "--ink", "--ink-2", "--muted", "--line", "--line-2", "--on", "--on-text", "--agent-bg", "--agent-ink", "--agent-muted", "--agent-line", "--agent-panel", "--agent-on"):
    if f"{token}:" not in root_block:
        raise SystemExit(f"app.css declares {token} only inside a theme block; every token must exist in the bare :root")
    for blk in re.findall(r'(?::root:not\(\[data-theme="light"\]\)|:root\[data-theme="dark"\]) \{(.*?)\n  ?\}', css, re.S):
        if f"{token}:" not in blk:
            raise SystemExit(f"app.css's dark theme does not redefine {token}")

# ---- the app ----
need(js, ["function parseGuide", "function agentOf", "function activate", "IntersectionObserver", "const installCmd", "const handoffText", "function stepText",
          "function run(", "function setTheme", "localStorage", 'class="name"', "window.App", ".claude/skills/", 'data-verb="install"', 'data-verb="send"', "renderAgents", "renderAbout"], "app.js")
if "<table" in js:
    raise SystemExit("the catalogue is a grid of cards, not a table")
if "switchOn" in js or "data-power" in js or ".power" in css:
    raise SystemExit("the switched-on button was dropped on 2026-09-09; the verbs stand on their own")

# ---- the catalogue ----
site = index["site"]
need(json.dumps(site), ['"name": "ideasos"', '"mark": "ideas_os"', '"domain": "https://ideasos.io"', '"tagline"', '"standfirst"', '"disclosure"', '"repo"', '"licence"'], "index.json site")
live = [e for e in index["entries"] if e["status"] == "live"]
if not live:
    raise SystemExit("the catalogue has no live ideas")
slugs = set()
for e in index["entries"]:
    if e["kind"] not in KINDS:
        raise SystemExit(f"{e['slug']}: kind must be one of {sorted(KINDS)}")
    if e["status"] not in ("live", "queued"):
        raise SystemExit(f"{e['slug']}: status must be live or queued")
    if e["slug"] in slugs:
        raise SystemExit(f"{e['slug']} appears twice")
    slugs.add(e["slug"])
    for field in ("title", "summary", "time", "agent", "pdf"):
        if field not in e:
            raise SystemExit(f"{e['slug']} has no {field}")
    if e["status"] != "live":
        continue
    path = ROOT / e["file"]
    if not path.is_file() or not e["file"].startswith("ideas/"):
        raise SystemExit(f"{e['slug']} points at a missing file: {e['file']}")
    text = path.read_text(encoding="utf-8")
    meta = front(text)
    if meta.get("kind", e["kind"]) != e["kind"]:
        raise SystemExit(f"{e['slug']}: the file says kind {meta.get('kind')} and the catalogue says {e['kind']}")
    if meta.get("by", site["name"]) != site["name"]:
        raise SystemExit(f"{e['slug']}: every byline is the brand, not a person")
    has_agent = bool(re.search(r"^agent:\s*$", text, re.M))
    if e["agent"] != has_agent:
        raise SystemExit(f"{e['slug']}: the catalogue says agent={e['agent']} but the file {'has' if has_agent else 'has no'} agent: blocks")
    if e["kind"] == "guide" and not has_agent:
        raise SystemExit(f"{e['slug']}: a guide has agent: blocks; without them it is a how-to")
    if e["kind"] in ("howto", "note") and has_agent:
        raise SystemExit(f"{e['slug']}: a {e['kind']} has no agent: blocks; with them it is a guide")
    if e["kind"] == "guide":
        if not e.get("skill"):
            raise SystemExit(f"{e['slug']}: a guide is also a skill; the catalogue must point at it")
        skill_path = ROOT / e["skill"]
        if not skill_path.is_file():
            raise SystemExit(f"{e['slug']}: the skill file {e['skill']} is missing; run scripts/build_skills.py")
        if build_skills.render(text, e["slug"]) != skill_path.read_text(encoding="utf-8"):
            raise SystemExit(f"{e['slug']}: {e['skill']} is out of date; run scripts/build_skills.py")
    elif e.get("skill"):
        raise SystemExit(f"{e['slug']}: only a guide installs as a skill")
    if f"ideasos.io/{e['file']}" not in llms:
        raise SystemExit(f"llms.txt does not list {e['file']}")
    if e.get("skill") and f"ideasos.io/{e['skill']}" not in llms:
        raise SystemExit(f"llms.txt does not list the skill for {e['slug']}")

# ---- the copy: the brand, not the people; nothing that should not ship ----
everything = "\n".join([html, css, js, json.dumps(index, ensure_ascii=False), llms] + [(ROOT / e["file"]).read_text(encoding="utf-8") for e in live])
for forbidden in ("gmail", "whosdriving", "eval(", "onclick=", "iterate consulting", "funeralthirsty.com/assets"):
    if forbidden in everything.lower():
        raise SystemExit(f"the site contains forbidden text: {forbidden}")
if re.search(r"\b(chicago|dallas|jason|dfw|two of us|both of us)\b", everything, re.I):
    raise SystemExit("the site keeps its authors out of the copy: the brand, not the people")

print(f"validation ok: {len(live)} live of {len(index['entries'])} ideas, app.css v={css_v}, app.js v={js_v}")
