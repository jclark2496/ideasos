#!/usr/bin/env python3
"""Browser QA for ideasos: headless Chrome over CDP, three viewports, against a local server it starts itself.

    python3 scripts/qa.py            # prints one line per check, then `browser QA ok`; exits 1 on any failure
    python3 scripts/qa.py --shots    # also writes qa/*.png (the home and a post, light and dark, and a phone)

Needs `pip3 install websocket-client` and Google Chrome. Never asserts a transient value after a fixed sleep: every
wait is on window.App.state().
"""
from __future__ import annotations
import base64
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

import websocket

ROOT = Path(__file__).resolve().parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9226
HTTP = 8790
BASE = f"http://127.0.0.1:{HTTP}"
VIEWPORTS = ((1440, 900), (390, 844), (320, 568))
SHOTS = "--shots" in sys.argv


class CDP:
    def __init__(self, socket_url):
        self.socket = websocket.create_connection(socket_url, origin=f"http://127.0.0.1:{PORT}")
        self.counter = 0
        self.console_errors = []

    def call(self, method, params=None):
        self.counter += 1
        request_id = self.counter
        self.socket.send(json.dumps({"id": request_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.socket.recv())
            if message.get("method") == "Runtime.exceptionThrown":
                details = message["params"]["exceptionDetails"]
                described = (details.get("exception") or {}).get("description") or details.get("text", "JavaScript exception")
                self.console_errors.append(f"{described.partition(chr(10))[0]} ({details.get('url') or 'inline'}:{details.get('lineNumber')})")
            if message.get("method") == "Log.entryAdded" and message["params"]["entry"].get("level") == "error":
                self.console_errors.append(message["params"]["entry"].get("text", "Console error"))
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression):
        return self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})["result"].get("value")


class Page:
    def __init__(self, cdp):
        self.cdp = cdp

    def ev(self, expression):
        return self.cdp.evaluate(expression)

    def emulate(self, width, height, dark=False):
        self.cdp.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 600})
        self.cdp.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "dark" if dark else "light"}]})

    def wait(self, predicate, timeout=8, what="browser condition"):
        started = time.time()
        while time.time() - started < timeout:
            if predicate():
                return True
            time.sleep(.05)
        raise TimeoutError(f"{what} timed out after {timeout}s")

    def load(self, path):
        self.cdp.call("Page.navigate", {"url": BASE + path})
        self.wait(lambda: self.ev("document.readyState") == "complete", what=f"load {path}")
        self.wait(lambda: bool(self.ev("!!window.App && App.state().ready && App.state().loaded")), timeout=12, what=f"app at {path}")

    def go(self, hash_):
        self.ev(f"App.go({json.dumps(hash_)}); 1")
        self.wait(lambda: bool(self.ev(f"App.state().loaded && App.state().route === {json.dumps(hash_)}")), timeout=12, what=f"route {hash_}")

    def overflow(self):
        return bool(self.ev("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

    def shot(self, path):
        data = self.cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})["data"]
        path.write_bytes(base64.b64decode(data))


failures = []


def check(name, ok, detail=""):
    print(("ok    " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))
    if not ok:
        failures.append(name)


