# ideasos

Open source ideas for working with agents, at ideasos.io. Static: HTML + CSS + vanilla JS, no build for the site itself, hash routes. Owner: the brand is ideasos; every byline is the brand and the copy names no people (validator enforces). Production updates only when a commit lands on `main`: GitHub Actions publishes it. Do not rsync from a session. SSH to the server is break-glass only.

## Shape

- `index.html` shell → `src/app.js` renders everything from `index.json` (the catalogue) and `ideas/*.md`. `src/app.css` carries both themes as tokens in the three-state pattern (bare `:root` light; `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])`; `:root[data-theme="dark"]`). Every token must be declared in the bare `:root` and redefined in both dark blocks (validator).
- Three kinds, one verb each: guide → Install (a generated `skills/<slug>/SKILL.md`), howto → Send to your agent, note → Open. A guide is a file with `agent:` blocks; a file without them is a how-to or a note. The validator refuses a mismatch.
- The agent's page is always the other theme (`--agent-*` tokens). **A post is one column, 960px, as wide as its head — nothing sits beside it.** The wiring drawing and then a step index were each tried beside the steps on 2026-09-09 and the owner rejected both as narrowing the post; the validator refuses any sidebar. `wire:`/`lanes:`/`flow:` in a file are ignored.
- Theme in `localStorage["ideasos-theme"]`. There is no "switched on" state: the power button on cards was dropped on 2026-09-09 as a bookmark nobody asked for; the validator refuses its return.
- Bump `?v=N` on `src/app.css` / `src/app.js` in `index.html` in the same commit as a change to them.

## Run and test

```bash
python3 -m http.server 8790
python3 scripts/build_skills.py && python3 scripts/validate.py && python3 scripts/qa.py
```

QA runs headless Chrome over CDP at three viewports (1440, 390, 320) against `http://127.0.0.1:8790`; never assert a transient value after a fixed sleep — wait on `window.App.state()`.

## Test hook

`App.state()` → `{ready, loaded, route, kind, slug, steps, active, side, theme, entries, live, shown, filter, q, agents, install, lastCopy}`; `App.go(hash)`, `App.run(line)`, `App.activate(n)`, `App.side(which)`, `App.theme(which)`, `App.stepText(n)`, `App.handoff(slug)`, `App.skill()`, `App.filter(k)`, `App.search(q)`.

## Deploying

Merging to `main` is the only deploy. The manual rsync path is retired. GitHub Actions job `validate` runs on pull requests and on pushes (catalogue check, site-file list, activator pin, pack self-test, activator `--self-test`, browser QA). Job `publish` runs only after `validate`, and only on a push to `main`, in a concurrency group that does not cancel an in-progress publish. It packs `index.html`, `index.json`, `llms.txt`, `src`, `ideas`, `skills`, and `assets` into a tarball and asks the root activator on VPS2 to swap the site. Do not rsync a release from a session. SSH is break-glass only; the one-time server setup and the rollback commands are `deploy/SERVER-SETUP.md`.

Production is still Caddy serving `/var/www/ideasos.io/current`. The activator writes `releases/<UTC timestamp>-<full sha>` (directories `755`, files `644`, owner `www-data`), records the sha in `.deploy-sha`, and points `current` at that relative path. A local Caddy check (`curl --resolve` to `127.0.0.1`) has to return the new `index.html` and `index.json` or the previous symlink is restored. Releases that predate Actions are full-sha directories and stay valid symlink targets. The activator keeps the five newest directories plus `current` and the previous target. It does not edit Caddy.
