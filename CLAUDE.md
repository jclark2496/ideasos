# ideasos

Open source ideas for working with agents, at ideasos.io. Static: HTML + CSS + vanilla JS, no build for the site itself, hash routes. Owner: the brand is ideasos; every byline is the brand and the copy names no people (validator enforces). Deploys are done by the owner through Hermes using prompts Claude writes; never deploy from a session.

## Shape

- `index.html` shell → `src/app.js` renders everything from `index.json` (the catalogue) and `ideas/*.md`. `src/app.css` carries both themes as tokens in the three-state pattern (bare `:root` light; `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])`; `:root[data-theme="dark"]`). Every token must be declared in the bare `:root` and redefined in both dark blocks (validator).
- Three kinds, one verb each: guide → Install (a generated `skills/<slug>/SKILL.md`), howto → Send to your agent, note → Open. A guide is a file with `agent:` blocks; a file without them is a how-to or a note. The validator refuses a mismatch.
- The agent's page is always the other theme (`--agent-*` tokens). A guide's steps are listed in a sticky index beside them (`.index`, lit by `activate(n)`); the wiring drawing from the Longwire study was removed on 2026-09-09 as not useful and narrowing the post — do not bring it back. `wire:`/`lanes:`/`flow:` in a file are ignored.
- Theme in `localStorage["ideasos-theme"]`. There is no "switched on" state: the power button on cards was dropped on 2026-09-09 as a bookmark nobody asked for; the validator refuses its return.
- Bump `?v=N` on `src/app.css` / `src/app.js` in `index.html` in the same commit as a change to them.

## Run and test

```bash
python3 -m http.server 8790
python3 scripts/build_skills.py && python3 scripts/validate.py && python3 scripts/qa.py
```

QA runs headless Chrome over CDP at three viewports (1440, 390, 320) against `http://127.0.0.1:8790`; never assert a transient value after a fixed sleep — wait on `window.App.state()`.

## Test hook

`App.state()` → `{ready, loaded, route, kind, slug, steps, active, side, theme, entries, live, shown, filter, q, agents, indexed, activeIndex, install, lastCopy}`; `App.go(hash)`, `App.run(line)`, `App.activate(n)`, `App.side(which)`, `App.theme(which)`, `App.stepText(n)`, `App.handoff(slug)`, `App.skill()`, `App.filter(k)`, `App.search(q)`.

## Deploying (the owner runs it via Hermes)

Production: VPS2 `root@2.25.183.70`, Caddy. `/var/www/ideasos.io/releases/<full sha>` with a `current` symlink Caddy serves; rsync `index.html index.json llms.txt src ideas skills assets` into the release; chown www-data, dirs 755 files 644; `ln -sfn` atomically; curl checks against unique strings (`grep -c` counts lines and exits 1 on zero). Rollback is re-pointing the symlink; never delete releases.