# ---------- scenarios, per viewport ----------
def home(p, vp):
    width = int(vp.split("x")[0])
    p.load("/")
    p.ev("localStorage.clear(); 1"); p.load("/")
    s = p.ev("App.state()")
    check(f"{vp} the catalogue renders", s["entries"] == 9 and s["live"] == 3 and s["shown"] == 9 and p.ev("document.querySelectorAll('.card.queued').length") == 6, str(s))
    cols = p.ev("getComputedStyle(document.querySelector('.cards')).gridTemplateColumns.split(' ').length")
    check(f"{vp} cards sit three, two or one to a line", cols == (3 if width > 960 else 2 if width > 640 else 1), f"{cols} at {width}")
    check(f"{vp} each kind carries its verb", p.ev("document.querySelector('.card[data-slug=doorman] .btn.primary').textContent") == "Install"
          and p.ev("document.querySelectorAll('.card[data-slug=hallway] .btn.primary').length") == 0 and p.ev("document.querySelector('.card[data-slug=hallway] .btn').textContent") == "Open"
          and p.ev("document.querySelector('.card[data-slug=doorman] .kind').textContent") == "Guide" and p.ev("document.querySelector('.card[data-slug=hallway] .kind').textContent") == "Note")
    check(f"{vp} the status bar counts", "9 ideas" in p.ev("document.getElementById('s-counts').textContent") and "1 installable" in p.ev("document.getElementById('s-counts').textContent") and "6 in the queue" in p.ev("document.getElementById('s-counts').textContent"))
    p.ev("App.filter('note'); 1"); notes = p.ev("App.state().shown")
    p.ev("App.filter('guide'); 1"); guides = p.ev("App.state().shown")
    p.ev("App.filter('all'); App.search('doorman'); 1"); found = p.ev("App.state().shown")
    p.ev("App.search(''); 1")
    check(f"{vp} the grid filters and searches", notes == 2 and guides == 3 and found == 2 and p.ev("App.state().shown") == 9 and p.ev("document.querySelectorAll('.filters button').length") == 4, f"{notes} {guides} {found}")
    check(f"{vp} no card carries a power button", p.ev("document.querySelectorAll('.power, .glyph').length") == 0)
    check(f"{vp} every card leads with the name you type", p.ev("[...document.querySelectorAll('.card')].every(c => c.querySelector('.c-top .name').textContent === c.dataset.slug)")
          and p.ev("document.querySelector('.card[data-slug=doorman] .c-top').textContent").startswith("doorman"))
    # the prompt understands the verbs
    ok = p.ev("App.run('install doorman')")
    st = p.ev("App.state()")
    check(f"{vp} install doorman copies the line", ok and ".claude/skills/doorman" in st["lastCopy"] and "skills/doorman/SKILL.md" in st["lastCopy"] and "/doorman" in p.ev("document.getElementById('toast').textContent"), st["lastCopy"][:60])
    ok = p.ev("App.run('install hallway')")
    check(f"{vp} install refuses a note and says why", not ok and "send it to your agent" in p.ev("document.getElementById('toast').textContent"))
    ok = p.ev("App.run('send hallway')")
    check(f"{vp} send hallway copies a read-this line", ok and "ideas/hallway.md" in p.ev("App.state().lastCopy") and "keep it in mind" in p.ev("App.state().lastCopy"))
    p.ev("App.run('help'); 1")
    check(f"{vp} help says what the prompt takes", "install <idea>" in p.ev("document.getElementById('toast').textContent"))
    check(f"{vp} home no overflow", not p.overflow())


