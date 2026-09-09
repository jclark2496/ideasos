#!/usr/bin/env python3
"""Turn a guide into the file that runs it.

A guide whose steps carry `agent:` blocks is also a skill: this writes `skills/<slug>/SKILL.md` from the agent side of
every step, keeping the ask-first conditions, the checks and what to report, so `/<slug>` in Claude Code walks the
guide the way the agent's page would. Run with no arguments to write every skill; the validator imports `render`
to prove the shipped files match their sources.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IDEAS = ROOT / "ideas"
SKILLS = ROOT / "skills"
SITE = "https://ideasos.io/"


def front(text: str) -> tuple[dict, str]:
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).split("\n"):
            k = re.match(r"^([\w-]+):\s*(.*)$", line)
            if k:
                meta[k.group(1)] = k.group(2).strip()
    return meta, text[m.end():] if m else text


def steps_of(body: str) -> list[dict]:
    out = []
    for chunk in re.split(r"^## ", body, flags=re.M)[1:]:
        head, _, rest = chunk.partition("\n")
        title = re.sub(r"^\d+\.\s*", "", head.strip())
        rest = re.sub(r"^wire:.*\n", "", rest, flags=re.M)
        ai = re.search(r"^agent:\s*$", rest, re.M)
        agent = rest[ai.end():].strip() if ai else ""
        checks, confirm, report, do = [], [], [], []
        fence = False
        for line in agent.split("\n"):
            if line.startswith("```"):
                fence = not fence
            k = None if fence else re.match(r"^(check|confirm|report):\s*(.*)$", line)
            if k:
                {"check": checks, "confirm": confirm, "report": report}[k.group(1)].append(k.group(2))
            else:
                do.append(line)
        out.append({"title": title, "do": "\n".join(do).strip(), "checks": checks, "confirm": confirm, "report": report})
    return out


def render(text: str, slug: str, site: str = SITE) -> str | None:
    """The SKILL.md for one guide, or None when the guide has no agent pages to install."""
    meta, body = front(text)
    steps = steps_of(body)
    if not steps or not any(s["do"] for s in steps):
        return None
    n = len(steps)
    lines = [
        "---",
        f"name: {slug}",
        f"description: {meta.get('title', slug)}. {meta.get('summary', '').strip()}",
        "---",
        f"# {meta.get('title', slug)}",
        "",
        "Use this skill when the person you are working with wants to do what the title says. Work through the steps in order and do only what each step says. Run every line under Check before moving on and tell them what it printed. Any step marked ASK FIRST spends money, touches production or needs their finger: stop and ask before acting. After each step, report what its Report line asks for, in one line if you can.",
        "",
        f"Verified {meta.get('verified', 'not yet')}. The readable guide is {site}ideas/{slug}.md; this file is generated from it and should not be edited by hand.",
        "",
    ]
    for i, s in enumerate(steps, 1):
        lines.append(f"## Step {i} of {n}: {s['title']}")
        lines.append("")
        if s["confirm"]:
            lines.append("ASK FIRST: " + " ".join(s["confirm"]))
            lines.append("")
        lines.append(s["do"])
        lines.append("")
        if s["checks"]:
            lines.append("Check:")
            lines.extend(f"- {c}" for c in s["checks"])
            lines.append("")
        if s["report"]:
            lines.append("Report: " + " ".join(s["report"]))
            lines.append("")
    return "\n".join(lines).rstrip("\n") + "\n"


def build() -> list[Path]:
    written = []
    for md in sorted(IDEAS.glob("*.md")):
        skill = render(md.read_text(encoding="utf-8"), md.stem)
        if skill is None:
            continue
        out = SKILLS / md.stem / "SKILL.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(skill, encoding="utf-8")
        written.append(out)
    return written


if __name__ == "__main__":
    for path in build():
        print("wrote", path.relative_to(ROOT), path.stat().st_size, "bytes")
    sys.exit(0)