def post(p, vp):
    p.load("/")
    p.go("#/ideas/doorman")
    s = p.ev("App.state()")
    check(f"{vp} the guide renders with its agent pages and its index", s["kind"] == "guide" and s["steps"] == 6 and s["agents"] == 6 and s["indexed"] == 6 and s["side"] == "both"
          and p.ev("document.querySelectorAll('.rail, .wires').length") == 0, str({k: s[k] for k in ('kind', 'steps', 'agents', 'indexed')}))
    wide = int(vp.split("x")[0]) > 960
    check(f"{vp} the index sits beside the steps on a wide screen and steps aside on a narrow one", p.ev("getComputedStyle(document.querySelector('.index')).display") == ("grid" if wide else "none")
          and (not wide or p.ev("document.querySelector('.index').getBoundingClientRect().left > document.querySelector('.steps').getBoundingClientRect().right")))
    check(f"{vp} the reading column uses the width", p.ev("document.querySelector('.step').getBoundingClientRect().width") >= (700 if wide else 250))
    check(f"{vp} the post head leads with the name", p.ev("document.querySelector('.p-top .name').textContent") == "doorman")
    check(f"{vp} the head carries the verbs and the install line", p.ev("document.querySelector('.actions .btn.primary').textContent") == "Install" and "curl" in p.ev("document.getElementById('install-cmd').textContent")
          and "6 steps, 10 checks, 2 ask first" in p.ev("document.querySelector('.install .then').textContent") and p.ev("App.skill().startsWith('---\\nname: doorman')")
          and p.ev("document.querySelectorAll('.step .agent .ask').length") == 2 and p.ev("document.querySelectorAll('.step .agent .checks li').length") == 10)
    p.ev("App.side('you'); 1"); you_only = p.ev("getComputedStyle(document.querySelector('.step .agent')).display") == "none" and p.ev("getComputedStyle(document.querySelector('.step .you')).display") != "none"
    p.ev("App.side('agent'); 1"); agent_only = p.ev("getComputedStyle(document.querySelector('.step .you')).display") == "none" and p.ev("getComputedStyle(document.querySelector('.step .agent')).display") != "none"
    p.ev("App.side('both'); 1"); both = p.ev("getComputedStyle(document.querySelector('.step .you')).display") != "none" and p.ev("getComputedStyle(document.querySelector('.step .agent')).display") != "none"
    check(f"{vp} the toggle shows your page, your agent's, or both", you_only and agent_only and both)
    st = p.ev("App.stepText(4)")
    check(f"{vp} a copied step carries its context", "step 4 of 6" in st and "Steps 1 to 3 are done" in st and "Ask me before you act" in st and "Before moving on, check:" in st and "#/ideas/doorman" in st, st[:100])
    ho = p.ev("App.handoff('doorman')")
    check(f"{vp} the whole guide hands over in one sentence", "ideas/doorman.md" in ho and '"agent:"' in ho and "start with step 1" in ho)
    p.ev("App.activate(4); 1")
    check(f"{vp} the index lights the step you are reading", p.ev("App.state().activeIndex") == "4" and p.ev("document.querySelectorAll('.index .is-done').length") == 3
          and p.ev("document.querySelector('.step.is-active').dataset.step") == "4" and "step 4 of 6" in p.ev("document.querySelector('.index .now').textContent"))
    if wide:
        p.ev("document.querySelector('.index [data-jump=\"6\"]').click(); 1")
        p.wait(lambda: p.ev("App.state().activeIndex") == "6", timeout=4, what="index jump")
        check(f"{vp} the index jumps to a step", p.ev("App.state().activeIndex") == "6" and p.ev("location.hash") == "#/ideas/doorman")
    check(f"{vp} the agent panel is the other theme", p.ev("getComputedStyle(document.querySelector('.step .agent')).backgroundColor") != p.ev("getComputedStyle(document.body).backgroundColor")
          and p.ev("getComputedStyle(document.querySelector('.step .agent p')).color") == p.ev("getComputedStyle(document.querySelector('.step .agent')).color"))
    check(f"{vp} every command has a copy button", p.ev("document.querySelectorAll('pre.code .copy').length") >= 8)
    check(f"{vp} the foot carries the open-source line", "CC BY 4.0" in p.ev("document.querySelector('.p-foot').textContent") and p.ev("document.querySelector('.p-foot a[href$=\"doorman.md\"]') !== null") and "fork this idea" in p.ev("document.querySelector('.p-foot').textContent"))
    p.go("#/ideas/hallway")
    s = p.ev("App.state()")
    check(f"{vp} a note is just the text, one column", s["kind"] == "note" and s["steps"] == 0 and s["agents"] == 0 and s["indexed"] == 0 and p.ev("document.querySelectorAll('.actions .btn.primary').length") == 0 and p.ev("document.querySelectorAll('.controls').length") == 0
          and p.ev("getComputedStyle(document.querySelector('.body')).gridTemplateColumns.split(' ').length") == 1, str(s["kind"]))
    p.go("#/agents")
    check(f"{vp} the for-agents page lists the twins and the skill", p.ev("document.querySelectorAll('.twins li').length") == 4 and "llms.txt" in p.ev("document.getElementById('view').textContent")
          and "start with step 1" in p.ev("document.getElementById('handoff-example').textContent") and p.ev("document.querySelector('.menu a[aria-current=\"page\"]').dataset.nav") == "agents")
    check(f"{vp} a plain page uses the width beside an index of its sections", p.ev("document.querySelectorAll('.plain .index [data-step]').length") == 4
          and p.ev("document.querySelector('.plain .body-copy').getBoundingClientRect().width") >= (700 if wide else 250) and p.ev("document.querySelectorAll('.body-copy h2[id^=sec-]').length") == 4)
    p.go("#/about")
    check(f"{vp} the about page names the three verbs", p.ev("document.querySelectorAll('.verbs li').length") == 3 and "Install" in p.ev("document.querySelector('.verbs').textContent")
          and p.ev("document.querySelectorAll('.plain .index [data-step]').length") == 4)
    p.go("#/ideas/nope")
    check(f"{vp} a missing idea says so", "isn't in the catalogue" in p.ev("document.getElementById('view').textContent"))
    check(f"{vp} post no overflow", not p.overflow())


def theme(p, vp):
    p.load("/")
    p.ev("App.theme('dark'); 1"); dark_bg = p.ev("getComputedStyle(document.body).backgroundColor"); dark_attr = p.ev("document.documentElement.dataset.theme")
    p.ev("App.theme('light'); 1"); light_bg = p.ev("getComputedStyle(document.body).backgroundColor")
    p.ev("App.theme('system'); 1"); sys_attr = p.ev("document.documentElement.dataset.theme || 'none'")
    check(f"{vp} the theme control paints both themes", dark_attr == "dark" and dark_bg == "rgb(11, 26, 25)" and light_bg == "rgb(235, 243, 241)" and sys_attr == "none", f"{dark_bg} {light_bg}")
    p.ev("App.theme('dark'); 1"); p.load("/")
    check(f"{vp} the theme choice survives a reload", p.ev("App.state().theme") == "dark" and p.ev("document.getElementById('s-theme').textContent") == "dark")
    # under a dark system with no choice, the page is dark; an explicit light choice beats it
    p.ev("App.theme('system'); 1"); p.emulate(int(vp.split("x")[0]), int(vp.split("x")[1]), dark=True); p.load("/")
    auto_dark = p.ev("getComputedStyle(document.body).backgroundColor")
    p.ev("App.theme('light'); 1"); forced_light = p.ev("getComputedStyle(document.body).backgroundColor")
    p.ev("App.theme('system'); 1"); p.emulate(int(vp.split("x")[0]), int(vp.split("x")[1]), dark=False)
    check(f"{vp} auto follows the system and an explicit choice beats it", auto_dark == "rgb(11, 26, 25)" and forced_light == "rgb(235, 243, 241)", f"{auto_dark} {forced_light}")
    # small text stays readable in the dark: the muted token against the ground
    p.ev("App.theme('dark'); 1")
    muted = p.ev("getComputedStyle(document.querySelector('.count')).color")
    p.ev("App.theme('system'); 1")
    check(f"{vp} dark secondary text is the lifted token", muted == "rgb(159, 187, 182)", muted)


def shots(p):
    out = ROOT / "qa"; out.mkdir(exist_ok=True)
    p.emulate(1440, 900); p.load("/"); p.ev("App.theme('light'); 1"); time.sleep(.3); p.shot(out / "home-light.png")
    p.ev("App.theme('dark'); 1"); time.sleep(.3); p.shot(out / "home-dark.png")
    p.go("#/ideas/doorman"); p.ev("window.scrollTo(0, document.getElementById('step-1').offsetTop - 140); App.activate(1); 1"); time.sleep(.3); p.shot(out / "post-dark.png")
    p.ev("App.theme('light'); 1"); time.sleep(.3); p.shot(out / "post-light.png")
    p.ev("window.scrollTo(0, 0); 1"); time.sleep(.2); p.shot(out / "post-head-light.png")
    p.emulate(390, 844); p.load("/"); p.ev("App.theme('dark'); 1"); time.sleep(.3); p.shot(out / "home-phone-dark.png")
    p.ev("App.theme('system'); 1")
    print("shots written to qa/")


def _debug_ready():
    try:
        urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=.2).read()
        return True
    except Exception:
        return False


def _http_ready(timeout=1.0):
    try:
        urlopen(f"{BASE}/index.json", timeout=timeout).read()
        return True
    except Exception:
        return False


def main():
    # a local server, unless one is already answering; always stopped again, whatever happens after
    server = None
    if not _http_ready(.5):
        server = subprocess.Popen([sys.executable, "-m", "http.server", str(HTTP), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        started = time.time()
        while not _http_ready():
            if server.poll() is not None:
                raise SystemExit("the local server died: " + (server.stderr.read() or "").strip().splitlines()[-1:][0] if server.stderr else "the local server died")
            if time.time() - started > 12:
                server.terminate()
                raise SystemExit(f"the local server did not answer on {HTTP} within 12s")
            time.sleep(.2)
    try:
        run_suite()
    finally:
        if server:
            server.terminate(); server.wait(timeout=5)
    if failures:
        raise SystemExit("browser QA failed: " + "; ".join(failures))
    print("browser QA ok")


def run_suite():
    with tempfile.TemporaryDirectory(prefix="ideasos-chrome-") as profile:
        browser = subprocess.Popen([CHROME, "--headless=new", "--no-first-run", "--hide-scrollbars", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}", "--remote-allow-origins=*", "about:blank"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            started = time.time()
            while not (browser.poll() is None and _debug_ready()):
                if time.time() - started > 10:
                    raise SystemExit("chrome did not start")
                time.sleep(.1)
            tabs = json.load(urlopen(f"http://127.0.0.1:{PORT}/json"))
            cdp = CDP(next(tab["webSocketDebuggerUrl"] for tab in tabs if tab["type"] == "page"))
            cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
            page = Page(cdp)
            for width, height in VIEWPORTS:
                vp = f"{width}x{height}"
                page.emulate(width, height)
                for scenario in (home, post, theme):
                    scenario(page, vp)
            if SHOTS:
                shots(page)
            check("no console errors", not cdp.console_errors, "; ".join(cdp.console_errors[:5]))
        finally:
            browser.terminate(); browser.wait(timeout=5)


if __name__ == "__main__":
    main()
